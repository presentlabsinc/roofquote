import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";
import { companyNameError, createEstimate } from "@/lib/estimate-create";
import { InputError, parseEstimateBody } from "@/lib/estimate-input";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireUserAndSettings();
  const { id: siteId } = await params;

  // Ownership check — can't create an estimate for someone else's site.
  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 회사명 자리표시 그대로면 고객 견적서에 "회사명을 설정에서 입력하세요"가 찍힌다.
  const companyError = companyNameError(settings);
  if (companyError) {
    return NextResponse.json({ error: companyError }, { status: 400 });
  }

  let input;
  try {
    input = parseEstimateBody(await req.json());
  } catch (e) {
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다" }, { status: 400 });
  }

  // 견적 번호·라인·합계·스냅샷 — 번개 견적(./quick)과 같은 생성 경로 (lib/estimate-create.ts).
  // 금액이 저장 범위(32비트 정수)를 넘으면 InputError → 400 (이전엔 DB 오류로 500).
  let estimate;
  try {
    estimate = await createEstimate({ userId: user.id, settings, site, input });
  } catch (e) {
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  return NextResponse.json(estimate, { status: 201 });
}
