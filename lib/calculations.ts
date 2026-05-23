import type { ConstructionType, MaterialType, ScopeFlags, Thickness } from "./types";
import { MATERIAL_TYPES } from "./types";
import type { PricingSettings } from "@prisma/client";

export interface LineItemDraft {
  category: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  sortOrder: number;
}

export interface EstimateCalculation {
  lineItems: LineItemDraft[];
  totalCost: number;
  marginRate: number;
  marginAmount: number;
  supplyPrice: number;
  vat: number;
  finalPrice: number;
}

/**
 * Thickness multipliers — base price is for 0.45t.
 * Used as a simple linear adjustment until we add a proper price matrix.
 */
const THICKNESS_MULT: Record<Thickness, number> = {
  "0.4": 0.92,
  "0.45": 1.00,
  "0.5": 1.08,
  "0.6": 1.22,
};

function materialLabel(type: MaterialType | null | undefined): string {
  if (!type) return "칼라강판";
  return MATERIAL_TYPES.find((m) => m.value === type)?.label ?? "칼라강판";
}

function constructionLabel(type: ConstructionType): string {
  if (type === "steelWaterproof") return "옥상 스틸방수";
  if (type === "rooftopRoof") return "옥상지붕";
  return "지붕";
}

export function buildLineItems(
  settings: PricingSettings,
  constructionType: ConstructionType,
  materialType: MaterialType | null,
  thickness: Thickness | null,
  areaM2: number,
  scope: ScopeFlags,
  workerCount: number,
  workDays: number,
  gutterLengthM: number,
  skyliftDays: number,
  ladderTruckDays: number,
  scaffoldDays: number,
): LineItemDraft[] {
  const items: LineItemDraft[] = [];
  let order = 0;

  // Material line — always the main one
  {
    const mult = thickness ? THICKNESS_MULT[thickness] : 1;
    const unitPrice = Math.round(settings.materialPricePerSqm * mult);
    const name = `${materialLabel(materialType)}${thickness ? ` ${thickness}t` : ""} ${constructionLabel(constructionType)} 시공`;
    items.push({
      category: "material", name, quantity: areaM2, unit: "㎡", unitPrice,
      total: Math.round(areaM2 * unitPrice), sortOrder: order++,
    });

    // Accessory material
    const matTotal = Math.round(areaM2 * unitPrice);
    const accessoryTotal = Math.round(matTotal * settings.accessoryRate);
    items.push({
      category: "material", name: "부자재", quantity: settings.accessoryRate * 100,
      unit: "%", unitPrice: matTotal, total: accessoryTotal, sortOrder: order++,
    });
  }

  // Ridge / Eave — only for roof / rooftopRoof
  if (constructionType !== "steelWaterproof") {
    if (scope.ridge) {
      const ridgeLength = Math.round(Math.sqrt(areaM2) * 0.8);
      items.push({
        category: "material", name: "용마루 마감", quantity: ridgeLength, unit: "m",
        unitPrice: settings.ridgePricePerM, total: Math.round(ridgeLength * settings.ridgePricePerM),
        sortOrder: order++,
      });
    }
    if (scope.eave) {
      const eaveLength = Math.round(Math.sqrt(areaM2) * 2);
      items.push({
        category: "material", name: "처마 마감", quantity: eaveLength, unit: "m",
        unitPrice: settings.eavePricePerM, total: Math.round(eaveLength * settings.eavePricePerM),
        sortOrder: order++,
      });
    }
    if (scope.gutter && gutterLengthM > 0) {
      items.push({
        category: "material", name: "물받이 교체", quantity: gutterLengthM, unit: "m",
        unitPrice: settings.gutterPricePerM, total: Math.round(gutterLengthM * settings.gutterPricePerM),
        sortOrder: order++,
      });
    }
  }

  // Removal — roof only
  if (constructionType === "roof" && scope.removal) {
    items.push({
      category: "removal", name: "기존 지붕 철거", quantity: areaM2, unit: "㎡",
      unitPrice: settings.removalPricePerSqm, total: Math.round(areaM2 * settings.removalPricePerSqm),
      sortOrder: order++,
    });
  }

  // Frame reinforcement — rooftopRoof only
  if (constructionType === "rooftopRoof" && scope.frameReinforcement) {
    // No dedicated unit price; bill at 1 lump-sum derived from material price × area × 0.3
    const lumpSum = Math.round(areaM2 * settings.materialPricePerSqm * 0.3);
    items.push({
      category: "other", name: "골조 보강", quantity: 1, unit: "식",
      unitPrice: lumpSum, total: lumpSum, sortOrder: order++,
    });
  }

  // Steel-waterproof-specific items
  if (constructionType === "steelWaterproof") {
    if (scope.handrailAndCap) {
      const perimeter = Math.round(Math.sqrt(areaM2) * 4);
      items.push({
        category: "material", name: "난간 및 두겁", quantity: perimeter, unit: "m",
        unitPrice: settings.eavePricePerM, total: Math.round(perimeter * settings.eavePricePerM),
        sortOrder: order++,
      });
    }
    if (scope.existingWaterproofRemoval) {
      items.push({
        category: "removal", name: "기존 방수재 철거", quantity: areaM2, unit: "㎡",
        unitPrice: settings.removalPricePerSqm, total: Math.round(areaM2 * settings.removalPricePerSqm),
        sortOrder: order++,
      });
    }
    if (scope.drainage) {
      const lumpSum = Math.round(settings.wasteDisposalCost * 0.5);
      items.push({
        category: "other", name: "배수구 처리", quantity: 1, unit: "식",
        unitPrice: lumpSum, total: lumpSum, sortOrder: order++,
      });
    }
  }

  // Waste disposal
  if (scope.waste) {
    items.push({
      category: "waste", name: "폐기물 처리", quantity: 1, unit: "식",
      unitPrice: settings.wasteDisposalCost, total: settings.wasteDisposalCost, sortOrder: order++,
    });
  }

  // Labor
  const laborQty = workerCount * workDays;
  items.push({
    category: "labor", name: "인건비", quantity: laborQty, unit: "명·일",
    unitPrice: settings.dailyWage, total: Math.round(laborQty * settings.dailyWage),
    sortOrder: order++,
  });

  // Equipment by days
  if (scope.skylift && skyliftDays > 0) {
    items.push({
      category: "equipment", name: "스카이차", quantity: skyliftDays, unit: "일",
      unitPrice: settings.skyliftDailyCost, total: Math.round(skyliftDays * settings.skyliftDailyCost),
      sortOrder: order++,
    });
  }
  if (scope.ladderTruck && ladderTruckDays > 0) {
    items.push({
      category: "equipment", name: "사다리차", quantity: ladderTruckDays, unit: "일",
      unitPrice: settings.ladderTruckDailyCost, total: Math.round(ladderTruckDays * settings.ladderTruckDailyCost),
      sortOrder: order++,
    });
  }
  if (scope.scaffold && scaffoldDays > 0) {
    items.push({
      category: "equipment", name: "비계", quantity: scaffoldDays, unit: "일",
      unitPrice: settings.scaffoldDailyCost, total: Math.round(scaffoldDays * settings.scaffoldDailyCost),
      sortOrder: order++,
    });
  }

  // Transport
  items.push({
    category: "transport", name: "운송비", quantity: 1, unit: "식",
    unitPrice: settings.baseTransportCost, total: settings.baseTransportCost, sortOrder: order++,
  });

  // Meals
  const mealQty = workerCount * workDays;
  items.push({
    category: "meals", name: "식비", quantity: mealQty, unit: "명·일",
    unitPrice: settings.mealCostPerPersonMeal, total: Math.round(mealQty * settings.mealCostPerPersonMeal),
    sortOrder: order++,
  });

  // Lodging
  if (workDays > 1) {
    const nights = Math.floor(workDays - 1);
    const lodgingQty = workerCount * nights;
    items.push({
      category: "lodging", name: "숙박비", quantity: lodgingQty, unit: "명·박",
      unitPrice: settings.lodgingCostPerPersonNight, total: Math.round(lodgingQty * settings.lodgingCostPerPersonNight),
      sortOrder: order++,
    });
  }

  return items;
}

export function calcTotals(
  lineItems: { total: number }[],
  marginRate: number,
  vatIncluded: boolean,
): { totalCost: number; marginAmount: number; supplyPrice: number; vat: number; finalPrice: number } {
  const totalCost = lineItems.reduce((s, i) => s + i.total, 0);
  const marginAmount = Math.round(totalCost * marginRate);
  const supplyPrice = totalCost + marginAmount;
  const vat = Math.round(supplyPrice * 0.1);
  const finalPrice = vatIncluded ? supplyPrice + vat : supplyPrice;
  return { totalCost, marginAmount, supplyPrice, vat, finalPrice };
}

export function calcFromFinalPrice(
  totalCost: number,
  finalPrice: number,
  vatIncluded: boolean,
): { marginAmount: number; supplyPrice: number; vat: number; marginRate: number } {
  let supplyPrice: number;
  let vat: number;
  if (vatIncluded) {
    supplyPrice = Math.round(finalPrice / 1.1);
    vat = finalPrice - supplyPrice;
  } else {
    supplyPrice = finalPrice;
    vat = Math.round(supplyPrice * 0.1);
  }
  const marginAmount = supplyPrice - totalCost;
  const marginRate = totalCost > 0 ? marginAmount / totalCost : 0;
  return { marginAmount, supplyPrice, vat, marginRate };
}

export function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

export function sqmToPyeong(sqm: number): number {
  return Math.round((sqm / 3.3058) * 100) / 100;
}

export function pyeongToSqm(pyeong: number): number {
  return Math.round(pyeong * 3.3058 * 100) / 100;
}
