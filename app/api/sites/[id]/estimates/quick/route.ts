import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";
import { companyNameError, createEstimate } from "@/lib/estimate-create";
import { InputError } from "@/lib/estimate-input";
import { parseQuickEstimateBody, quickEstimateInput, quickSupplyPrice, QUICK_SITE_NOT_FOUND } from "@/lib/quick-estimate";

/**
 * 번개 견적 — { constructionType, areaM2, pyeongPrice } 세 값으로 일반 견적을 만든다 (lib/quick-estimate.ts).
 * 라인은 새 견적 폼에 유형·면적만 넣었을 때와 같고, 공급가 = round(평당가 × 평수) · 마진 역산 (mode 'amount').
 * 생성 경로(번호·스냅샷·라인)는 일반 POST 와 같다 (lib/estimate-create.ts).
 * 오류는 모두 한국어 { error } — 번개 견적 폼이 그대로 토스트로 보여 준다.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireUserAndSettings();
  const { id: siteId } = await params;

  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) {
    return NextResponse.json({ error: QUICK_SITE_NOT_FOUND }, { status: 404 });
  }

  const companyError = companyNameError(settings);
  if (companyError) {
    return NextResponse.json({ error: companyError }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다" }, { status: 400 });
  }

  try {
    const quick = parseQuickEstimateBody(raw);
    // 설정 기본값으로 만든 payload 가 서버 검증에 걸리면 (예: 면적이 커서 작업 일수 자동값이 365일 초과)
    // 번개 견적 화면에 없는 칸 이름 대신 번개 견적용 안내로 바꿔 던진다 (lib/quick-estimate.ts).
    const input = quickEstimateInput(settings, quick.constructionType, quick.areaM2);
    // 금액이 저장 범위를 넘으면 createEstimate 가 InputError (→ 400).
    const estimate = await createEstimate({
      userId: user.id,
      settings,
      site,
      input,
      supplyPrice: quickSupplyPrice(quick.areaM2, quick.pyeongPrice),
    });
    return NextResponse.json({ id: estimate.id, siteId }, { status: 201 });
  } catch (e) {
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
