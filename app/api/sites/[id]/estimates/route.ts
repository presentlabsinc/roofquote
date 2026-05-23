import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildLineItems, calcTotals } from "@/lib/calculations";
import type { ConstructionType, ExtraCost, MaterialType, ScopeFlags, Thickness } from "@/lib/types";
import type { PricingSettings } from "@prisma/client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: siteId } = await params;
  const body = await req.json();

  const settings: PricingSettings | null = await prisma.pricingSettings.findFirst();
  if (!settings) {
    return NextResponse.json({ error: "단가 설정이 없습니다. 먼저 단가 설정을 완료해 주세요." }, { status: 400 });
  }

  const {
    constructionType = "roof",
    materialType = null,
    materialThickness = "0.45",
    materialColor = null,
    areaM2,
    buildingAreaM2 = null,
    workerCount,
    workDays,
    gutterLengthM = 0,
    skyliftDays = 0,
    ladderTruckDays = 0,
    scaffoldDays = 0,
    otherEquipment = null,
    scopeFlags,
    extraCosts = [],
    applyLossRate = false,
    lossRate = null,
    marginRate: inputMarginRate,
    vatIncluded,
    paymentTerms,
    validityDays,
  } = body;

  const scope: ScopeFlags = scopeFlags ?? {};
  const marginRate = inputMarginRate ?? settings.defaultMarginRate;
  const vatIncl = vatIncluded ?? settings.vatIncludedByDefault;
  const effectiveLossRate = lossRate ?? settings.defaultLossRate;

  const lineItemDrafts = buildLineItems({
    settings,
    constructionType: constructionType as ConstructionType,
    materialType: materialType as MaterialType | null,
    thickness: materialThickness as Thickness | null,
    areaM2,
    scope,
    workerCount,
    workDays,
    gutterLengthM,
    skyliftDays,
    ladderTruckDays,
    scaffoldDays,
    extraCosts: extraCosts as ExtraCost[],
    applyLossRate,
    lossRate: effectiveLossRate,
  });

  const totals = calcTotals(lineItemDrafts, marginRate, vatIncl);

  const estimate = await prisma.estimate.create({
    data: {
      siteId,
      constructionType,
      materialType,
      materialThickness,
      materialColor,
      areaM2,
      buildingAreaM2: buildingAreaM2 || null,
      workerCount,
      workDays,
      gutterLengthM: gutterLengthM || null,
      skyliftDays: skyliftDays || null,
      ladderTruckDays: ladderTruckDays || null,
      scaffoldDays: scaffoldDays || null,
      otherEquipment,
      scopeFlags: scope as object,
      applyLossRate,
      lossRate: applyLossRate ? effectiveLossRate : null,
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
