/**
 * 견적 생성(POST /api/sites/[id]/estimates) 과 전체 수정(PATCH replace) 공통 입력 처리.
 *
 * 2026-09-28 도입 — 이전엔 두 라우트가 ~60개 필드를 각자 구조분해·기본값·저장해서
 * 한쪽만 고치면 다른 쪽이 어긋났고, 서버 검증이 없어 음수·NaN·임의 타입이 그대로 DB·엔진에
 * 흘러갔다(외부 감사 L5). 여기서 한 번에:
 *   1. parseEstimateBody — 타입·범위 검증 + 기본값 (잘못된 값은 InputError → 400)
 *   2. computeEstimate   — 로스율 결정 + buildLineItems
 *   3. estimateColumns   — Estimate 입력 컬럼 (create/update 공용)
 *   4. snapshotColumns   — 발송본 고정용 스냅샷 (회사·고객·마진 분배 비율·발행일)
 */
import type { PricingSettings, Site } from "@prisma/client";
import { buildLineItems, resolveEffectiveLossRate } from "./calculations";
import type { CatalogSelection, GroupModesMap } from "./catalog";
import {
  BUILDING_SHAPES, CONSTRUCTION_TYPES, MATERIAL_TYPES, ROOF_SHAPES, THICKNESSES,
  type BuildingShape, type ConstructionType, type ExtraCost, type FinishingMethods,
  type MaterialType, type PricingOverrides, type RoofShape, type ScopeFlags,
  type SubstructureType, type Thickness,
} from "./types";

export class InputError extends Error {}

// ─── 작은 검증 헬퍼 ────────────────────────────────────────────────────
type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 숫자 (숫자 문자열 허용). null/undefined/"" → fallback. 범위 밖·NaN → InputError. */
function num(v: unknown, label: string, opts: { min?: number; max?: number; int?: boolean } = {}, fallback: number | null = null): number | null {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new InputError(`${label} 값이 올바르지 않습니다`);
  if (opts.min !== undefined && n < opts.min) throw new InputError(`${label}은(는) ${opts.min} 이상이어야 합니다`);
  if (opts.max !== undefined && n > opts.max) throw new InputError(`${label}은(는) ${opts.max} 이하여야 합니다`);
  return opts.int ? Math.round(n) : n;
}

function reqNum(v: unknown, label: string, opts: { min?: number; max?: number; int?: boolean } = {}): number {
  const n = num(v, label, opts, null);
  if (n === null) throw new InputError(`${label}을(를) 입력해 주세요`);
  return n;
}

function str(v: unknown, label: string, max = 500): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new InputError(`${label} 값이 올바르지 않습니다`);
  if (v.length > max) throw new InputError(`${label}이(가) 너무 깁니다 (${max}자 이하)`);
  return v;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], label: string, fallback: T | null): T | null {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v !== "string" || !allowed.includes(v as T)) throw new InputError(`${label} 값이 올바르지 않습니다`);
  return v as T;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

// ─── 입력 타입 ───────────────────────────────────────────────────────────
export interface EstimateInput {
  constructionType: ConstructionType;
  materialType: MaterialType | null;
  materialThickness: Thickness | null;
  materialTexture: string | null;
  materialColor: string | null;
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
  warehouseAreaM2: number | null;
  stairwellAreaM2: number | null;
  skyliftDays: number;
  ladderTruckDays: number;
  scaffoldDays: number;
  scaffoldAreaM2: number;
  wasteTruckCount: number;
  substructureType: SubstructureType | null;
  otherEquipment: string | null;
  scopeFlags: ScopeFlags;
  extraCosts: ExtraCost[];
  pricingOverrides: PricingOverrides;
  finishingMethods: FinishingMethods;
  catalogSelections: CatalogSelection[];
  catalogModes: GroupModesMap;
  applyLossRate: boolean;
  /** 사용자가 입력한 로스율 (0~1). null = 정책(설정·지붕형태)대로. */
  lossRate: number | null;
  /** true 면 lossRate 를 그대로 쓴다 (자동 모드의 형태별 값보다 우선). */
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
  insulationTypes: string[];
  insulationNote: string | null;
  roofShapeNote: string | null;
  hasPeFoam: boolean;
  includeLodging: boolean;
  includeTeamExpense: boolean;
  includeInsurance: boolean;
  lodgingNights: number | null;
  marginRate: number | undefined;
  vatIncluded: boolean | undefined;
  paymentTerms: string | undefined;
  validityDays: number | undefined;
}

const CONSTRUCTION_VALUES = CONSTRUCTION_TYPES.map((c) => c.value);
const MATERIAL_VALUES = MATERIAL_TYPES.map((m) => m.value);
const BUILDING_VALUES = BUILDING_SHAPES.map((b) => b.value);
const ROOF_VALUES = ROOF_SHAPES.map((r) => r.value);

/** 마진율 검증 — 매출 대비라 1(100%) 이상은 수학적으로 불가, 99% 초과는 계산에서 클램프되어
 *  저장값과 실제 적용값이 달라지므로 거부. 음수(손해 견적)는 허용. */
export function parseMarginRate(v: unknown): number {
  const n = reqNum(v, "마진율", { min: -1, max: 0.99 });
  return n;
}

export function parseEstimateBody(raw: unknown): EstimateInput {
  if (!isObj(raw)) throw new InputError("요청 형식이 올바르지 않습니다");
  const b = raw;

  const scopeFlags: ScopeFlags = {};
  if (b.scopeFlags !== undefined && b.scopeFlags !== null) {
    if (!isObj(b.scopeFlags)) throw new InputError("공사 범위 값이 올바르지 않습니다");
    for (const [k, v] of Object.entries(b.scopeFlags)) {
      if (typeof v === "boolean") (scopeFlags as Record<string, boolean>)[k] = v;
    }
  }

  const extraCosts: ExtraCost[] = [];
  if (Array.isArray(b.extraCosts)) {
    for (const ec of b.extraCosts) {
      if (!isObj(ec)) continue;
      const name = (str(ec.name, "기타 비용 이름", 100) ?? "").trim();
      const amount = num(ec.amount, "기타 비용 금액", { min: 0, max: 10_000_000_000, int: true }, 0) ?? 0;
      if (!name || amount <= 0) continue;
      extraCosts.push({ name, amount, ...(typeof ec.note === "string" ? { note: ec.note.slice(0, 200) } : {}) });
    }
  }

  const pricingOverrides: PricingOverrides = {};
  if (isObj(b.pricingOverrides)) {
    for (const [k, v] of Object.entries(b.pricingOverrides)) {
      const n = num(v, `단가 조정(${k})`, { min: 0, max: 100_000_000 }, null);
      if (n !== null) (pricingOverrides as Record<string, number>)[k] = n;
    }
  }

  const finishingMethods: FinishingMethods = {};
  if (isObj(b.finishingMethods)) {
    for (const [k, v] of Object.entries(b.finishingMethods)) {
      if ((k === "ridge" || k === "mishi" || k === "fascia") && (v === "bending" || v === "ready")) {
        finishingMethods[k] = v;
      }
    }
  }

  const catalogSelections: CatalogSelection[] = [];
  if (Array.isArray(b.catalogSelections)) {
    for (const s of b.catalogSelections) {
      if (!isObj(s)) continue;
      const quantity = num(s.quantity, "추가 자재 수량", { min: 0, max: 1_000_000 }, 0) ?? 0;
      const unitPrice = num(s.unitPrice, "추가 자재 단가", { min: 0, max: 100_000_000 }, 0) ?? 0;
      catalogSelections.push({
        category: String(s.category ?? "") as CatalogSelection["category"],
        key: String(s.key ?? "").slice(0, 100),
        label: String(s.label ?? "").slice(0, 100),
        unit: String(s.unit ?? "").slice(0, 20),
        quantity,
        unitPrice,
      });
    }
  }

  const catalogModes: GroupModesMap = {};
  if (isObj(b.catalogModes)) {
    for (const [g, m] of Object.entries(b.catalogModes)) {
      if (!isObj(m)) continue;
      const mode = m.mode === "detailed" ? "detailed" : "simple";
      const simpleType = oneOf(m.simpleType, ["percent", "perSqm", "perM", "total"] as const, "계산 방식", null) ?? undefined;
      (catalogModes as Record<string, unknown>)[g] = {
        ...(typeof m.enabled === "boolean" ? { enabled: m.enabled } : {}),
        mode,
        ...(simpleType ? { simpleType } : {}),
        ...(m.simpleValue !== undefined ? { simpleValue: num(m.simpleValue, "추가 자재 값", { min: 0, max: 1_000_000_000 }, 0) ?? 0 } : {}),
        ...(m.simpleQty !== undefined ? { simpleQty: num(m.simpleQty, "추가 자재 수량", { min: 0, max: 1_000_000 }, 0) ?? 0 } : {}),
        ...(m.detailWidthMm !== undefined ? { detailWidthMm: num(m.detailWidthMm, "절곡 넓이", { min: 0, max: 10_000_000 }, 0) ?? 0 } : {}),
      };
    }
  }

  const insulationTypes = Array.isArray(b.insulationTypes)
    ? b.insulationTypes.filter((t): t is string => typeof t === "string").slice(0, 10)
    : [];

  const constructionMonth = str(b.constructionMonth, "공사 일정", 10);
  if (constructionMonth && !/^\d{4}-\d{2}(-\d{2})?$/.test(constructionMonth)) {
    throw new InputError("공사 일정 형식이 올바르지 않습니다");
  }

  return {
    constructionType: oneOf(b.constructionType, CONSTRUCTION_VALUES, "공사 유형", "roof") as ConstructionType,
    materialType: oneOf(b.materialType, MATERIAL_VALUES, "강판 종류", null),
    materialThickness: oneOf(b.materialThickness, THICKNESSES, "두께", "0.45"),
    materialTexture: str(b.materialTexture, "텍스처", 50),
    materialColor: str(b.materialColor, "색상", 50),
    constructionMonth,
    areaM2: reqNum(b.areaM2, "시공면적", { min: 0.1, max: 100_000 }),
    buildingAreaM2: num(b.buildingAreaM2, "건물면적", { min: 0, max: 100_000 }),
    workerCount: reqNum(b.workerCount, "작업 인원", { min: 1, max: 100, int: true }),
    workDays: reqNum(b.workDays, "작업 일수", { min: 0.5, max: 365 }),
    gutterMode: str(b.gutterMode, "물받이", 40),
    gutterLengthM: num(b.gutterLengthM, "물받이 길이", { min: 0, max: 10_000 }, 0) ?? 0,
    stainlessDrainLengthM: num(b.stainlessDrainLengthM, "배수로 길이", { min: 0, max: 10_000 }, 0) ?? 0,
    capLengthM: num(b.capLengthM, "두겁 길이", { min: 0, max: 10_000 }, 0) ?? 0,
    drainHoleCount: num(b.drainHoleCount, "배수구 타공 개수", { min: 0, max: 1000, int: true }, 0) ?? 0,
    endCapCount: num(b.endCapCount, "엔드캡 개수", { min: 0, max: 1000, int: true }, 0) ?? 0,
    denjoCount: num(b.denjoCount, "처마/덴조 건수", { min: 0, max: 1000, int: true }, 0) ?? 0,
    warehouseAreaM2: num(b.warehouseAreaM2, "창고 면적", { min: 0, max: 100_000 }),
    stairwellAreaM2: num(b.stairwellAreaM2, "계단실 면적", { min: 0, max: 100_000 }),
    skyliftDays: num(b.skyliftDays, "스카이차 일수", { min: 0, max: 365 }, 0) ?? 0,
    ladderTruckDays: num(b.ladderTruckDays, "사다리차 일수", { min: 0, max: 365 }, 0) ?? 0,
    scaffoldDays: num(b.scaffoldDays, "비계 일수", { min: 0, max: 365 }, 0) ?? 0,
    scaffoldAreaM2: num(b.scaffoldAreaM2, "비계 면적", { min: 0, max: 100_000 }, 0) ?? 0,
    wasteTruckCount: num(b.wasteTruckCount, "폐기물 트럭 수", { min: 1, max: 100, int: true }, 1) ?? 1,
    substructureType: oneOf(b.substructureType, ["wood", "steel"] as const, "하지", null),
    otherEquipment: str(b.otherEquipment, "기타 장비", 500),
    scopeFlags,
    extraCosts,
    pricingOverrides,
    finishingMethods,
    catalogSelections,
    catalogModes,
    applyLossRate: bool(b.applyLossRate, false),
    lossRate: num(b.lossRate, "로스율", { min: 0, max: 1 }),
    lossRateManual: bool(b.lossRateManual, false),
    buildingShape: oneOf(b.buildingShape, BUILDING_VALUES, "건물 형태", null),
    roofShape: oneOf(b.roofShape, ROOF_VALUES, "지붕 형태", null),
    perimeterM: num(b.perimeterM, "둘레", { min: 0, max: 100_000 }),
    ridgeCount: num(b.ridgeCount, "용마루 개수", { min: 1, max: 20, int: true }, 1) ?? 1,
    parapetHeightCm: num(b.parapetHeightCm, "파라펫 높이", { min: 0, max: 1000 }),
    eaveOverhangCm: num(b.eaveOverhangCm, "처마 돌출", { min: 0, max: 500 }, 50) ?? 50,
    railPerimeterM: num(b.railPerimeterM, "난간 둘레", { min: 0, max: 100_000 }),
    rooftopStructurePerimeterM: num(b.rooftopStructurePerimeterM, "옥탑 둘레", { min: 0, max: 100_000 }),
    rooftopStructureHeightCm: num(b.rooftopStructureHeightCm, "옥탑 높이", { min: 0, max: 5000 }),
    rooftopDoorCount: num(b.rooftopDoorCount, "옥탑 출입문 수", { min: 0, max: 100, int: true }, 0) ?? 0,
    rooftopWindowCount: num(b.rooftopWindowCount, "옥탑 창문 수", { min: 0, max: 100, int: true }, 0) ?? 0,
    downspoutCount: num(b.downspoutCount, "선홈통 개수", { min: 0, max: 100, int: true }, 0) ?? 0,
    hasInsulation: bool(b.hasInsulation, false),
    insulationTypes,
    insulationNote: str(b.insulationNote, "단열재 메모", 200),
    roofShapeNote: str(b.roofShapeNote, "지붕 형태 메모", 200),
    hasPeFoam: bool(b.hasPeFoam, false),
    includeLodging: bool(b.includeLodging, false),
    includeTeamExpense: bool(b.includeTeamExpense, false),
    includeInsurance: bool(b.includeInsurance, true),
    lodgingNights: num(b.lodgingNights, "숙박 박수", { min: 0, max: 365, int: true }),
    marginRate: b.marginRate === undefined || b.marginRate === null ? undefined : parseMarginRate(b.marginRate),
    vatIncluded: typeof b.vatIncluded === "boolean" ? b.vatIncluded : undefined,
    paymentTerms: b.paymentTerms === undefined || b.paymentTerms === null ? undefined : (str(b.paymentTerms, "결제 조건", 500) ?? undefined),
    validityDays: b.validityDays === undefined || b.validityDays === null ? undefined : (num(b.validityDays, "유효기간", { min: 1, max: 365, int: true }) ?? undefined),
  };
}

// ─── 계산 ────────────────────────────────────────────────────────────────
/**
 * 로스율 결정 규칙 (2026-09-28):
 *   - 사용자가 폼에서 직접 고친 값(lossRateManual) → 그 값 그대로
 *   - 아니면 설정 정책: 자동 모드 + 지붕형태 → 형태별 값, 그 외 → 입력값 ?? 설정 기본 로스율
 * (이전엔 자동 모드가 사용자가 입력한 값을 알리지 않고 덮어썼다.)
 */
export function effectiveLossRateFor(settings: PricingSettings, input: EstimateInput): number {
  if (input.lossRateManual && input.lossRate !== null) return input.lossRate;
  const s = settings as unknown as { lossRateMode?: string; roofShapeLossRates?: Record<string, number> | null };
  return resolveEffectiveLossRate(
    s.lossRateMode,
    input.roofShape,
    input.lossRate ?? settings.defaultLossRate,
    s.roofShapeLossRates ?? null,
  );
}

export function computeEstimate(settings: PricingSettings, input: EstimateInput) {
  const effectiveLossRate = effectiveLossRateFor(settings, input);
  const lineItemDrafts = buildLineItems({
    settings,
    constructionType: input.constructionType,
    materialType: input.materialType,
    thickness: input.materialThickness,
    areaM2: input.areaM2,
    scope: input.scopeFlags,
    workerCount: input.workerCount,
    workDays: input.workDays,
    gutterMode: input.gutterMode,
    gutterLengthM: input.gutterLengthM,
    stainlessDrainLengthM: input.stainlessDrainLengthM,
    capLengthM: input.capLengthM,
    drainHoleCount: input.drainHoleCount,
    endCapCount: input.endCapCount,
    denjoCount: input.denjoCount,
    skyliftDays: input.skyliftDays,
    ladderTruckDays: input.ladderTruckDays,
    scaffoldDays: input.scaffoldDays,
    scaffoldAreaM2: input.scaffoldAreaM2,
    wasteTruckCount: input.wasteTruckCount,
    substructureType: input.substructureType,
    extraCosts: input.extraCosts,
    pricingOverrides: input.pricingOverrides,
    finishingMethods: input.finishingMethods,
    catalogSelections: input.catalogSelections,
    catalogModes: input.catalogModes,
    applyLossRate: input.applyLossRate,
    lossRate: effectiveLossRate,
    buildingShape: input.buildingShape,
    roofShape: input.roofShape,
    buildingAreaM2: input.buildingAreaM2,
    perimeterM: input.perimeterM,
    ridgeCount: input.ridgeCount,
    parapetHeightCm: input.parapetHeightCm,
    eaveOverhangCm: input.eaveOverhangCm,
    railPerimeterM: input.railPerimeterM,
    rooftopStructurePerimeterM: input.rooftopStructurePerimeterM,
    rooftopStructureHeightCm: input.rooftopStructureHeightCm,
    rooftopDoorCount: input.rooftopDoorCount,
    rooftopWindowCount: input.rooftopWindowCount,
    downspoutCount: input.downspoutCount,
    hasInsulation: input.hasInsulation,
    insulationTypes: input.insulationTypes,
    hasPeFoam: input.hasPeFoam,
    includeLodging: input.includeLodging,
    includeTeamExpense: input.includeTeamExpense,
    includeInsurance: input.includeInsurance,
    lodgingNights: input.lodgingNights,
  });
  return { lineItemDrafts, effectiveLossRate };
}

// ─── 저장 컬럼 ───────────────────────────────────────────────────────────
/** Estimate 입력 컬럼 — create / replace update 공용. */
export function estimateColumns(input: EstimateInput, effectiveLossRate: number) {
  return {
    constructionType: input.constructionType,
    materialType: input.materialType,
    materialThickness: input.materialThickness,
    materialTexture: input.materialTexture,
    materialColor: input.materialColor,
    constructionMonth: input.constructionMonth,
    areaM2: input.areaM2,
    buildingAreaM2: input.buildingAreaM2 || null,
    workerCount: input.workerCount,
    workDays: input.workDays,
    gutterMode: input.gutterMode || null,
    gutterLengthM: input.gutterLengthM || null,
    stainlessDrainLengthM: input.stainlessDrainLengthM || null,
    capLengthM: input.capLengthM || null,
    drainHoleCount: input.drainHoleCount,
    endCapCount: input.endCapCount,
    denjoCount: input.denjoCount,
    warehouseAreaM2: input.warehouseAreaM2 || null,
    stairwellAreaM2: input.stairwellAreaM2 || null,
    skyliftDays: input.skyliftDays || null,
    ladderTruckDays: input.ladderTruckDays || null,
    scaffoldDays: input.scaffoldDays || null,
    scaffoldAreaM2: input.scaffoldAreaM2 || null,
    wasteTruckCount: input.wasteTruckCount,
    substructureType: input.substructureType,
    otherEquipment: input.otherEquipment,
    scopeFlags: input.scopeFlags as object,
    applyLossRate: input.applyLossRate,
    lossRate: input.applyLossRate ? effectiveLossRate : null,
    buildingShape: input.buildingShape,
    roofShape: input.roofShape,
    perimeterM: input.perimeterM || null,
    ridgeCount: input.ridgeCount,
    parapetHeightCm: input.parapetHeightCm || null,
    eaveOverhangCm: input.eaveOverhangCm,
    railPerimeterM: input.railPerimeterM,
    rooftopStructurePerimeterM: input.rooftopStructurePerimeterM,
    rooftopStructureHeightCm: input.rooftopStructureHeightCm,
    rooftopDoorCount: input.rooftopDoorCount,
    rooftopWindowCount: input.rooftopWindowCount,
    downspoutCount: input.downspoutCount,
    hasInsulation: input.hasInsulation,
    insulationTypes: input.insulationTypes as unknown as object,
    insulationNote: input.insulationNote || null,
    roofShapeNote: input.roofShapeNote || null,
    hasPeFoam: input.hasPeFoam,
    includeLodging: input.includeLodging,
    includeTeamExpense: input.includeTeamExpense,
    includeInsurance: input.includeInsurance,
    lodgingNights: input.lodgingNights && input.lodgingNights > 0 ? input.lodgingNights : null,
    // 기타 비용 원본 — 수정 폼이 복원할 수 있게 저장 (이전엔 라인으로만 남아 수정 시 소실).
    extraCosts: input.extraCosts as unknown as object,
    catalogSelections: input.catalogSelections.filter((s) => s.quantity > 0) as unknown as object,
    catalogModes: input.catalogModes as object,
    pricingOverrides: input.pricingOverrides as object,
    finishingMethods: input.finishingMethods as object,
  };
}

/**
 * 발송본 고정 스냅샷 — 생성·전체 수정(재발행) 시점의 값을 견적에 박제한다.
 * PDF 는 이 값만 읽는다 (없으면 구 견적 → 라이브 폴백). 이후 현장 정보·설정·프리셋이
 * 바뀌어도 이미 만든 견적서는 그대로 (불변식 #2·#3).
 */
export function snapshotColumns(settings: PricingSettings, site: Pick<Site, "customerName" | "siteAddress">, now: Date) {
  return {
    companyNameSnapshot: settings.companyName,
    companyPhoneSnapshot: settings.companyPhone ?? null,
    companyAddressSnapshot: settings.companyAddress ?? null,
    businessRegistrationNumberSnapshot: settings.businessRegistrationNumber ?? null,
    sealImageUrlSnapshot: settings.sealImageUrl ?? null,
    bankAccountSnapshot: settings.bankAccount ?? null,
    noticeTextSnapshot: settings.noticeText ?? null,
    customerNameSnapshot: site.customerName ?? null,
    siteAddressSnapshot: site.siteAddress ?? null,
    marginMaterialRatioSnapshot: settings.marginMaterialRatio,
    marginLaborRatioSnapshot: settings.marginLaborRatio,
    marginProfitRatioSnapshot: settings.marginProfitRatio,
    issuedAt: now,
  };
}
