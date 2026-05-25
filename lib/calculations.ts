import type { ConstructionType, ExtraCost, GutterMode, MaterialType, PricingOverrides, ScopeFlags, SubstructureType, Thickness } from "./types";
import { MATERIAL_TYPES, parseGutterSides, gutterSidesLabel } from "./types";
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

/**
 * Merge per-estimate pricing overrides over the live PricingSettings.
 * Only fields the user explicitly overrode (non-null/non-undefined) replace
 * the settings value. Used by buildLineItems and the form's inline price
 * displays so both see the same effective price.
 */
export function applyOverrides(settings: PricingSettings, overrides: PricingOverrides | null | undefined): PricingSettings {
  if (!overrides) return settings;
  const merged: PricingSettings = { ...settings };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === null || (typeof v === "number" && Number.isNaN(v))) continue;
    (merged as Record<string, unknown>)[k] = v;
  }
  return merged;
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
  /** 스테인리스 배수로 길이 — 스틸방수에서만 사용 (물받이 대체). */
  stainlessDrainLengthM?: number;
  capLengthM?: number;
  drainHoleCount?: number;
  endCapCount?: number;
  skyliftDays: number;
  ladderTruckDays: number;
  scaffoldDays: number;
  scaffoldAreaM2?: number;
  /** 폐기물 트럭 수 (waste-disposal truck count); cost = wasteDisposalCost × truck count */
  wasteTruckCount?: number;
  /** 하지작업: null/undefined = 안함, 'wood' = 목재, 'steel' = 철재 */
  substructureType?: SubstructureType | null;
  extraCosts?: ExtraCost[];
  /** Per-estimate price overrides. Merged over settings so individual prices
   *  can be changed for this estimate without modifying PricingSettings. */
  pricingOverrides?: PricingOverrides;
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
    settings: rawSettings, constructionType, materialType, thickness,
    areaM2, scope, workerCount, workDays,
    gutterMode = null, gutterLengthM,
    stainlessDrainLengthM = 0,
    capLengthM = 0, drainHoleCount = 0, endCapCount = 0,
    skyliftDays, ladderTruckDays, scaffoldDays, scaffoldAreaM2 = 0,
    wasteTruckCount = 1, substructureType = null,
    extraCosts = [], pricingOverrides = {},
    catalogSelections = [], catalogModes,
    applyLossRate = false, lossRate = 0,
  } = input;

  // Apply per-estimate pricing overrides on top of the live PricingSettings.
  // The result has the same shape as PricingSettings so the rest of this
  // function can use it transparently.
  const settings: PricingSettings = applyOverrides(rawSettings, pricingOverrides);

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

  // 물받이 — driven by gutter multi-select (전/후/좌/우 또는 전체/안함).
  // 스틸방수는 물받이 대신 스테인리스 배수로를 쓰므로 gutter 라인은 emit 안 함.
  if (constructionType !== "steelWaterproof") {
    if (gutterMode && gutterMode !== "none" && gutterLengthM > 0) {
      const sides = parseGutterSides(gutterMode);
      if (sides.size > 0) {
        const modeLabel = gutterSidesLabel(sides);
        items.push({
          category: "material", name: `물받이 교체 (${modeLabel})`, quantity: gutterLengthM, unit: "m",
          unitPrice: settings.gutterPricePerM, total: Math.round(gutterLengthM * settings.gutterPricePerM),
          sortOrder: order++,
        });
      }
    }
  } else if (stainlessDrainLengthM > 0) {
    // 스테인리스 배수로 — 스틸방수 전용. 단순 길이 × m당 단가.
    items.push({
      category: "material", name: "스테인리스 배수로", quantity: stainlessDrainLengthM, unit: "m",
      unitPrice: settings.stainlessDrainPricePerM,
      total: Math.round(stainlessDrainLengthM * settings.stainlessDrainPricePerM),
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

  // 엔드캡 (지붕공사 / 옥상지붕) — per-piece pricing
  if (constructionType !== "steelWaterproof" && scope.endCap && endCapCount > 0) {
    items.push({
      category: "material", name: "엔드캡", quantity: endCapCount, unit: "개",
      unitPrice: settings.endCapPrice,
      total: endCapCount * settings.endCapPrice,
      sortOrder: order++,
    });
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
    // Skip the category entirely when the user disabled it
    if (m.enabled === false) continue;
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
      // Prefer user-entered simpleQty; fall back to construction area.
      qty = (m.simpleQty && m.simpleQty > 0) ? m.simpleQty : ctx.areaM2;
      unit = "㎡";
      unitPrice = Math.round(v);
      break;
    case "perM":
      // Prefer user-entered simpleQty; fall back to gutter length.
      qty = (m.simpleQty && m.simpleQty > 0) ? m.simpleQty : ctx.gutterLengthM;
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

// ─── Margin distribution for customer PDF ─────────────────────────────
// Internal lineItems store cost only — no margin. For the customer-facing
// PDF we want the displayed amounts to sum to (cost + margin) so the math
// is transparent. distributeMarginForDisplay() returns a NEW array of
// "display" line items with the margin baked in per these ratios:
//
//   material ratio → scales each material line up by a uniform factor
//   labor ratio    → scales each labor (incl. meals/lodging) line
//   profit ratio   → appended as a single "이윤" line at the end
//
// Fallback: if a target category has no source lines, its margin share
// spills to the next non-empty category (labor → material → profit line).
// Final pass adjusts the last item by ±1원 if needed so the exact sum
// equals cost + marginAmount (avoids rounding drift visible to customer).
//
// IMPORTANT: this is presentation-only. Never call it before persisting
// line items — the internal cost data must stay clean.

export interface DisplayLineItem {
  category: string;
  name: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  total: number;
  /** True when this item didn't exist in the source (i.e. the synthetic 이윤 line). */
  synthetic?: boolean;
}

export interface MarginDistributionRatios {
  material: number;
  labor: number;
  profit: number;
}

/** Lines whose category counts as "material" for distribution. */
const MATERIAL_CATEGORIES = new Set(["material"]);
/** Lines whose category counts as "labor" for distribution. */
const LABOR_CATEGORIES = new Set(["labor", "meals", "lodging"]);

export function distributeMarginForDisplay<T extends { category: string; name: string; quantity: number; unit: string | null; unitPrice: number; total: number }>(
  items: T[],
  marginAmount: number,
  ratiosInput: MarginDistributionRatios,
): DisplayLineItem[] {
  // Defensive: normalize ratios so they sum to 1.0. If user set them
  // 60/30/30 (= 120%), this rescales to 50/25/25 effective so we never
  // over-distribute and break the totals.
  const sum = ratiosInput.material + ratiosInput.labor + ratiosInput.profit;
  const ratios = sum > 0
    ? { material: ratiosInput.material / sum, labor: ratiosInput.labor / sum, profit: ratiosInput.profit / sum }
    : { material: 0.5, labor: 0.25, profit: 0.25 };

  // Bucket items by role.
  const materialItems: T[] = [];
  const laborItems: T[] = [];
  const otherItems: T[] = [];
  for (const it of items) {
    if (MATERIAL_CATEGORIES.has(it.category)) materialItems.push(it);
    else if (LABOR_CATEGORIES.has(it.category)) laborItems.push(it);
    else otherItems.push(it);
  }

  const materialTotal = materialItems.reduce((s, i) => s + i.total, 0);
  const laborTotal = laborItems.reduce((s, i) => s + i.total, 0);

  // Compute initial margin slices. Then handle empty-bucket fallback.
  let materialMargin = Math.round(marginAmount * ratios.material);
  let laborMargin = Math.round(marginAmount * ratios.labor);
  let profitMargin = marginAmount - materialMargin - laborMargin;

  // Fallback when a target bucket has no source lines to scale into.
  if (materialTotal === 0 && materialMargin > 0) {
    // No material — spill into labor if it has lines, else into profit.
    if (laborTotal > 0) {
      laborMargin += materialMargin;
    } else {
      profitMargin += materialMargin;
    }
    materialMargin = 0;
  }
  if (laborTotal === 0 && laborMargin > 0) {
    // No labor — spill into material if it has lines, else profit.
    if (materialTotal > 0) {
      materialMargin += laborMargin;
    } else {
      profitMargin += laborMargin;
    }
    laborMargin = 0;
  }

  // Scale each line. Each line's portion of bucket margin is proportional
  // to its share of the bucket total. unitPrice is scaled the same factor
  // so quantity × unitPrice = total stays consistent.
  function scale<U extends { quantity: number; unitPrice: number; total: number }>(
    bucket: U[],
    bucketTotal: number,
    bucketMargin: number,
  ): U[] {
    if (bucketTotal === 0 || bucketMargin === 0) return bucket;
    const factor = 1 + bucketMargin / bucketTotal;
    return bucket.map((it) => ({
      ...it,
      unitPrice: Math.round(it.unitPrice * factor),
      total: Math.round(it.total * factor),
    }));
  }
  const scaledMaterial = scale(materialItems, materialTotal, materialMargin);
  const scaledLabor = scale(laborItems, laborTotal, laborMargin);

  // Build output preserving original order.
  const out: DisplayLineItem[] = [];
  const mIdx = { v: 0 };
  const lIdx = { v: 0 };
  for (const it of items) {
    if (MATERIAL_CATEGORIES.has(it.category)) {
      out.push(scaledMaterial[mIdx.v++]);
    } else if (LABOR_CATEGORIES.has(it.category)) {
      out.push(scaledLabor[lIdx.v++]);
    } else {
      out.push(it);
    }
  }

  // Append the profit line (always last, "other" category so simple/detailed
  // grouping puts it sensibly. Customer sees one neutral "이윤" row).
  if (profitMargin > 0) {
    out.push({
      category: "other",
      name: "이윤",
      quantity: 1,
      unit: "식",
      unitPrice: profitMargin,
      total: profitMargin,
      synthetic: true,
    });
  }

  // Rounding sweep — ensure exact target sum (cost + marginAmount).
  const target = items.reduce((s, i) => s + i.total, 0) + marginAmount;
  const actual = out.reduce((s, i) => s + i.total, 0);
  const drift = target - actual;
  if (drift !== 0 && out.length > 0) {
    const last = out[out.length - 1];
    out[out.length - 1] = { ...last, total: last.total + drift };
  }

  return out;
}

export function sqmToPyeong(sqm: number): number {
  return Math.round((sqm / 3.3058) * 100) / 100;
}

export function pyeongToSqm(pyeong: number): number {
  return Math.round(pyeong * 3.3058 * 100) / 100;
}
