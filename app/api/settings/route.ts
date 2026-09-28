import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";
import { SettingsInputError, sanitizeSettingsData } from "@/lib/settings-input";

/**
 * POST /api/settings — 설정 저장. 본문은 스키마 기준으로 검증·정리한다 (lib/settings-input).
 *
 * activePresetId 는 `null`(활성 해제)만 받는다 — '공장 기본값' 불러와 저장했을 때 서버의 활성
 * 프리셋이 남아 있으면 다음 [저장]이 그 프리셋을 공장값으로 덮어썼다 (2026-09-28 수정).
 * 특정 프리셋 활성화는 /api/presets/[id] 의 activate 로만.
 */
export async function POST(req: Request) {
  const { user } = await requireUserAndSettings();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다" }, { status: 400 });
  }

  let data: Record<string, unknown>;
  try {
    data = sanitizeSettingsData(raw);
  } catch (e) {
    if (e instanceof SettingsInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  if (typeof raw === "object" && raw !== null && (raw as Record<string, unknown>).activePresetId === null) {
    data.activePresetId = null;
  }
  if (typeof data.companyName === "string" && !data.companyName.trim()) {
    return NextResponse.json({ error: "회사명을 입력해 주세요" }, { status: 400 });
  }

  const updated = await prisma.pricingSettings.update({
    where: { userId: user.id },
    data,
  });
  // 직인 이전 파일은 지우지 않는다 — 과거 견적이 sealImageUrlSnapshot 으로 그 파일을
  // 가리키므로, 지우면 이미 발송한 견적서의 직인이 사라진다 (불변식 #2).
  return NextResponse.json(updated);
}
