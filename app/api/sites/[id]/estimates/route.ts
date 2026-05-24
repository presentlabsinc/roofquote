import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildLineItems, calcTotals } from "@/lib/calculations";
import type { ConstructionType, ExtraCost, GutterMode, MaterialType, ScopeFlags, SubstructureType, Thickness } from "@/lib/types";
import type { CatalogSelection, CategoryModesMap } from "@/lib/catalog";
import type { PricingSettings } from "@prisma/client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: siteId } = await params;
  const body = await req.json();

  const settings: PricingSettings | null = await prisma.pricingSettings.findFirst();
  if (!settings) {
    return NextResponse.json({ error: "단가 설정이 없습니다. 먼저 단가 설정을 완료해 주세요." }, { status: 400 });
  }

  // 견적 번호 자동 생성 — "YYYY-NNN" (연도별 카운터, 3자리 패딩)
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const countThisYear = await prisma.estimate.count({
    where: { createdAt: { gte: yearStart, lt: yearEnd } },
  });
  const estimateNumber = `${year}-${String(countThisYear + 1).padStart(3, "0")}`;

  const {
    constructionType = "roof",
    materialType = null,
    materialThickness = "0.45",
    materialTexture = null,
    materialColor = null,
    constructionMonth = null,
    areaM2,
    buildingAreaM2 = null,
    workerCount,
    workDays,
    gutterMode = null,
    gutterLengthM = 0,
    capLengthM = 0,
    drainHoleCount = 0,
    skyliftDays = 0,
    ladderTruckDays = 0,
    scaffoldDays = 0,
    scaffoldAreaM2 = 0,
    wasteTruckCount = 1,
    substructureType = null,
    otherEquipment = null,
    scopeFlags,
    extraCosts = [],
    catalogSelections = [],
    catalogModes = {},
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
    gutterMode: gutterMode as GutterMode | null,
    gutterLengthM,
    capLengthM,
    drainHoleCount,
    skyliftDays,
    ladderTruckDays,
    scaffoldDays,
    scaffoldAreaM2,
    wasteTruckCount,
    substructureType: substructureType as SubstructureType | null,
    extraCosts: extraCosts as ExtraCost[],
    catalogSelections: catalogSelections as CatalogSelection[],
    catalogModes: catalogModes as CategoryModesMap,
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
      materialTexture,
      materialColor,
      constructionMonth,
      areaM2,
      buildingAreaM2: buildingAreaM2 || null,
      workerCount,
      workDays,
      gutterMode: gutterMode || null,
      gutterLengthM: gutterLengthM || null,
      capLengthM: capLengthM || null,
      drainHoleCount: drainHoleCount || 0,
      substructureType: substructureType || null,
      wasteTruckCount: wasteTruckCount || 1,
      scaffoldAreaM2: scaffoldAreaM2 || null,
      skyliftDays: skyliftDays || null,
      ladderTruckDays: ladderTruckDays || null,
      scaffoldDays: scaffoldDays || null,
      otherEquipment,
      scopeFlags: scope as object,
      applyLossRate,
      lossRate: applyLossRate ? effectiveLossRate : null,
      catalogSelections: (catalogSelections as CatalogSelection[])
        .filter((s) => s.quantity > 0) as unknown as object,
      catalogModes: catalogModes as object,
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
      estimateNumber,
      companyNameSnapshot: settings.companyName,
      companyPhoneSnapshot: settings.companyPhone ?? null,
      companyAddressSnapshot: settings.companyAddress ?? null,
      businessRegistrationNumberSnapshot: settings.businessRegistrationNumber ?? null,
      sealImageUrlSnapshot: settings.sealImageUrl ?? null,
      bankAccountSnapshot: settings.bankAccount ?? null,
      noticeTextSnapshot: settings.noticeText ?? null,
      lineItems: {
        create: lineItemDrafts,
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return NextResponse.json(estimate, { status: 201 });
}
