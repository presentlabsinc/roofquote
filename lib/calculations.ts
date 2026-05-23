import type { ScopeFlags } from "./types";
import type { PricingSettings } from "@/app/generated/prisma/client";

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

export function buildLineItems(
  settings: PricingSettings,
  areaM2: number,
  scope: ScopeFlags,
  workerCount: number,
  workDays: number,
  gutterLengthM: number,
  skyliftDays: number,
  ladderTruckDays: number,
): LineItemDraft[] {
  const items: LineItemDraft[] = [];
  let order = 0;

  // Material: 칼라강판
  if (scope.colorSteel) {
    const unitPrice = settings.materialPricePerSqm;
    const total = Math.round(areaM2 * unitPrice);
    items.push({ category: "material", name: "칼라강판", quantity: areaM2, unit: "㎡", unitPrice, total, sortOrder: order++ });

    // Accessory material
    const accessoryTotal = Math.round(total * settings.accessoryRate);
    items.push({ category: "material", name: "부자재", quantity: settings.accessoryRate * 100, unit: "%", unitPrice: total, total: accessoryTotal, sortOrder: order++ });
  }

  // Ridge
  if (scope.ridge) {
    const ridgeLength = Math.round(Math.sqrt(areaM2) * 0.8); // estimated
    const unitPrice = settings.ridgePricePerM;
    items.push({ category: "material", name: "용마루 마감", quantity: ridgeLength, unit: "m", unitPrice, total: Math.round(ridgeLength * unitPrice), sortOrder: order++ });
  }

  // Eave
  if (scope.eave) {
    const eaveLength = Math.round(Math.sqrt(areaM2) * 2); // estimated perimeter portion
    const unitPrice = settings.eavePricePerM;
    items.push({ category: "material", name: "처마 마감", quantity: eaveLength, unit: "m", unitPrice, total: Math.round(eaveLength * unitPrice), sortOrder: order++ });
  }

  // Gutter
  if (scope.gutter && gutterLengthM > 0) {
    const unitPrice = settings.gutterPricePerM;
    items.push({ category: "material", name: "물받이 교체", quantity: gutterLengthM, unit: "m", unitPrice, total: Math.round(gutterLengthM * unitPrice), sortOrder: order++ });
  }

  // Removal
  if (scope.removal) {
    const unitPrice = settings.removalPricePerSqm;
    items.push({ category: "removal", name: "기존 지붕 철거", quantity: areaM2, unit: "㎡", unitPrice, total: Math.round(areaM2 * unitPrice), sortOrder: order++ });
  }

  // Waste disposal
  if (scope.waste) {
    items.push({ category: "waste", name: "폐기물 처리", quantity: 1, unit: "식", unitPrice: settings.wasteDisposalCost, total: settings.wasteDisposalCost, sortOrder: order++ });
  }

  // Labor
  const laborQty = workerCount * workDays;
  const laborUnitPrice = settings.dailyWage;
  items.push({ category: "labor", name: "인건비", quantity: laborQty, unit: "명·일", unitPrice: laborUnitPrice, total: Math.round(laborQty * laborUnitPrice), sortOrder: order++ });

  // Equipment
  if (scope.skylift && skyliftDays > 0) {
    const unitPrice = settings.skyliftDailyCost;
    items.push({ category: "equipment", name: "스카이차", quantity: skyliftDays, unit: "일", unitPrice, total: Math.round(skyliftDays * unitPrice), sortOrder: order++ });
  }
  if (scope.ladderTruck && ladderTruckDays > 0) {
    const unitPrice = settings.ladderTruckDailyCost;
    items.push({ category: "equipment", name: "사다리차", quantity: ladderTruckDays, unit: "일", unitPrice, total: Math.round(ladderTruckDays * unitPrice), sortOrder: order++ });
  }

  // Transport
  items.push({ category: "transport", name: "운송비", quantity: 1, unit: "식", unitPrice: settings.baseTransportCost, total: settings.baseTransportCost, sortOrder: order++ });

  // Meals
  const mealQty = workerCount * workDays;
  const mealUnitPrice = settings.mealCostPerPersonMeal;
  items.push({ category: "meals", name: "식비", quantity: mealQty, unit: "명·일", unitPrice: mealUnitPrice, total: Math.round(mealQty * mealUnitPrice), sortOrder: order++ });

  // Lodging (only if workDays > 1)
  if (workDays > 1) {
    const lodgingNights = Math.floor(workDays - 1);
    const lodgingQty = workerCount * lodgingNights;
    const lodgingUnitPrice = settings.lodgingCostPerPersonNight;
    items.push({ category: "lodging", name: "숙박비", quantity: lodgingQty, unit: "명·박", unitPrice: lodgingUnitPrice, total: Math.round(lodgingQty * lodgingUnitPrice), sortOrder: order++ });
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
    // finalPrice = supplyPrice * 1.1
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
