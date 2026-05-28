import type { BaselineData, BaselineEntry, BuildingShape, ConstructionType, ExtraCost, GutterMode, InsulationType, MaterialType, PricingOverrides, RoofShape, ScopeFlags, SubstructureType, Thickness } from "./types";
import { BASELINE_AREAS, INSULATION_LABEL, MATERIAL_TYPES, parseGutterSides, gutterSidesLabel } from "./types";
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

// ─── 자재 자동 추정 ──────────────────────────────────────────────────
// 두 단계:
//  Layer 1: PricingSettings.baselineData (실제 시공 데이터) — 있으면 우선 사용.
//  Layer 2: 기하학적 추정 (건물형태 + 지붕형태 계수) — 항상 fallback 가능.
// 모든 추정값은 라인아이템으로 표시되며 사용자가 직접 수정 가능.

const BUILDING_SHAPE_FACTORS: Record<BuildingShape, { perimeterFactor: number; cornerCount: number; flashingPoints: number }> = {
  rectangle: { perimeterFactor: 4.2, cornerCount: 4, flashingPoints: 0 },
  lshape:    { perimeterFactor: 5.0, cornerCount: 6, flashingPoints: 2 },
  ushape:    { perimeterFactor: 5.5, cornerCount: 8, flashingPoints: 4 },
};

// 지붕 형태 계수 — 용마루/처마 길이 비율 + 강판 로스율.
//   ridgeRatio: 용마루 길이 = 장변 × ridgeRatio × 용마루수
//   eaveRatio:  처마 길이   = 둘레 × eaveRatio
// 박공 = 양면 경사 (용마루 1, 처마 2면), 모임 = 사방 경사 (용마루 짧고 처마 全),
// 팔작 = 박공+모임 혼합, 외쪽 = 한쪽 경사 (용마루 없음), 멘사드 = 2단 꺾임 (처마 ↑).
// "complex" 는 구버전 호환용.
const ROOF_SHAPE_FACTORS: Record<RoofShape, { ridgeRatio: number; eaveRatio: number; lossRate: number }> = {
  gable:   { ridgeRatio: 1.0, eaveRatio: 0.5,  lossRate: 0.07 },
  hip:     { ridgeRatio: 0.6, eaveRatio: 1.0,  lossRate: 0.12 },
  halfHip: { ridgeRatio: 0.8, eaveRatio: 0.85, lossRate: 0.13 },
  shed:    { ridgeRatio: 0.0, eaveRatio: 0.35, lossRate: 0.05 },
  mansard: { ridgeRatio: 0.6, eaveRatio: 1.3,  lossRate: 0.18 },
  complex: { ridgeRatio: 0.8, eaveRatio: 0.8,  lossRate: 0.18 },
  // "other" 는 추정 불가 — 박공 기본값으로 둠 (사용자가 라인 직접 수정 가정).
  other:   { ridgeRatio: 1.0, eaveRatio: 0.5,  lossRate: 0.07 },
};

/**
 * 시공면적 → 건물면적 추정 비율.
 * 보통 지붕공사에서 시공면적은 건물면적의 1.3~1.5배 (경사 + 처마 돌출).
 * 사용자가 buildingAreaM2 를 직접 입력했으면 그 값 우선.
 */
const CONSTRUCTION_TO_BUILDING_RATIO = 1.4;

/**
 * 건물 둘레 추정 — √건물면적 × 형태계수.
 *
 * buildingAreaM2 가 입력되어 있으면 그것을 사용, 없으면 areaM2 (시공면적) / 1.4 로 추정.
 * 시공면적을 그대로 쓰면 경사·처마 만큼 둘레가 과대평가됨.
 */
export function estimatePerimeter(
  areaM2: number,
  shape: BuildingShape,
  buildingAreaM2?: number | null,
): number {
  const effectiveBuildingArea = (buildingAreaM2 && buildingAreaM2 > 0)
    ? buildingAreaM2
    : (areaM2 > 0 ? areaM2 / CONSTRUCTION_TO_BUILDING_RATIO : 0);
  if (effectiveBuildingArea <= 0) return 0;
  return Math.round(
    Math.sqrt(effectiveBuildingArea) * BUILDING_SHAPE_FACTORS[shape].perimeterFactor * 10
  ) / 10;
}

/** 장변 길이 추정 — 둘레 = 2(L+S), 장단비 1.5 가정. ㄱ/ㄷ자도 주동 길이로 근사. */
function estimateLongSide(perimeter: number): number {
  return Math.round((perimeter / 5) * 1.5 * 10) / 10;
}

export interface GeometricEstimate {
  perimeterM: number;
  longSideM: number;
  ridgeLengthM: number;
  eaveLengthM: number;
  flashingLengthM: number;
  parapetAreaM2: number;
  lossRate: number;
}

export function estimateGeometrically(args: {
  constructionType: ConstructionType;
  areaM2: number;
  /** 건물면적 (옵션). 없으면 시공면적/1.4 로 추정. estimatePerimeter() 참고. */
  buildingAreaM2?: number | null;
  building: BuildingShape;
  roof: RoofShape | null;
  ridgeCount: number;
  parapetHeightCm: number | null;
  perimeterOverride: number | null;
  /**
   * 처마 돌출 cm (지붕공사/옥상지붕만). 외벽 둘레에서 처마 외곽 둘레로 보정 —
   * 사방으로 d 만큼 나오면 △둘레 = 8 × (d/100). rectilinear polygon 의 모든 모양
   * (ㅁ/ㄱ/ㄷ) 에 대해 동일 (외부코너 - 내부코너 = 4 불변).
   * 한옥처럼 처마 1m 면 100, 일반 50cm 면 50, 평지붕은 0.
   */
  eaveOverhangCm?: number;
}): GeometricEstimate {
  const { constructionType, areaM2, buildingAreaM2, building, roof, ridgeCount, parapetHeightCm, perimeterOverride, eaveOverhangCm = 0 } = args;
  const buildingPerimeter = (perimeterOverride && perimeterOverride > 0)
    ? perimeterOverride
    : estimatePerimeter(areaM2, building, buildingAreaM2);
  // 처마 외곽 둘레 = 건물 둘레 + 8d (지붕공사/옥상지붕만, 스틸방수는 그대로).
  const eaveOverhangM = constructionType === "steelWaterproof" ? 0 : (eaveOverhangCm / 100);
  const perimeter = buildingPerimeter + 8 * eaveOverhangM;
  const longSide = estimateLongSide(perimeter);
  const buildingF = BUILDING_SHAPE_FACTORS[building];

  if (constructionType === "steelWaterproof") {
    const ph = parapetHeightCm && parapetHeightCm > 0 ? parapetHeightCm : 60;
    const parapetAreaM2 = Math.round(perimeter * (ph / 100) * 1.10 * 10) / 10;
    return {
      perimeterM: perimeter,
      longSideM: longSide,
      ridgeLengthM: 0,
      eaveLengthM: 0,
      flashingLengthM: buildingF.flashingPoints * (ph / 100),
      parapetAreaM2,
      lossRate: 0.05,
    };
  }

  const roofF = roof ? ROOF_SHAPE_FACTORS[roof] : ROOF_SHAPE_FACTORS.gable;
  const ridges = Math.max(1, ridgeCount || 1);
  return {
    perimeterM: perimeter,
    longSideM: longSide,
    ridgeLengthM: Math.round(longSide * roofF.ridgeRatio * ridges * 10) / 10,
    eaveLengthM: Math.round(perimeter * roofF.eaveRatio * 10) / 10,
    flashingLengthM: buildingF.flashingPoints * 3,  // 평균 경사높이 3m
    parapetAreaM2: 0,
    lossRate: roofF.lossRate,
  };
}

/** 베이스라인 데이터에서 가장 가까운 평수 + 형태 엔트리를 찾아 면적 비율로 스케일. */
export function findAndScaleBaseline(
  data: BaselineData | null | undefined,
  args: {
    constructionType: ConstructionType;
    areaM2: number;
    building: BuildingShape;
    roof: RoofShape | null;
  },
): BaselineEntry | null {
  if (!data) return null;
  const { constructionType, areaM2, building, roof } = args;
  const typeBucket = data[constructionType];
  if (!typeBucket) return null;

  const pyeong = areaM2 / 3.3058;
  const nearest = BASELINE_AREAS.reduce((prev, curr) =>
    Math.abs(curr - pyeong) < Math.abs(prev - pyeong) ? curr : prev
  );
  const areaKey = `area${nearest}`;
  const areaBucket = (typeBucket as Record<string, unknown>)[areaKey] as
    | Partial<Record<BuildingShape, unknown>> | undefined;
  if (!areaBucket) return null;
  const buildingBucket = areaBucket[building];
  if (!buildingBucket) return null;

  let entry: BaselineEntry | null;
  if (constructionType === "steelWaterproof") {
    entry = buildingBucket as BaselineEntry;
  } else {
    if (!roof) return null;
    entry = (buildingBucket as Partial<Record<RoofShape, BaselineEntry>>)[roof] ?? null;
  }
  if (!entry) return null;

  // Scale to actual area.
  const baselineAreaM2 = nearest * 3.3058;
  const scale = baselineAreaM2 > 0 ? areaM2 / baselineAreaM2 : 1;
  const out: BaselineEntry = {};
  for (const [k, v] of Object.entries(entry)) {
    if (typeof v !== "number") continue;
    // lossRate는 스케일하지 않음 (비율이라서)
    out[k as keyof BaselineEntry] = k === "materialLossRate"
      ? v
      : Math.round(v * scale * 10) / 10;
  }
  return out;
}

/**
 * 절곡 비용 — 넓이mm × 단가(원/mm·3m) × (길이m / 3).
 * 예: 350mm 용마루 10m, 단가 36원 → 350 × 36 × (10/3) = 42,000원
 */
export function calcBendingCost(widthMm: number, lengthM: number, pricePerMmPer3m: number): number {
  if (!widthMm || !lengthM || !pricePerMmPer3m) return 0;
  return Math.round(widthMm * pricePerMmPer3m * (lengthM / 3));
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

  // ── 자재 자동 추정 입력 (Phase A 신규) ──
  /** 건물 면적 (옵션). 둘레 추정 시 사용 — 없으면 시공면적/1.4 로 추정. */
  buildingAreaM2?: number | null;
  /** 건물 평면 형태 — 없으면 자동 추정 라인은 모두 생략 (기존 동작 유지) */
  buildingShape?: BuildingShape | null;
  /** 지붕 형태 (지붕공사/옥상지붕만) */
  roofShape?: RoofShape | null;
  /** 건물 둘레 직접 입력 — 없으면 √면적 × 형태계수로 추정 */
  perimeterM?: number | null;
  /** 용마루 수 — 박공이라도 2동 건물이면 2 */
  ridgeCount?: number;
  /** 스틸방수 — 파라펫 높이 (기본 60cm) */
  parapetHeightCm?: number | null;
  /** 처마 돌출 cm — 지붕공사/옥상지붕. 외벽 둘레 → 처마 외곽 둘레 보정. */
  eaveOverhangCm?: number;
  /** [DEPRECATED] 단열재 단순 토글 — insulationTypes 로 대체. 구버전 호환용. */
  hasInsulation?: boolean;
  /** 단열재 종류 (multi-select). 빈 배열 = 없음. */
  insulationTypes?: InsulationType[] | string[];
  /** PE폼 부착 (강판 ㎡당 추가 단가) */
  hasPeFoam?: boolean;
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
    buildingShape = null, roofShape = null,
    buildingAreaM2 = null,
    perimeterM = null, ridgeCount = 1, parapetHeightCm = null,
    eaveOverhangCm = 50,
    hasInsulation = false, insulationTypes = [],
    hasPeFoam = false,
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
    // PE폼 부착 (결로/소음 방지) — 강판 면적과 동일하게 (로스율 포함) ㎡당 추가 단가.
    // 별도 라인으로 분리해서 견적서에서도 명시되고 사용자가 단가/수량 수정 가능.
    if (hasPeFoam && settings.peFoamPricePerSqm > 0) {
      items.push({
        category: "material", name: "PE폼 부착", quantity: effectiveArea, unit: "㎡",
        unitPrice: settings.peFoamPricePerSqm,
        total: Math.round(effectiveArea * settings.peFoamPricePerSqm),
        sortOrder: order++,
      });
    }
    // Note: 부자재 used to be auto-added here at materialTotal × accessoryRate.
    // That's now handled by the accessory catalog category (simple mode =
    // "percent" default 0.15). See "Catalog categories — simple/detailed" below.
  }

  // Compute material subtotal once — needed by simple-mode "percent" calculations
  const materialTotalForCategoryPercent = items
    .filter((i) => i.category === "material")
    .reduce((s, i) => s + i.total, 0);

  // ── 자재 자동 추정: 베이스라인 우선, 없으면 기하학적 추정 ──
  // buildingShape 가 있으면 새 추정 로직, 없으면 기존 √면적 근사로 fallback.
  const baselineRaw = (settings as unknown as { baselineData?: BaselineData | null }).baselineData ?? null;
  const baseline = buildingShape ? findAndScaleBaseline(baselineRaw, {
    constructionType, areaM2, building: buildingShape, roof: roofShape,
  }) : null;
  const geom = buildingShape ? estimateGeometrically({
    constructionType, areaM2, buildingAreaM2,
    building: buildingShape, roof: roofShape,
    ridgeCount, parapetHeightCm, perimeterOverride: perimeterM,
    eaveOverhangCm,
  }) : null;

  /** 추정값 헬퍼 — 베이스라인 우선, geom fallback, 없으면 fallback 콜백. */
  function est(field: keyof BaselineEntry, geomField: keyof GeometricEstimate | null, fallback: () => number): number {
    if (baseline && baseline[field] != null) return baseline[field] as number;
    if (geom && geomField) {
      const v = geom[geomField];
      if (v != null) return v as number;
    }
    return fallback();
  }

  // Ridge / Eave — only for roof / rooftopRoof
  if (constructionType !== "steelWaterproof") {
    if (scope.ridge) {
      // 자재 (마감재) 라인
      const ridgeLength = est("ridgeBendingM", "ridgeLengthM", () => Math.round(Math.sqrt(areaM2) * 0.8));
      items.push({
        category: "material", name: "용마루 마감", quantity: ridgeLength, unit: "m",
        unitPrice: settings.ridgePricePerM, total: Math.round(ridgeLength * settings.ridgePricePerM),
        sortOrder: order++,
      });
      // 절곡 라인 (buildingShape 입력 시에만 자동 생성)
      if (buildingShape && ridgeLength > 0) {
        const bend = calcBendingCost(settings.bendingWidthRidge, ridgeLength, settings.bendingPricePerMmPer3m);
        if (bend > 0) {
          items.push({
            category: "material", name: `용마루 절곡 (${settings.bendingWidthRidge}mm)`,
            quantity: ridgeLength, unit: "m",
            unitPrice: Math.round(bend / Math.max(1, ridgeLength)), total: bend,
            sortOrder: order++,
          });
        }
      }
    }
    if (scope.eave) {
      const eaveLength = est("eaveBendingM", "eaveLengthM", () => Math.round(Math.sqrt(areaM2) * 2));
      items.push({
        category: "material", name: "처마 마감", quantity: eaveLength, unit: "m",
        unitPrice: settings.eavePricePerM, total: Math.round(eaveLength * settings.eavePricePerM),
        sortOrder: order++,
      });
      if (buildingShape && eaveLength > 0) {
        const bend = calcBendingCost(settings.bendingWidthEave, eaveLength, settings.bendingPricePerMmPer3m);
        if (bend > 0) {
          items.push({
            category: "material", name: `처마 절곡 (${settings.bendingWidthEave}mm)`,
            quantity: eaveLength, unit: "m",
            unitPrice: Math.round(bend / Math.max(1, eaveLength)), total: bend,
            sortOrder: order++,
          });
        }
      }
    }
    // 프래싱 (꺾인 건물에만) — 기존 견적에는 없던 자동 생성 라인
    if (buildingShape && geom && geom.flashingLengthM > 0) {
      const flashLen = est("flashingBendingM", "flashingLengthM", () => 0);
      if (flashLen > 0) {
        const bend = calcBendingCost(settings.bendingWidthFlashing, flashLen, settings.bendingPricePerMmPer3m);
        if (bend > 0) {
          items.push({
            category: "material", name: `프래싱 절곡 (${settings.bendingWidthFlashing}mm)`,
            quantity: flashLen, unit: "m",
            unitPrice: Math.round(bend / Math.max(1, flashLen)), total: bend,
            sortOrder: order++,
          });
        }
      }
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

  // 하지작업 (substructure) — wood or steel, priced per ㎡ of construction area.
  // 강판과 동일하게 자재 로스율 적용 (자투리 + 절단 낭비).
  if (substructureType) {
    const sUnit = substructureType === "wood"
      ? settings.substructureWoodPricePerSqm
      : settings.substructureSteelPricePerSqm;
    const sLabel = substructureType === "wood" ? "목재 하지" : "철재 하지";
    const sLossMult = applyLossRate && lossRate > 0 ? 1 + lossRate : 1;
    const sEffectiveArea = Math.round(areaM2 * sLossMult * 100) / 100;
    const sLossNote = applyLossRate && lossRate > 0
      ? ` (로스율 ${Math.round(lossRate * 100)}% 포함)`
      : "";
    items.push({
      category: "material", name: `${sLabel}${sLossNote}`, quantity: sEffectiveArea, unit: "㎡",
      unitPrice: sUnit, total: Math.round(sEffectiveArea * sUnit),
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
    // 두겁 절곡 — 난간 시공 시 필수 (SCOPE_FORCES enforces this in the form).
    // 사용자가 capLengthM 입력하면 그 값 우선, 안 하면 buildingShape 있을 때 둘레로 자동 추정.
    const autoCapM = (() => {
      if (capLengthM > 0) return capLengthM;
      if (!buildingShape || !geom) return 0;
      const fromBaseline = baseline?.capBendingM;
      return fromBaseline ?? Math.round(geom.perimeterM * 10) / 10;
    })();
    if (scope.cap && autoCapM > 0) {
      // 단가 m당 — 기존 capBendingPricePerM (legacy) 와 새 절곡 공식 중 큰 값 사용? 단순히 새 공식만.
      const bend = calcBendingCost(settings.bendingWidthCap, autoCapM, settings.bendingPricePerMmPer3m);
      items.push({
        category: "material", name: `두겁 절곡 (${settings.bendingWidthCap}mm)`,
        quantity: autoCapM, unit: "m",
        unitPrice: Math.round(bend / Math.max(1, autoCapM)),
        total: bend,
        sortOrder: order++,
      });
    }
    // 미시 절곡 — 둘레 기반 자동 추정 (buildingShape 있을 때만)
    if (buildingShape && geom) {
      const mishiLen = baseline?.mishiBendingM ?? geom.perimeterM;
      if (mishiLen > 0) {
        const bend = calcBendingCost(settings.bendingWidthMishi, mishiLen, settings.bendingPricePerMmPer3m);
        if (bend > 0) {
          items.push({
            category: "material", name: `미시 절곡 (${settings.bendingWidthMishi}mm)`,
            quantity: mishiLen, unit: "m",
            unitPrice: Math.round(bend / Math.max(1, mishiLen)), total: bend,
            sortOrder: order++,
          });
        }
      }
      // 프래싱 (꺾인 건물에만)
      const flashLen = baseline?.flashingBendingM ?? geom.flashingLengthM;
      if (flashLen > 0) {
        const bend = calcBendingCost(settings.bendingWidthFlashing, flashLen, settings.bendingPricePerMmPer3m);
        if (bend > 0) {
          items.push({
            category: "material", name: `프래싱 절곡 (${settings.bendingWidthFlashing}mm)`,
            quantity: flashLen, unit: "m",
            unitPrice: Math.round(bend / Math.max(1, flashLen)), total: bend,
            sortOrder: order++,
          });
        }
      }
      // 파라펫 강판 — 둘레 × 파라펫높이 × 1.10 × materialPricePerSqm
      const parapetArea = baseline?.parapetAreaM2 ?? geom.parapetAreaM2;
      if (parapetArea > 0) {
        const mult = thickness ? THICKNESS_MULT[thickness] : 1;
        const unitPrice = Math.round(settings.materialPricePerSqm * mult);
        items.push({
          category: "material", name: "파라펫 강판",
          quantity: parapetArea, unit: "㎡",
          unitPrice, total: Math.round(parapetArea * unitPrice),
          sortOrder: order++,
        });
      }
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

  // ── 소모품 자동 생성 (스크류 / 실리콘 / 단열재) ──
  // buildingShape 있을 때만 자동 생성. 사용자는 수정 가능.
  if (buildingShape) {
    // 강판 면적 — 메인 자재 라인 합산 (시공면적 × 로스율 반영 결과). 단순 areaM2 로 근사.
    const sheetArea = areaM2 * (applyLossRate && lossRate > 0 ? 1 + lossRate : 1);

    // 스크류 대 — 강판 1㎡당 약 2개
    const screwLargeQty = baseline?.screwLarge ?? Math.round(sheetArea * 2);
    if (screwLargeQty > 0 && settings.screwLargePrice > 0) {
      items.push({
        category: "material", name: "스크류 (대)", quantity: screwLargeQty, unit: "개",
        unitPrice: settings.screwLargePrice,
        total: screwLargeQty * settings.screwLargePrice,
        sortOrder: order++,
      });
    }

    // 스크류 소 — 절곡 라인 길이 합 × 3.3개/m
    const bendingLengthSum = items
      .filter((i) => i.unit === "m" && /절곡/.test(i.name))
      .reduce((s, i) => s + i.quantity, 0);
    const screwSmallQty = baseline?.screwSmall ?? Math.round(bendingLengthSum * 3.3);
    if (screwSmallQty > 0 && settings.screwSmallPrice > 0) {
      items.push({
        category: "material", name: "스크류 (소)", quantity: screwSmallQty, unit: "개",
        unitPrice: settings.screwSmallPrice,
        total: screwSmallQty * settings.screwSmallPrice,
        sortOrder: order++,
      });
    }

    // 실리콘 — 접합부 총 길이 / 6m 당 1개 (올림)
    const jointLength = bendingLengthSum + (gutterLengthM || 0) + (stainlessDrainLengthM || 0);
    const siliconeQty = baseline?.siliconeUnits ?? Math.ceil(jointLength / 6);
    if (siliconeQty > 0 && settings.siliconePrice > 0) {
      items.push({
        category: "material", name: "실리콘", quantity: siliconeQty, unit: "개",
        unitPrice: settings.siliconePrice,
        total: siliconeQty * settings.siliconePrice,
        sortOrder: order++,
      });
    }
  }

  // 단열재 — multi-select. 선택된 종류가 1개 이상이거나 (구버전) hasInsulation 토글 true 이면 라인 생성.
  // 가격은 모든 종류 동일 (insulationPricePerSqm) — qty = 시공면적 × 1.10 (자투리 포함).
  // 라인 이름에 선택한 종류들 표시: 예) "단열재 (XPS, PIR)".
  const insTypeList: string[] = Array.isArray(insulationTypes) ? insulationTypes.filter(Boolean) : [];
  if ((insTypeList.length > 0 || hasInsulation) && settings.insulationPricePerSqm > 0) {
    const insulationArea = Math.round(areaM2 * 1.10 * 10) / 10;
    const typeNames = insTypeList
      .map((t) => INSULATION_LABEL[t as InsulationType] ?? t)
      .join(", ");
    const name = typeNames ? `단열재 (${typeNames})` : "단열재";
    items.push({
      category: "material", name, quantity: insulationArea, unit: "㎡",
      unitPrice: settings.insulationPricePerSqm,
      total: Math.round(insulationArea * settings.insulationPricePerSqm),
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

/**
 * 마진율 = 마진 / 공급가 (매출 대비).
 *   공급가 = 원가 / (1 - 마진율)
 *   마진 = 공급가 - 원가 = 원가 × 마진율 / (1 - 마진율)
 *
 * 예) 원가 800만, 마진율 20% → 공급가 1,000만, 마진 200만.
 *     (참고로 "원가 대비" 방식으로 계산하면 공급가 960만, 마진 160만)
 *
 * 마진율 ≥ 1.0 (= 100%) 은 수학적으로 무한대 공급가가 나오므로 클램프.
 * 음수 마진율은 손해 견적이라 그대로 허용 (마진 < 0).
 */
export function calcTotals(
  lineItems: { total: number }[],
  marginRate: number,
  vatIncluded: boolean,
): { totalCost: number; marginAmount: number; supplyPrice: number; vat: number; finalPrice: number } {
  const totalCost = lineItems.reduce((s, i) => s + i.total, 0);
  // 안전망: 99% 이상은 공급가가 폭발하니 99% 로 클램프 (실무상 의미 없는 영역).
  const r = Math.min(0.99, marginRate);
  const denom = 1 - r;
  const supplyPrice = denom > 0 ? Math.round(totalCost / denom) : totalCost;
  const marginAmount = supplyPrice - totalCost;
  const vat = Math.round(supplyPrice * 0.1);
  const finalPrice = vatIncluded ? supplyPrice + vat : supplyPrice;
  return { totalCost, marginAmount, supplyPrice, vat, finalPrice };
}

/**
 * 사용자가 finalPrice 를 직접 입력했을 때 — 거기서 supplyPrice 빼고
 * 매출 대비 마진율을 역산. 마진율 = (공급가 - 원가) / 공급가.
 */
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
  // 매출 대비 = 마진 / 공급가
  const marginRate = supplyPrice > 0 ? marginAmount / supplyPrice : 0;
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
