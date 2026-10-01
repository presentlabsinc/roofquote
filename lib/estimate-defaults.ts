/**
 * 새 견적의 기본값·자동값 — 견적 폼(NewEstimateForm)과 번개 견적이 함께 쓰는 **유일한 출처** (2026-10-01).
 *
 * - 면적 기반 자동값 (둘레·난간 둘레·배수로·작업일수·물받이 길이·로스율)
 * - 공사 유형을 고를 때 채우는 기본값 (공사 범위·강판·물받이 면·선홈통·하지)
 * - 폼이 처음 열릴 때의 입력 기본값 (두께·텍스처·처마 돌출·파라펫 높이 등)
 * - `defaultEstimatePayload` — 유형과 면적만 넣고 나머지는 손대지 않은 새 견적 폼이 제출하는 payload 와
 *   **같은 값** (번개 견적이 이걸로 일반 견적을 만든다). 폼의 제출 규칙을 바꾸면 여기도 같이 바꿀 것 —
 *   payload 모양은 `EstimateFormPayload` 타입이 양쪽을 묶고, 값은 lib/__tests__/quick-estimate.test.ts 가 검사.
 *
 * 순수 함수 — 클라이언트·서버 공용 (서버 전용 import 금지).
 */
import type { PricingSettings } from "@prisma/client";
import { applyOverrides, estimateBasePerimeter, lossRateForRoofShape, BUILDING_SHAPE_FACTORS } from "./calculations";
import type { CatalogSelection, GroupModesMap } from "./catalog";
import {
  DEFAULT_COLOR, serializeGutterSides,
  type BuildingShape, type ConstructionType, type ExtraCost, type FinishingMethods, type GutterSide,
  type InsulationType, type MaterialType, type PricingOverrides, type RoofShape, type ScopeFlags,
  type SubstructureType, type Thickness,
} from "./types";

// ─── 면적 기반 자동값 ─────────────────────────────────────────────────────
// 폼은 "사용자가 만진 칸은 그 값, 안 만진 칸은 자동값"으로 렌더 시 계산한다 (NewEstimateForm AutoField).

/** 물받이 면별 길이 가중치 (장단비 1.5 가정 → 앞/뒤 30%, 좌/우 20%). */
export const GUTTER_SIDE_WEIGHTS: Record<GutterSide, number> = {
  front: 0.30, back: 0.30, left: 0.20, right: 0.20,
};

/** 건물(지붕) 둘레 자동값 — 공사 유형별 베이스 둘레 (처마 돌출 보정 전), m 정수. */
export function autoBasePerimeter(ct: ConstructionType | null, sqm: number, shape: BuildingShape | null, bSqm: number, ratio: number | null | undefined): number {
  if (!ct || sqm <= 0) return 0;
  return Math.round(estimateBasePerimeter(ct, sqm, shape ?? "rectangle", bSqm > 0 ? bSqm : null, ratio));
}

/** 스틸방수 난간 둘레 — 시공면적 A 에 난간 벽 양면(2Ph)이 포함되는 측정 관행이라 바닥 기준으로 역산:
 *  P = −f²h + f·√(f²h² + A)  (f = 형태계수, h = 파라펫 높이 m). */
export function autoRailPerimeter(sqm: number, shape: BuildingShape | null, parapetCm: number): number {
  if (sqm <= 0) return 0;
  const f = BUILDING_SHAPE_FACTORS[shape ?? "rectangle"].perimeterFactor;
  const h = (parapetCm > 0 ? parapetCm : 60) / 100;
  return Math.max(0, Math.round(-f * f * h + f * Math.sqrt(f * f * h * h + sqm)));
}

/** 스테인리스 배수로 — 건물 한 면 길이 ≈ √면적, 최소 10m (30평 ≈ 10m). */
export function autoDrainLength(sqm: number): number {
  return sqm > 0 ? Math.max(10, Math.round(Math.sqrt(sqm))) : 0;
}

/** 작업일수 기준 (㎡/일) — 설정값이 없거나 0 이하면 90 (샘플 실측). */
export function workDaysDivisor(divisor: number | null | undefined): number {
  return divisor && divisor > 0 ? divisor : 90;
}

/** 작업일수 — max(2, ceil(면적 ÷ 기준)) (샘플 실측 90㎡/일). */
export function autoWorkDays(sqm: number, divisor: number | null | undefined): number {
  return Math.max(2, Math.ceil(sqm / workDaysDivisor(divisor)));
}

/** 물받이 길이 — 처마 외곽 둘레 × 선택한 면 가중치 (앞/뒤 30%, 좌/우 20%). */
export function autoGutterLength(basePerim: number, overhangCm: number, sides: Set<GutterSide>): number {
  if (basePerim <= 0 || sides.size === 0) return 0;
  const eavePerim = basePerim + 8 * (overhangCm / 100);
  const weight = Array.from(sides).reduce((sum, x) => sum + GUTTER_SIDE_WEIGHTS[x], 0);
  return Math.round(eavePerim * weight);
}

/** 로스율 정책값 — 자동 모드 + 지붕형태면 형태별(설정 override 우선), 아니면 설정 기본 로스율. */
export function autoLossRate(s: PricingSettings, roofShape: RoofShape | null): number {
  if (s.lossRateMode === "auto" && roofShape) {
    const o = (s.roofShapeLossRates as Record<string, number> | null)?.[roofShape];
    if (o && o > 0) return o;
    const a = lossRateForRoofShape(roofShape);
    if (a !== null) return a;
  }
  return s.defaultLossRate;
}

// ─── 공사 유형을 고를 때의 기본값 ─────────────────────────────────────────
export interface ConstructionTypeDefaults {
  scopeFlags: ScopeFlags;
  materialType: MaterialType;
  gutterSides: GutterSide[];
  downspoutCount: number;
  substructureType: SubstructureType;
}

/**
 * 공사 유형별 기본값 (폼에서 유형을 고를 때 채움):
 * - 용마루(ridge)는 지붕공사·옥상지붕 기본, 기존 지붕 덧씌우기(overlay)는 지붕공사 기본
 * - 강판: 스틸방수 = 슬레이트골, 나머지 = 징크250
 * - 물받이: 지붕·옥상지붕 = 앞·뒤 2면 + 선홈통 4개 (2026-07-08 사용자 확정),
 *   스틸방수 = 안함 (물받이 대신 스테인리스 배수로) + 홈통 1개 (배수로에서 물 내려갈 곳)
 * - 스틸방수: 옥상엔 난간(파라펫)이 사실상 항상 있음 — 난간·두겁 기본 ON (없는 현장만 해제).
 *   난간 둘레는 면적에서 자동 추정되므로 면적만 넣어도 두겁/미시/파라펫 비용이 잡힘.
 * - 하지: 모든 유형 설정의 하지 방식(기본 목재) — 안 쓰면 사용자가 '없음'으로 변경
 * 매번 새 객체를 돌려준다.
 */
export function constructionTypeDefaults(t: ConstructionType, settings: Pick<PricingSettings, "substructureMode">): ConstructionTypeDefaults {
  const substructureType: SubstructureType = settings.substructureMode === "steel" ? "steel" : "wood";
  if (t === "roof") {
    return { scopeFlags: { ridge: true, overlay: true }, materialType: "zinc250", gutterSides: ["front", "back"], downspoutCount: 4, substructureType };
  }
  if (t === "rooftopRoof") {
    return { scopeFlags: { ridge: true }, materialType: "zinc250", gutterSides: ["front", "back"], downspoutCount: 4, substructureType };
  }
  return { scopeFlags: { handrail: true, cap: true }, materialType: "slate", gutterSides: [], downspoutCount: 1, substructureType };
}

// ─── 폼이 처음 열릴 때의 입력 기본값 (새 견적) ─────────────────────────────
export const NEW_ESTIMATE_DEFAULTS = {
  materialThickness: "0.45" as Thickness,
  materialTexture: "스톤",
  materialColor: DEFAULT_COLOR,
  /** 미선택 = ㅁ자 (엔진 fallback 과 동일, 폼에도 선택돼 보임). */
  buildingShape: "rectangle" as BuildingShape,
  ridgeCount: 1,
  /** 스틸방수 파라펫 높이 cm. */
  parapetHeightCm: 60,
  /** 처마 돌출 cm (지붕공사만) — 0 = 평지붕 · 50 = 일반 · 100 = 한옥. */
  eaveOverhangCm: 50,
  rooftopStructurePerimeterM: 0,
  rooftopStructureHeightCm: 250,
  rooftopDoorCount: 1,
  rooftopWindowCount: 0,
  drainHoleCount: 1,
  endCapCount: 1,
  denjoCount: 1,
  wasteTruckCount: 1,
  skyliftDays: 1,
  ladderTruckDays: 1,
  scaffoldDays: 3,
  /** 공사 범위를 아직 정하기 전 작업일수 (면적이 없을 때). */
  workDaysWithoutArea: 2,
  /** PE폼 — 대부분 시공에 들어감 (사용자 요청). */
  hasPeFoam: true,
  /** 부대비용 — 숙박(원거리만)·팀경비 기본 OFF, 제경비(보험) 기본 ON. */
  includeLodging: false,
  includeTeamExpense: false,
  includeInsurance: true,
} as const;

// ─── 폼 제출 payload ─────────────────────────────────────────────────────
/** 견적 폼이 제출(POST · PATCH replace)·초안 저장하는 객체 — 서버는 parseEstimateBody 로 검증. */
export interface EstimateFormPayload {
  constructionType: ConstructionType | null;
  materialType: MaterialType;
  materialThickness: Thickness;
  materialTexture: string | null;
  materialColor: string;
  constructionMonth: string | null;
  areaM2: number;
  buildingAreaM2: number | null;
  workerCount: number;
  workDays: number;
  gutterMode: string | null;
  gutterLengthM: number;
  stainlessDrainLengthM: number;
  capLengthM: number;
  drainHoleCount: number;
  endCapCount: number;
  denjoCount: number;
  substructureType: SubstructureType | null;
  wasteTruckCount: number;
  skyliftDays: number;
  ladderTruckDays: number;
  scaffoldDays: number;
  scaffoldAreaM2: number;
  otherEquipment: string | null;
  scopeFlags: ScopeFlags;
  extraCosts: ExtraCost[];
  catalogSelections: CatalogSelection[];
  catalogModes: GroupModesMap;
  pricingOverrides: PricingOverrides;
  finishingMethods: FinishingMethods;
  applyLossRate: boolean;
  lossRate: number | null;
  lossRateManual: boolean;
  buildingShape: BuildingShape | null;
  roofShape: RoofShape | null;
  perimeterM: number | null;
  ridgeCount: number;
  parapetHeightCm: number | null;
  eaveOverhangCm: number;
  railPerimeterM: number | null;
  rooftopStructurePerimeterM: number | null;
  rooftopStructureHeightCm: number | null;
  rooftopDoorCount: number;
  rooftopWindowCount: number;
  downspoutCount: number;
  hasInsulation: boolean;
  insulationTypes: InsulationType[];
  insulationNote: string | null;
  roofShapeNote: string | null;
  hasPeFoam: boolean;
  includeLodging: boolean;
  includeTeamExpense: boolean;
  includeInsurance: boolean;
  lodgingNights: number | null;
}

/**
 * 새 견적 폼에서 **공사 유형과 시공면적만** 넣고 나머지는 손대지 않았을 때 폼이 제출하는 payload.
 * 번개 견적이 이걸로 일반 견적을 만든다 — 설정 기본값(인원·하지·로스율 토글·그룹 기본값 등) +
 * 면적 기반 자동값(둘레·난간·배수로·물받이·작업일수). 폼의 buildPayload 와 같은 규칙·같은 키 순서.
 */
export function defaultEstimatePayload(settings: PricingSettings, constructionType: ConstructionType, areaM2: number): EstimateFormPayload {
  const D = NEW_ESTIMATE_DEFAULTS;
  const ct = constructionType;
  const steel = ct === "steelWaterproof";
  const eff = applyOverrides(settings, {}); // 새 견적 = 단가 임시 조정 없음
  const t = constructionTypeDefaults(ct, settings);
  const scope = t.scopeFlags;
  const sides = new Set<GutterSide>(t.gutterSides);
  const sqm = Number.isFinite(areaM2) && areaM2 > 0 ? areaM2 : 0;

  const perimeter = autoBasePerimeter(ct, sqm, D.buildingShape, 0, eff.constructionToBuildingRatio);
  const overhang = ct === "roof" ? D.eaveOverhangCm : 0;
  const gutter = autoGutterLength(perimeter, overhang, sides);
  const workDays = sqm > 0 ? autoWorkDays(sqm, eff.workDaysAreaDivisor) : D.workDaysWithoutArea;
  // 폼은 로스율을 % 두 자리로 보여 주고 그 칸 값을 제출한다 — 같은 반올림.
  const lossPct = Math.round(autoLossRate(eff, null) * 10000) / 100;
  const rooftop = steel && !!scope.rooftopStructure;

  return {
    constructionType: ct,
    materialType: t.materialType,
    materialThickness: D.materialThickness,
    materialTexture: D.materialTexture,
    materialColor: D.materialColor,
    constructionMonth: null,
    areaM2: sqm,
    buildingAreaM2: null,
    workerCount: settings.defaultWorkerCount,
    workDays,
    gutterMode: steel ? null : (sides.size === 0 ? null : serializeGutterSides(sides)),
    gutterLengthM: steel ? 0 : (sides.size === 0 ? 0 : gutter),
    stainlessDrainLengthM: steel ? autoDrainLength(sqm) : 0,
    capLengthM: 0,
    drainHoleCount: scope.drainHole ? Math.max(1, D.drainHoleCount || 1) : 0,
    endCapCount: scope.endCap ? Math.max(1, D.endCapCount || 1) : 0,
    denjoCount: scope.eave ? Math.max(1, D.denjoCount || 1) : 0,
    substructureType: t.substructureType,
    wasteTruckCount: scope.waste ? Math.max(1, D.wasteTruckCount || 1) : 1,
    skyliftDays: scope.skylift ? D.skyliftDays || 1 : 0,
    ladderTruckDays: scope.ladderTruck ? D.ladderTruckDays || 1 : 0,
    scaffoldDays: scope.scaffold ? D.scaffoldDays || 1 : 0,
    scaffoldAreaM2: 0,
    otherEquipment: null,
    scopeFlags: scope,
    extraCosts: [],
    catalogSelections: [],
    catalogModes: {},
    pricingOverrides: {},
    finishingMethods: {},
    applyLossRate: settings.useLossRateByDefault,
    lossRate: settings.useLossRateByDefault ? (lossPct || 0) / 100 : null,
    lossRateManual: false,
    buildingShape: D.buildingShape,
    roofShape: null,
    perimeterM: perimeter > 0 ? perimeter : null,
    ridgeCount: D.ridgeCount,
    parapetHeightCm: steel ? D.parapetHeightCm : null,
    eaveOverhangCm: overhang,
    railPerimeterM: steel ? autoRailPerimeter(sqm, D.buildingShape, D.parapetHeightCm) : null,
    rooftopStructurePerimeterM: rooftop ? D.rooftopStructurePerimeterM : null,
    rooftopStructureHeightCm: rooftop ? D.rooftopStructureHeightCm : null,
    rooftopDoorCount: rooftop ? D.rooftopDoorCount : 0,
    rooftopWindowCount: rooftop ? D.rooftopWindowCount : 0,
    downspoutCount: steel ? t.downspoutCount : (sides.size > 0 ? t.downspoutCount : 0),
    hasInsulation: false,
    insulationTypes: [],
    insulationNote: null,
    roofShapeNote: null,
    hasPeFoam: D.hasPeFoam,
    includeLodging: D.includeLodging,
    includeTeamExpense: D.includeTeamExpense,
    includeInsurance: D.includeInsurance,
    lodgingNights: null,
  };
}
