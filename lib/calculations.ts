import type { ConstructionType, ExtraCost, GutterMode, MaterialType, ScopeFlags, SubstructureType, Thickness } from "./types";
import { MATERIAL_TYPES } from "./types";
import { categoryToLineItemCategory, resolveCategoryDefaults, CATALOG_CATEGORIES, type CatalogCategory, type CatalogSelection, type CategoryMode, type CategoryModesMap } from "./catalog";
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

export interface BuildLineItemsInput {
  settings: PricingSettings;
  constructionType: ConstructionType;
  materialType: MaterialType | null;
  thickness: Thickness | null;
  areaM2: number;
  scope: ScopeFlags;
  workerCount: number;
  workDays: number;
  gutterMode?: GutterMode | null;
  gutterLengthM: number;
  capLengthM?: number;
  drainHoleCount?: number;
  skyliftDays: number;
  ladderTruckDays: number;
  scaffoldDays: number;
  scaffoldAreaM2?: number;
  /** 폐기물 트럭 수 (waste-disposal truck count); cost = wasteDisposalCost × truck count */
  wasteTruckCount?: number;
  /** 하지작업: null/undefined = 안함, 'wood' = 목재, 'steel' = 철재 */
  substructureType?: SubstructureType | null;
  extraCosts?: ExtraCost[];
  /** Catalog items the user picked with their quantities + snapshot prices.
   *  Only used for categories whose mode === "detailed". */
  catalogSelections?: CatalogSelection[];
  /** Per-category mode + simple-mode value. Falls back to PricingSettings.catalogDefaults
   *  (and ultimately DEFAULT_CATEGORY_MODES) when a category is missing. */
  catalogModes?: CategoryModesMap;
  /** When true, multiply material area by (1 + lossRate) */
  applyLossRate?: boolean;
  /** Loss rate to apply (e.g. 0.10 = 10%). Used only when applyLossRate is true. */
  lossRate?: number;
}

export function buildLineItems(input: BuildLineItemsInput): LineItemDraft[] {
  const {
    settings, constructionType, materialType, thickness,
    areaM2, scope, workerCount, workDays,
    gutterMode = null, gutterLengthM,
    capLengthM = 0, drainHoleCount = 0,
    skyliftDays, ladderTruckDays, scaffoldDays, scaffoldAreaM2 = 0,
    wasteTruckCount = 1, substructureType = null,
    extraCosts = [], catalogSelections = [], catalogModes,
    applyLossRate = false, lossRate = 0,
  } = input;

  // Resolve effective category modes by layering: defaults → settings → estimate override
  const settingsDefaults = (settings.catalogDefaults as CategoryModesMap | null) ?? null;
  const effectiveModes = resolveCategoryDefaults({
    ...settingsDefaults,
    ...(catalogModes ?? {}),
  });
  const items: LineItemDraft[] = [];
  let order = 0;

  // Material line — always the main one.
  // 시공면적은 사용자가 입력한 그대로 사용 (난간/두겁/창고/계단실/옥탑방은 시공면적에 포함된 것으로 가정).
  // Optional 자재 로스율 — 시공 시 자투리/낭비분을 반영하면 자재 면적이 증가.
  {
    const mult = thickness ? THICKNESS_MULT[thickness] : 1;
    const unitPrice = Math.round(settings.materialPricePerSqm * mult);
    const lossMult = applyLossRate && lossRate > 0 ? 1 + lossRate : 1;
    const effectiveArea = Math.round(areaM2 * lossMult * 100) / 100;
    const lossNote = applyLossRate && lossRate > 0
      ? ` (로스율 ${Math.round(lossRate * 100)}% 포함)`
      : "";
    const name = `${materialLabel(materialType)}${thickness ? ` ${thickness}t` : ""} ${constructionLabel(constructionType)} 시공${lossNote}`;
    items.push({
      category: "material", name, quantity: effectiveArea, unit: "㎡", unitPrice,
      total: Math.round(effectiveArea * unitPrice), sortOrder: order++,
    });
    // Note: 부자재 used to be auto-added here at materialTotal × accessoryRate.
    // That's now handled by the accessory catalog category (simple mode =
    // "percent" default 0.15). See "Catalog categories — simple/detailed" below.
  }

  // Compute material subtotal once — needed by simple-mode "percent" calculations
  const materialTotalForCategoryPercent = items
    .filter((i) => i.category === "material")
    .reduce((s, i) => s + i.total, 0);

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
  }

  // 물받이 — driven by gutterMode picker (안함/전체/앞만/뒤만), not scope flags
  if (gutterMode && gutterMode !== "none" && gutterLengthM > 0) {
    const modeLabel = gutterMode === "full" ? "전체" : gutterMode === "front" ? "앞만" : "뒤만";
    items.push({
      category: "material", name: `물받이 교체 (${modeLabel})`, quantity: gutterLengthM, unit: "m",
      unitPrice: settings.gutterPricePerM, total: Math.round(gutterLengthM * settings.gutterPricePerM),
      sortOrder: order++,
    });
  }

  // 하지작업 (substructure) — wood or steel, priced per ㎡ of construction area
  if (substructureType) {
    const sUnit = substructureType === "wood"
      ? settings.substructureWoodPricePerSqm
      : settings.substructureSteelPricePerSqm;
    const sLabel = substructureType === "wood" ? "목재 하지" : "철재 하지";
    items.push({
      category: "material", name: sLabel, quantity: areaM2, unit: "㎡",
      unitPrice: sUnit, total: Math.round(areaM2 * sUnit),
      sortOrder: order++,
    });
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

  // Steel-waterproof-specific items.
  if (constructionType === "steelWaterproof") {
    // 두겁 절곡 — 난간 시공 시 필수 (SCOPE_FORCES enforces this in the form)
    if (scope.cap && capLengthM > 0) {
      items.push({
        category: "material", name: "두겁 (절곡)", quantity: capLengthM, unit: "m",
        unitPrice: settings.capBendingPricePerM,
        total: Math.round(capLengthM * settings.capBendingPricePerM),
        sortOrder: order++,
      });
    }
    // 새 배수구 타공
    if (scope.drainHole && drainHoleCount > 0) {
      items.push({
        category: "other", name: "새 배수구 타공", quantity: drainHoleCount, unit: "개",
        unitPrice: settings.drainHolePrice,
        total: drainHoleCount * settings.drainHolePrice,
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
    // Legacy: 기존 방수재 철거 (DEPRECATED — removed from UI, but still computed if flag present in old data)
    if (scope.existingWaterproofRemoval) {
      items.push({
        category: "removal", name: "기존 방수재 철거", quantity: areaM2, unit: "㎡",
        unitPrice: settings.removalPricePerSqm, total: Math.round(areaM2 * settings.removalPricePerSqm),
        sortOrder: order++,
      });
    }
  }

  // Waste disposal — per-truck pricing
  if (scope.waste) {
    const trucks = Math.max(1, wasteTruckCount);
    items.push({
      category: "waste", name: "폐기물 처리", quantity: trucks, unit: "차",
      unitPrice: settings.wasteDisposalCost, total: trucks * settings.wasteDisposalCost,
      sortOrder: order++,
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
    // Prefer the ㎡·일 model when scaffold area is provided. Fall back to
    // the legacy daily-lump-sum (scaffoldDailyCost × days) if no area set.
    if (scaffoldAreaM2 > 0) {
      const qty = Math.round(scaffoldAreaM2 * scaffoldDays * 10) / 10;
      items.push({
        category: "equipment", name: "비계", quantity: qty, unit: "㎡·일",
        unitPrice: settings.scaffoldPricePerSqmDay, total: Math.round(qty * settings.scaffoldPricePerSqmDay),
        sortOrder: order++,
      });
    } else {
      items.push({
        category: "equipment", name: "비계", quantity: scaffoldDays, unit: "일",
        unitPrice: settings.scaffoldDailyCost, total: Math.round(scaffoldDays * settings.scaffoldDailyCost),
        sortOrder: order++,
      });
    }
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

  // Catalog categories (마감재 / 물받이 부속 / 부자재 / 절곡)
  // Each category is either:
  //   - 심플 (simple) mode: one auto-calculated line based on simpleType + simpleValue
  //   - 상세 (detailed) mode: individual line items from catalogSelections
  //
  // The user toggles mode per-category in the form. Sensible defaults are
  // applied for categories the user hasn't explicitly configured.
  for (const cat of CATALOG_CATEGORIES) {
    const m: CategoryMode = effectiveModes[cat.value];
    if (m.mode === "simple") {
      const sline = simpleModeLineItem(cat.value, cat.label, m, {
        materialTotal: materialTotalForCategoryPercent,
        areaM2,
        gutterLengthM,
      });
      if (sline) items.push({ ...sline, sortOrder: order++ });
    } else {
      // detailed — emit from catalogSelections (filter to this category)
      for (const sel of catalogSelections) {
        if (sel.category !== cat.value) continue;
        if (!sel.quantity || sel.quantity <= 0) continue;
        items.push({
          category: categoryToLineItemCategory(sel.category),
          name: sel.label,
          quantity: sel.quantity,
          unit: sel.unit,
          unitPrice: sel.unitPrice,
          total: Math.round(sel.quantity * sel.unitPrice),
          sortOrder: order++,
        });
      }
    }
  }

  // Extra (misc) costs added by the user — always last
  for (const ec of extraCosts) {
    if (!ec.name?.trim() || !ec.amount || ec.amount <= 0) continue;
    items.push({
      category: "other", name: ec.note ? `${ec.name} (${ec.note})` : ec.name,
      quantity: 1, unit: "식", unitPrice: ec.amount, total: ec.amount,
      sortOrder: order++,
    });
  }

  return items;
}

/**
 * Generate one line item for a category in 심플 모드.
 * Returns null if the configured value resolves to ₩0 (so we don't pollute
 * the line-items list with zero-cost entries).
 */
function simpleModeLineItem(
  category: CatalogCategory,
  categoryLabel: string,
  m: CategoryMode,
  ctx: { materialTotal: number; areaM2: number; gutterLengthM: number },
): Omit<LineItemDraft, "sortOrder"> | null {
  const v = m.simpleValue ?? 0;
  if (!v || v <= 0) return null;

  let qty = 0;
  let unit = "식";
  let unitPrice = 0;

  switch (m.simpleType) {
    case "percent":
      qty = Math.round(v * 100) / 100;
      unit = "%";
      unitPrice = ctx.materialTotal;
      break;
    case "perSqm":
      qty = ctx.areaM2;
      unit = "㎡";
      unitPrice = Math.round(v);
      break;
    case "perM":
      qty = ctx.gutterLengthM;
      unit = "m";
      unitPrice = Math.round(v);
      break;
    case "total":
    default:
      qty = 1;
      unit = "식";
      unitPrice = Math.round(v);
      break;
  }

  // For percent: total = materialTotal × percent. For perSqm/perM/total: qty × unitPrice.
  const total = m.simpleType === "percent"
    ? Math.round(ctx.materialTotal * v)
    : Math.round(qty * unitPrice);

  if (total <= 0) return null;

  return {
    category: categoryToLineItemCategory(category),
    name: `${categoryLabel} (심플)`,
    quantity: qty,
    unit,
    unitPrice,
    total,
  };
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
