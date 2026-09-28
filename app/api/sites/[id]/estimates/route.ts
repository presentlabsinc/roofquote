import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";
import { calcTotals } from "@/lib/calculations";
import { PLACEHOLDER_COMPANY_NAME } from "@/lib/defaults";
import {
  InputError, computeEstimate, estimateColumns, parseEstimateBody, snapshotColumns,
} from "@/lib/estimate-input";

/** 한국 시간 기준 연도 (서버는 UTC — 1/1 00~09시 KST 견적이 전년도 번호를 받던 문제). */
function kstYear(now: Date): number {
  return new Date(now.getTime() + 9 * 3600_000).getUTCFullYear();
}

/**
 * 견적 번호 "YYYY-NNN" — 올해 이 사용자의 **가장 큰 번호 + 1** (시작값 이상).
 * 이전엔 '올해 견적 개수 + 시작값' 이라 견적을 삭제하면 번호가 중복됐다.
 */
async function nextEstimateNumber(userId: string, start: number, now: Date): Promise<string> {
  const year = kstYear(now);
  const prefix = `${year}-`;
  const existing = await prisma.estimate.findMany({
    where: { site: { userId }, estimateNumber: { startsWith: prefix } },
    select: { estimateNumber: true },
  });
  let max = 0;
  for (const e of existing) {
    const n = parseInt((e.estimateNumber ?? "").slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const seq = Math.max(start, max + 1);
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireUserAndSettings();
  const { id: siteId } = await params;

  // Ownership check — can't create an estimate for someone else's site.
  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 회사명 자리표시 그대로면 고객 견적서에 "회사명을 설정에서 입력하세요"가 찍힌다.
  if (!settings.companyName.trim() || settings.companyName === PLACEHOLDER_COMPANY_NAME) {
    return NextResponse.json({ error: "설정에서 회사명을 먼저 입력해 주세요" }, { status: 400 });
  }

  let input;
  try {
    input = parseEstimateBody(await req.json());
  } catch (e) {
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다" }, { status: 400 });
  }

  const now = new Date();
  const estimateNumber = await nextEstimateNumber(user.id, settings.estimateNumberStart ?? 1, now);
  const marginRate = input.marginRate ?? settings.defaultMarginRate;
  const vatIncl = input.vatIncluded ?? settings.vatIncludedByDefault;
  const { lineItemDrafts, effectiveLossRate } = computeEstimate(settings, input);
  const totals = calcTotals(lineItemDrafts, marginRate, vatIncl);

  const estimate = await prisma.estimate.create({
    data: {
      siteId,
      ...estimateColumns(input, effectiveLossRate),
      totalCost: totals.totalCost,
      marginMode: "percent",
      marginRate,
      marginAmount: totals.marginAmount,
      supplyPrice: totals.supplyPrice,
      vat: totals.vat,
      finalPrice: totals.finalPrice,
      vatIncluded: vatIncl,
      paymentTerms: input.paymentTerms ?? "계약금 10% / 잔금 90%",
      validityDays: input.validityDays ?? 30,
      estimateNumber,
      ...snapshotColumns(settings, site, now),
      lineItems: {
        create: lineItemDrafts,
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return NextResponse.json(estimate, { status: 201 });
}
