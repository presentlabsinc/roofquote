import "server-only";
import type { PricingSettings, Site } from "@prisma/client";
import { prisma } from "./prisma";
import { calcFromSupplyPrice, calcTotals } from "./calculations";
import { PLACEHOLDER_COMPANY_NAME } from "./defaults";
import { assertMoneyFitsDb, computeEstimate, estimateColumns, snapshotColumns, type EstimateInput } from "./estimate-input";

/**
 * 견적 생성 (서버 전용) — 일반 견적(POST /api/sites/[id]/estimates)과 번개 견적
 * (POST /api/sites/[id]/estimates/quick)이 같은 경로로 만든다 (2026-10-01): 견적 번호 · 라인 계산 ·
 * 합계 · 입력 컬럼 · 스냅샷이 한 곳. 호출 전에 현장 소유 확인과 입력 검증(parseEstimateBody)은 라우트가 한다.
 * 금액이 저장 범위를 넘으면 InputError 를 던진다 — 라우트가 400 으로 돌려줄 것.
 */

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

/**
 * 회사명 자리표시 그대로면 고객 견적서에 "회사명을 설정에서 입력하세요"가 찍힌다 — 생성 전에 막는다.
 * 문제가 있으면 400 메시지, 없으면 null.
 */
export function companyNameError(settings: Pick<PricingSettings, "companyName">): string | null {
  if (!settings.companyName.trim() || settings.companyName === PLACEHOLDER_COMPANY_NAME) {
    return "설정에서 회사명을 먼저 입력해 주세요";
  }
  return null;
}

export async function createEstimate(args: {
  userId: string;
  settings: PricingSettings;
  site: Site;
  input: EstimateInput;
  /**
   * 공급가(부가세 전)를 정해서 만들 때 (번개 견적 — 평당가 × 평수). 마진은 원가 기준 역산, marginMode 'amount'.
   * 없으면 마진율(입력값 ?? 설정 기본 마진율)로 계산, marginMode 'percent'.
   */
  supplyPrice?: number;
}) {
  const { userId, settings, site, input, supplyPrice } = args;
  const now = new Date();
  const marginRate = input.marginRate ?? settings.defaultMarginRate;
  const vatIncl = input.vatIncluded ?? settings.vatIncludedByDefault;
  const { lineItemDrafts, effectiveLossRate } = computeEstimate(settings, input);
  const totals = calcTotals(lineItemDrafts, marginRate, vatIncl);
  const pricing = supplyPrice === undefined
    ? { marginMode: "percent", marginRate, ...totals }
    : { marginMode: "amount", totalCost: totals.totalCost, ...calcFromSupplyPrice(totals.totalCost, supplyPrice, vatIncl) };
  // 금액이 컬럼(32비트 정수)을 넘으면 저장이 500 으로 깨진다 — 그 전에 InputError (라우트가 400 으로).
  assertMoneyFitsDb(lineItemDrafts, pricing);
  const estimateNumber = await nextEstimateNumber(userId, settings.estimateNumberStart ?? 1, now);

  return prisma.estimate.create({
    data: {
      siteId: site.id,
      ...estimateColumns(input, effectiveLossRate),
      totalCost: pricing.totalCost,
      marginMode: pricing.marginMode,
      marginRate: pricing.marginRate,
      marginAmount: pricing.marginAmount,
      supplyPrice: pricing.supplyPrice,
      vat: pricing.vat,
      finalPrice: pricing.finalPrice,
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
}
