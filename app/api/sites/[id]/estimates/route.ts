import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildLineItems, calcTotals } from "@/lib/calculations";
import type { ScopeFlags } from "@/lib/types";
import type { PricingSettings } from "@/app/generated/prisma/client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: siteId } = await params;
  const body = await req.json();

  const settings: PricingSettings | null = await prisma.pricingSettings.findFirst();
  if (!settings) {
    return NextResponse.json({ error: "단가 설정이 없습니다. 먼저 단가 설정을 완료해 주세요." }, { status: 400 });
  }

  const {
    areaM2,
    workerCount,
    workDays,
    gutterLengthM = 0,
    skyliftDays = 0,
    ladderTruckDays = 0,
    scopeFlags,
    marginRate: inputMarginRate,
    vatIncluded,
    paymentTerms,
    validityDays,
  } = body;

  const scope: ScopeFlags = scopeFlags;
  const marginRate = inputMarginRate ?? settings.defaultMarginRate;
  const vatIncl = vatIncluded ?? settings.vatIncludedByDefault;

  const lineItemDrafts = buildLineItems(
    settings,
    areaM2,
    scope,
    workerCount,
    workDays,
    gutterLengthM,
    skyliftDays,
    ladderTruckDays,
  );

  const totals = calcTotals(lineItemDrafts, marginRate, vatIncl);

  const estimate = await prisma.estimate.create({
    data: {
      siteId,
      areaM2,
      workerCount,
      workDays,
      gutterLengthM: gutterLengthM || null,
      skyliftDays: skyliftDays || null,
      ladderTruckDays: ladderTruckDays || null,
      scopeFlags: JSON.stringify(scope),
      totalCost: totals.totalCost,
      marginMode: "percent",
      marginRate,
      marginAmount: totals.marginAmount,
      supplyPrice: totals.supplyPrice,
      vat: totals.vat,
      finalPrice: totals.finalPrice,
      vatIncluded: vatIncl,
      paymentTerms: paymentTerms ?? "계약금 30% / 잔금 70%",
      validityDays: validityDays ?? 30,
      companyNameSnapshot: settings.companyName,
      companyPhoneSnapshot: settings.companyPhone ?? null,
      companyAddressSnapshot: settings.companyAddress ?? null,
      lineItems: {
        create: lineItemDrafts,
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return NextResponse.json(estimate, { status: 201 });
}
