import type { PricingSettings } from "@prisma/client";

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
 */
export function applyPresetSnapshot(snapshot: unknown): Record<string, unknown> {
  if (!snapshot || typeof snapshot !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(snapshot as Record<string, unknown>)) {
    if (PRESET_EXCLUDE.has(k)) continue;
    out[k] = v;
  }
  return out;
}
