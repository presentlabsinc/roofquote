import type { PricingSettings } from "@prisma/client";
import { FACTORY_DEFAULTS } from "./defaults";

/**
 * 단가 프리셋 — 사용자가 이름 붙여 저장한 단가표 스냅샷.
 *
 * "활성 프리셋" 모델: 현재 설정(PricingSettings)이 곧 활성 프리셋이고,
 * 전환하면 프리셋의 snapshotJson 을 PricingSettings 에 복사한다.
 * PricingSettings 는 계속 라이브 행(견적이 스냅샷하는 그것) — 견적 로직은 안 건드린다.
 *
 * snapshotJson 범위 = **단가·계수 필드만**. 아래 PRESET_EXCLUDE 의 필드는 제외:
 * 회사 정체성·견적번호·시공이력·메타는 프리셋 전환이 건드리면 안 된다.
 */

/** 프리셋에 담지 않는 필드 (회사 정체성 / 채번 / 이력 / 메타 / 활성 추적). */
export const PRESET_EXCLUDE = new Set<string>([
  "id",
  "userId",
  "updatedAt",
  "companyName",
  "companyPhone",
  "companyAddress",
  "businessRegistrationNumber",
  "sealImageUrl",
  "bankAccount",
  "noticeText",
  "estimateNumberStart",
  "baselineData",
  "activePresetId",
]);

/** PricingSettings 에서 프리셋에 담을 단가·계수 필드만 추출. */
export function extractPresetSnapshot(settings: PricingSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (PRESET_EXCLUDE.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * 프리셋 snapshotJson 을 PricingSettings update 데이터로 변환.
 * 제외 필드(회사정보 등)는 안전망으로 한 번 더 걸러낸다 — 구버전 스냅샷이 회사정보를
 * 품고 있더라도 활성 전환이 회사 정체성을 덮어쓰지 않게.
 *
 * 스냅샷에 없는 단가·계수 필드는 **공장 기본값**으로 채운다 (2026-09-28). 프리셋을 만든 뒤에
 * 추가된 컬럼(예: 7/09 노브)이 프리셋 전환 때 이전 프리셋 값으로 남아, '그 프리셋'이 온전히
 * 복원되지 않던 문제. 그 컬럼이 없던 시절의 프리셋 = 그 값은 공장 기본이었다는 뜻.
 * (알 수 없는 키·잘못된 값 정리는 서버에서 sanitizeSettingsData(lenient) 가 한 번 더 한다.)
 */
export function applyPresetSnapshot(snapshot: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = { ...FACTORY_DEFAULTS };
  if (!snapshot || typeof snapshot !== "object") return out;
  for (const [k, v] of Object.entries(snapshot as Record<string, unknown>)) {
    if (PRESET_EXCLUDE.has(k)) continue;
    out[k] = v;
  }
  return out;
}
