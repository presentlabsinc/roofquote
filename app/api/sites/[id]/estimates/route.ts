import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";
import { buildLineItems, calcTotals } from "@/lib/calculations";
import type { BuildingShape, ConstructionType, ExtraCost, GutterMode, MaterialType, PricingOverrides, RoofShape, ScopeFlags, SubstructureType, Thickness } from "@/lib/types";
import type { CatalogSelection, CategoryModesMap } from "@/lib/catalog";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireUserAndSettings();
  const { id: siteId } = await params;
  const body = await req.json();

  // Ownership check — can't create an estimate for someone else's site.
  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 견적 번호 자동 생성 — "YYYY-NNN" (연도별 카운터, 3자리 패딩).
  // Scoped to the user so number sequences don't leak between accounts.
  // estimateNumberStart from settings lets the user shift the starting
  // number (e.g. start at 100 if migrating from another system).
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const countThisYear = await prisma.estimate.count({
    where: { createdAt: { gte: yearStart, lt: yearEnd }, site: { userId: user.id } },
  });
  const seq = (settings.estimateNumberStart ?? 1) + countThisYear;
  const estimateNumber = `${year}-${String(seq).padStart(3, "0")}`;

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
    stainlessDrainLengthM = 0,
    capLengthM = 0,
    drainHoleCount = 0,
    endCapCount = 0,
    skyliftDays = 0,
    ladderTruckDays = 0,
    scaffoldDays = 0,
    scaffoldAreaM2 = 0,
    wasteTruckCount = 1,
    substructureType = null,
    otherEquipment = null,
    scopeFlags,
    extraCosts = [],
    pricingOverrides = {},
    catalogSelections = [],
    catalogModes = {},
    applyLossRate = false,
    lossRate = null,
    buildingShape = null,
    roofShape = null,
    perimeterM = null,
    ridgeCount = 1,
    parapetHeightCm = null,
    hasInsulation = false,
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
    stainlessDrainLengthM,
    capLengthM,
    drainHoleCount,
    endCapCount,
    skyliftDays,
    ladderTruckDays,
    scaffoldDays,
    scaffoldAreaM2,
    wasteTruckCount,
    substructureType: substructureType as SubstructureType | null,
    extraCosts: extraCosts as ExtraCost[],
    pricingOverrides: pricingOverrides as PricingOverrides,
    catalogSelections: catalogSelections as CatalogSelection[],
    catalogModes: catalogModes as CategoryModesMap,
    applyLossRate,
    lossRate: effectiveLossRate,
    buildingShape: buildingShape as BuildingShape | null,
    roofShape: roofShape as RoofShape | null,
    buildingAreaM2: buildingAreaM2 ?? null,
    perimeterM,
    ridgeCount,
    parapetHeightCm,
    hasInsulation,
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
      stainlessDrainLengthM: stainlessDrainLengthM || null,
      capLengthM: capLengthM || null,
      drainHoleCount: drainHoleCount || 0,
      endCapCount: endCapCount || 0,
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
      buildingShape: buildingShape || null,
      roofShape: roofShape || null,
      perimeterM: perimeterM || null,
      ridgeCount: ridgeCount || 1,
      parapetHeightCm: parapetHeightCm || null,
      hasInsulation: !!hasInsulation,
      catalogSelections: (catalogSelections as CatalogSelection[])
        .filter((s) => s.quantity > 0) as unknown as object,
      catalogModes: catalogModes as object,
      pricingOverrides: pricingOverrides as object,
      totalCost: totals.totalCost,
      marginMode: "percent",
      marginRate,
      marginAmount: totals.marginAmount,
      supplyPrice: totals.supplyPrice,
      vat: totals.vat,
      finalPrice: totals.finalPrice,
      vatIncluded: vatIncl,
      paymentTerms: paymentTerms ?? "계약금 10% / 잔금 90%",
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
