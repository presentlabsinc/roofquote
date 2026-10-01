/**
 * 번개 견적 (2026-10-01, 백로그 4-② · 스펙 "현장에서 1분 안에 견적 초안").
 *
 * 공사 유형 + 시공면적 + 평당가(부가세 별도) 세 가지만 받아 **일반 견적과 같은 Estimate** 를 만든다:
 *   - 라인 = 새 견적 폼에 유형·면적만 넣었을 때와 같은 값 (lib/estimate-defaults.ts defaultEstimatePayload
 *            → parseEstimateBody → computeEstimate, 사용자 설정 기본값)
 *   - 가격 = 공급가 = round(평당가 × 평수), 마진은 원가 기준 역산 (calcFromSupplyPrice, marginMode 'amount')
 *            — 견적 상세의 평당가 입력과 같은 규칙. 부가세 포함 여부는 설정 기본값.
 * 화면 미리보기(클라이언트)와 서버 라우트가 이 모듈을 같이 쓴다 — 순수 함수, 서버 전용 import 금지.
 * 오류 문구는 번개 견적 화면에 있는 칸(유형·면적·평당가) 기준으로 쓴다 — 화면에 없는 칸 이름을 보여 주지 않는다.
 */
import type { PricingSettings } from "@prisma/client";
import { calcFromSupplyPrice, sqmToPyeong } from "./calculations";
import { defaultEstimatePayload, workDaysDivisor } from "./estimate-defaults";
import {
  assertMoneyFitsDb, computeEstimate, DB_INT_MAX, InputError, MAX_AREA_M2, MAX_WORK_DAYS, MIN_AREA_M2,
  parseEstimateBody, type EstimateInput,
} from "./estimate-input";
import { CONSTRUCTION_TYPES, type ConstructionType } from "./types";

/** 시공면적 범위 — parseEstimateBody 와 같은 상수. 실제 상한은 설정에 따라 더 작을 수 있다 (quickMaxAreaM2). */
export const QUICK_MIN_AREA_M2 = MIN_AREA_M2;
export const QUICK_MAX_AREA_M2 = MAX_AREA_M2;
/** 평당가 상한 (오타 방지 — 1,000만 원/평). */
export const QUICK_MAX_PYEONG_PRICE = 10_000_000;

export const QUICK_SITE_NOT_FOUND = "현장을 찾을 수 없습니다 — 삭제됐을 수 있어요";
export const QUICK_SESSION_EXPIRED = "로그인이 만료되었습니다 — 다시 로그인해 주세요";
export const QUICK_NETWORK_ERROR = "서버에 연결하지 못했습니다 — 연결을 확인하고 다시 시도해 주세요";
const QUICK_FAILED = "번개 견적을 만들지 못했습니다";

/**
 * 번개 견적으로는 만들 수 없고 일반 견적 폼에서는 만들 수 있는 경우 (면적이 커서 작업 일수 자동값이 한도를 넘음,
 * 설정 기본값이 견적 검증 범위 밖). 화면은 '일반 견적으로 만들기' 링크를 같이 보여 준다.
 */
export class QuickNeedsFullFormError extends InputError {}

export interface QuickEstimateRequest {
  constructionType: ConstructionType;
  areaM2: number;
  /** 평당가 (원, 부가세 별도 = 공급가 기준). */
  pyeongPrice: number;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return n;
}

function fmt(n: number) { return n.toLocaleString("ko-KR"); }

/** 공급가 = round(평당가 × 평수), 평수 = sqmToPyeong(면적) (소수 2자리 — 견적 상세 평당가와 같은 평수). */
export function quickSupplyPrice(areaM2: number, pyeongPrice: number): number {
  return Math.round(pyeongPrice * sqmToPyeong(areaM2));
}

/**
 * 번개 견적으로 만들 수 있는 최대 시공면적 — 작업 일수 자동값(면적 ÷ 설정 '작업일수 자동 기준')이
 * 견적 검증 한도(365일)를 넘지 않는 범위, 최대 QUICK_MAX_AREA_M2. 공장값(90㎡/일)이면 32,850㎡.
 * 작업 일수 기준은 정수(설정 Int)라 이 면적 이하면 ceil(면적 ÷ 기준) ≤ 365 가 정확히 성립한다.
 */
export function quickMaxAreaM2(settings: Pick<PricingSettings, "workDaysAreaDivisor">): number {
  return Math.min(QUICK_MAX_AREA_M2, Math.floor(MAX_WORK_DAYS * workDaysDivisor(settings.workDaysAreaDivisor)));
}

/** 면적 범위 (설정과 무관한 부분). */
function assertQuickArea(areaM2: number): void {
  if (!Number.isFinite(areaM2)) throw new InputError("시공면적 값이 올바르지 않습니다");
  if (areaM2 < QUICK_MIN_AREA_M2) throw new InputError(`시공면적은 ${QUICK_MIN_AREA_M2}㎡ 이상이어야 합니다`);
  if (areaM2 > QUICK_MAX_AREA_M2) throw new InputError(`시공면적은 ${fmt(QUICK_MAX_AREA_M2)}㎡ 이하여야 합니다`);
}

/** 평당가 범위 + 공급가가 0원이 아니고 부가세 포함 최종가가 저장 범위 안인지. */
function assertQuickPrice(areaM2: number, pyeongPrice: number): void {
  if (pyeongPrice < 1) throw new InputError("평당가는 1원 이상이어야 합니다");
  if (pyeongPrice > QUICK_MAX_PYEONG_PRICE) {
    throw new InputError(`평당가는 ${fmt(QUICK_MAX_PYEONG_PRICE)}원 이하여야 합니다`);
  }
  const supply = quickSupplyPrice(areaM2, pyeongPrice);
  if (supply < 1) throw new InputError("평당가 × 평수가 0원입니다 — 면적이나 평당가를 확인해 주세요");
  if (supply + Math.round(supply * 0.1) > DB_INT_MAX) throw new InputError("견적 금액이 너무 큽니다 — 면적이나 평당가를 확인해 주세요");
}

/** 요청 본문 검증 — 잘못되면 InputError (한국어 메시지 → 400). 설정에 따른 면적 상한은 quickEstimateInput 이 본다. */
export function parseQuickEstimateBody(raw: unknown): QuickEstimateRequest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new InputError("요청 형식이 올바르지 않습니다");
  const b = raw as Record<string, unknown>;

  if (b.constructionType === undefined || b.constructionType === null || b.constructionType === "") {
    throw new InputError("공사 유형을 선택해 주세요");
  }
  const constructionType = b.constructionType as ConstructionType;
  if (!CONSTRUCTION_TYPES.some((c) => c.value === constructionType)) throw new InputError("공사 유형 값이 올바르지 않습니다");

  const areaM2 = toNumber(b.areaM2);
  if (areaM2 === null) throw new InputError("시공면적을 입력해 주세요");
  assertQuickArea(areaM2);

  const pyeongPrice = toNumber(b.pyeongPrice);
  if (pyeongPrice === null) throw new InputError("평당가를 입력해 주세요");
  if (!Number.isFinite(pyeongPrice) || !Number.isInteger(pyeongPrice)) throw new InputError("평당가는 원 단위 숫자로 입력해 주세요");
  assertQuickPrice(areaM2, pyeongPrice);

  return { constructionType, areaM2, pyeongPrice };
}

/**
 * 번개 견적의 입력 = 새 견적 폼에 유형·면적만 넣은 payload 를 서버와 같은 검증에 통과시킨 값.
 * 기본 payload 가 검증에 걸리면 화면에 없는 칸(작업 일수 등) 대신 번개 견적 기준 안내로 바꿔 던진다
 * (QuickNeedsFullFormError — 일반 견적 폼에선 그 칸을 직접 고쳐 만들 수 있다).
 */
export function quickEstimateInput(settings: PricingSettings, constructionType: ConstructionType, areaM2: number): EstimateInput {
  const maxArea = quickMaxAreaM2(settings);
  if (areaM2 > maxArea) {
    throw new QuickNeedsFullFormError(
      `번개 견적은 시공면적 ${fmt(maxArea)}㎡까지 만들 수 있습니다 (작업 일수를 면적으로 자동 계산 — 365일 한도). 더 크면 일반 견적으로 만들어 주세요`,
    );
  }
  try {
    return parseEstimateBody(defaultEstimatePayload(settings, constructionType, areaM2));
  } catch (e) {
    if (e instanceof InputError) {
      throw new QuickNeedsFullFormError(`설정 기본값으로는 만들 수 없습니다 (${e.message}) — 설정을 확인하거나 일반 견적으로 만들어 주세요`);
    }
    throw e;
  }
}

export type QuickEstimatePreview =
  | {
      ok: true;
      pyeong: number;
      totalCost: number;
      lineCount: number;
      vatIncluded: boolean;
      /** 평당가를 넣었을 때만. */
      pricing: ReturnType<typeof calcFromSupplyPrice> | null;
    }
  | {
      ok: false;
      /** 서버가 같은 입력에 돌려줄 400 문구와 같다. */
      error: string;
      /** 일반 견적 폼으로는 만들 수 있는 경우 (QuickNeedsFullFormError). */
      suggestFullForm: boolean;
    };

/**
 * 화면 미리보기 — 서버가 만들 견적과 같은 계산·같은 검증 (같은 설정이면 같은 숫자, 서버가 거절할 입력이면
 * 같은 문구의 { ok: false }). 면적을 아직 안 넣었으면(0 이하) null.
 */
export function previewQuickEstimate(
  settings: PricingSettings,
  constructionType: ConstructionType,
  areaM2: number,
  pyeongPrice: number | null,
): QuickEstimatePreview | null {
  if (!(areaM2 > 0)) return null;
  try {
    assertQuickArea(areaM2);
    const input = quickEstimateInput(settings, constructionType, areaM2);
    const { lineItemDrafts } = computeEstimate(settings, input);
    const totalCost = lineItemDrafts.reduce((s, i) => s + i.total, 0);
    const vatIncluded = settings.vatIncludedByDefault;
    let pricing: ReturnType<typeof calcFromSupplyPrice> | null = null;
    if (pyeongPrice !== null && pyeongPrice > 0) {
      assertQuickPrice(areaM2, pyeongPrice);
      pricing = calcFromSupplyPrice(totalCost, quickSupplyPrice(areaM2, pyeongPrice), vatIncluded);
    }
    // 저장 범위 — 서버 createEstimate 와 같은 확인 (평당가 전이면 원가·라인만).
    assertMoneyFitsDb(lineItemDrafts, { totalCost, ...(pricing ?? { marginAmount: 0, supplyPrice: 0, vat: 0, finalPrice: 0 }) });
    return { ok: true, pyeong: sqmToPyeong(areaM2), totalCost, lineCount: lineItemDrafts.length, vatIncluded, pricing };
  } catch (e) {
    if (e instanceof InputError) return { ok: false, error: e.message, suggestFullForm: e instanceof QuickNeedsFullFormError };
    throw e;
  }
}

/**
 * 생성 요청 실패 → 토스트 문구 (한국어). 401 은 proxy 가 영문 "Unauthorized" 를, 404 는 현장이 없을 때라
 * 상태로 고정 문구를 쓰고, 그 밖엔 서버의 한국어 { error } (없으면 기본 문구).
 */
export function quickErrorMessage(status: number, serverError: unknown): string {
  if (status === 401) return QUICK_SESSION_EXPIRED;
  if (status === 404) return QUICK_SITE_NOT_FOUND;
  return typeof serverError === "string" && serverError.trim() ? serverError : QUICK_FAILED;
}
