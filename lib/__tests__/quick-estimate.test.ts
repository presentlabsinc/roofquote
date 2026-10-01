/**
 * 번개 견적 (2026-10-01) — 기본 payload · 공급가 기준 합계 · 입력 검증 · 생성 라우트 (DB·인증은 가짜).
 * 기본 payload 가 실제 견적 폼(유형·면적만 입력)의 제출값과 같은지는 브라우저에서 따로 확인했다 (AGENTS.md 번개 견적).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PricingSettings, Site } from "@prisma/client";
import { FACTORY_DEFAULTS } from "../defaults";
import { calcFromSupplyPrice, calcTotals, sqmToPyeong } from "../calculations";
import {
  autoRailPerimeter, constructionTypeDefaults, defaultEstimatePayload,
} from "../estimate-defaults";
import {
  assertMoneyFitsDb, computeEstimate, DB_INT_MAX, DB_INT_MIN, InputError, MONEY_TOO_LARGE_MESSAGE, parseEstimateBody,
} from "../estimate-input";
import { draftPayloadToInitial } from "../estimate-draft";
import {
  parseQuickEstimateBody, previewQuickEstimate, quickErrorMessage, quickEstimateInput, quickMaxAreaM2,
  QuickNeedsFullFormError, quickSupplyPrice, QUICK_SESSION_EXPIRED, QUICK_SITE_NOT_FOUND,
} from "../quick-estimate";
import type { ConstructionType } from "../types";

vi.mock("server-only", () => ({}));

const USER = { id: "3f2b8c1e-9a4d-4c7e-8b21-0d5e6f7a8b9c", email: null };
const SITE_ID = "site_abc123";
const EST_ID = "est_xyz789";

const settings = {
  ...FACTORY_DEFAULTS,
  id: "s1", userId: USER.id, companyName: "테스트지붕",
  companyPhone: null, companyAddress: null, businessRegistrationNumber: null,
  sealImageUrl: null, bankAccount: null, noticeText: null,
  estimateNumberStart: 1, baselineData: null, activePresetId: null,
  updatedAt: new Date(0),
} as unknown as PricingSettings;

/** 기본값과 다른 설정 — 설정이 기본 payload 에 반영되는지. */
const custom = {
  ...settings,
  substructureMode: "steel",
  useLossRateByDefault: false,
  defaultLossRate: 0.045,
  defaultWorkerCount: 5,
  workDaysAreaDivisor: 40,
  constructionToBuildingRatio: 1.25,
  vatIncludedByDefault: false,
} as unknown as PricingSettings;

const site = {
  id: SITE_ID, userId: USER.id, customerName: "김고객", customerPhone: null, siteAddress: "서울 강남구",
  photos: [], generalMemo: null, createdAt: new Date(0), updatedAt: new Date(0),
} as unknown as Site;

const TYPES: ConstructionType[] = ["roof", "rooftopRoof", "steelWaterproof"];

// ─── 기본 payload ─────────────────────────────────────────────────────────
describe("defaultEstimatePayload — 유형·면적만 넣은 새 견적", () => {
  it.each(TYPES.flatMap((t) => [57.3, 99.17, 330.58].flatMap((a) => [[t, a, "factory"], [t, a, "custom"]] as const)))(
    "%s %s㎡ (%s 설정) — 서버 검증 통과 + 라인 생성 + 초안 복원 가능",
    (t, area, which) => {
      const s = which === "factory" ? settings : custom;
      const payload = defaultEstimatePayload(s, t, area);
      const input = parseEstimateBody(payload); // 던지면 실패
      const { lineItemDrafts } = computeEstimate(s, input);
      expect(lineItemDrafts.length).toBeGreaterThan(3);
      expect(lineItemDrafts.reduce((sum, l) => sum + l.total, 0)).toBeGreaterThan(0);
      expect(lineItemDrafts.every((l) => Number.isFinite(l.total) && l.total >= 0)).toBe(true);
      expect(draftPayloadToInitial(payload)).not.toBeNull(); // 폼 초안과 같은 모양
    },
  );

  it("지붕공사 100㎡ — 폼 기본값·자동값 그대로", () => {
    const p = defaultEstimatePayload(settings, "roof", 100);
    expect(p).toMatchObject({
      constructionType: "roof", materialType: "zinc250", materialThickness: "0.45", materialTexture: "스톤",
      materialColor: "진밤색", constructionMonth: null, areaM2: 100, buildingAreaM2: null,
      workerCount: 3, workDays: 2, // max(2, ceil(100/90))
      scopeFlags: { ridge: true, overlay: true },
      gutterMode: "front,back",
      perimeterM: 36, // round(√(100/1.4) × 4.2) = round(35.5)
      gutterLengthM: 24, // round((36 + 8×0.5) × 0.6)
      eaveOverhangCm: 50, parapetHeightCm: null, railPerimeterM: null,
      downspoutCount: 4, stainlessDrainLengthM: 0, substructureType: "wood",
      applyLossRate: true, lossRate: 0.1, lossRateManual: false,
      buildingShape: "rectangle", roofShape: null, hasPeFoam: true,
      includeInsurance: true, includeLodging: false, includeTeamExpense: false,
      catalogModes: {}, catalogSelections: [], pricingOverrides: {}, finishingMethods: {}, extraCosts: [],
    });
  });

  it("옥상방수 100㎡ — 난간 둘레·배수로 자동, 물받이 없음, 홈통 1", () => {
    const p = defaultEstimatePayload(settings, "steelWaterproof", 100);
    expect(p).toMatchObject({
      materialType: "slate", scopeFlags: { handrail: true, cap: true },
      gutterMode: null, gutterLengthM: 0, stainlessDrainLengthM: 10, downspoutCount: 1,
      parapetHeightCm: 60, eaveOverhangCm: 0, railPerimeterM: autoRailPerimeter(100, "rectangle", 60),
      rooftopStructurePerimeterM: null, rooftopStructureHeightCm: null, rooftopDoorCount: 0,
    });
    expect(p.railPerimeterM).toBeGreaterThan(30);
  });

  it("설정 기본값을 따른다 — 하지·인원·로스율 토글·작업일수 기준", () => {
    const p = defaultEstimatePayload(custom, "rooftopRoof", 100);
    expect(p).toMatchObject({
      substructureType: "steel", workerCount: 5, applyLossRate: false, lossRate: null,
      workDays: 3, // ceil(100/40)
      perimeterM: 42, // 옥상지붕: √100 × 4.2 (÷비율 없음)
      eaveOverhangCm: 0,
    });
  });

  it("유형 기본값은 매번 새 객체 (폼이 고쳐도 다음 기본값에 안 섞임)", () => {
    const a = constructionTypeDefaults("roof", settings);
    a.scopeFlags.removal = true;
    a.gutterSides.push("left");
    expect(constructionTypeDefaults("roof", settings)).toEqual({
      scopeFlags: { ridge: true, overlay: true }, materialType: "zinc250",
      gutterSides: ["front", "back"], downspoutCount: 4, substructureType: "wood",
    });
  });
});

// ─── 공급가 기준 합계 ─────────────────────────────────────────────────────
describe("calcFromSupplyPrice — 평당가 입력·번개 견적 공용", () => {
  it("마진 = 공급가 − 원가, 마진율은 매출 대비, 부가세 포함", () => {
    expect(calcFromSupplyPrice(8_000_000, 10_000_000, true)).toEqual({
      marginAmount: 2_000_000, marginRate: 0.2, supplyPrice: 10_000_000, vat: 1_000_000, finalPrice: 11_000_000,
    });
  });
  it("부가세 별도면 최종가 = 공급가 (부가세 금액은 기록)", () => {
    expect(calcFromSupplyPrice(1_000, 1_235, false)).toEqual({
      marginAmount: 235, marginRate: 235 / 1_235, supplyPrice: 1_235, vat: 124, finalPrice: 1_235,
    });
  });
  it("손해 견적 — 음수 마진 허용", () => {
    const r = calcFromSupplyPrice(10_000_000, 8_000_000, true);
    expect(r.marginAmount).toBe(-2_000_000);
    expect(r.marginRate).toBe(-0.25);
  });
  it("공급가 0 이면 마진율 0 (0 나누기 방지)", () => {
    expect(calcFromSupplyPrice(100, 0, true).marginRate).toBe(0);
  });
});

// ─── 입력 검증 ────────────────────────────────────────────────────────────
describe("parseQuickEstimateBody / quickSupplyPrice", () => {
  it("공급가 = round(평당가 × 평수) — 평수는 견적 상세와 같은 소수 2자리", () => {
    expect(sqmToPyeong(99.17)).toBe(30);
    expect(quickSupplyPrice(99.17, 300_000)).toBe(9_000_000); // 30평 × 30만 (29.9988평 문제 없음)
    expect(quickSupplyPrice(100, 350_000)).toBe(Math.round(350_000 * 30.25));
  });

  it("올바른 값 (숫자 문자열도 허용)", () => {
    expect(parseQuickEstimateBody({ constructionType: "roof", areaM2: 100, pyeongPrice: 350_000 }))
      .toEqual({ constructionType: "roof", areaM2: 100, pyeongPrice: 350_000 });
    expect(parseQuickEstimateBody({ constructionType: "steelWaterproof", areaM2: "82.5", pyeongPrice: "180000" }))
      .toEqual({ constructionType: "steelWaterproof", areaM2: 82.5, pyeongPrice: 180_000 });
  });

  it.each([
    [null, "요청 형식이 올바르지 않습니다"],
    [{ areaM2: 100, pyeongPrice: 1 }, "공사 유형을 선택해 주세요"],
    [{ constructionType: "deck", areaM2: 100, pyeongPrice: 1 }, "공사 유형 값이 올바르지 않습니다"],
    [{ constructionType: "roof", pyeongPrice: 1 }, "시공면적을 입력해 주세요"],
    [{ constructionType: "roof", areaM2: "abc", pyeongPrice: 1 }, "시공면적 값이 올바르지 않습니다"],
    [{ constructionType: "roof", areaM2: 0, pyeongPrice: 1 }, "시공면적은 0.1㎡ 이상이어야 합니다"],
    [{ constructionType: "roof", areaM2: 100_001, pyeongPrice: 1 }, "시공면적은 100,000㎡ 이하여야 합니다"],
    [{ constructionType: "roof", areaM2: 100 }, "평당가를 입력해 주세요"],
    [{ constructionType: "roof", areaM2: 100, pyeongPrice: 1.5 }, "평당가는 원 단위 숫자로 입력해 주세요"],
    [{ constructionType: "roof", areaM2: 100, pyeongPrice: 0 }, "평당가는 1원 이상이어야 합니다"],
    [{ constructionType: "roof", areaM2: 100, pyeongPrice: 10_000_001 }, "평당가는 10,000,000원 이하여야 합니다"],
    [{ constructionType: "roof", areaM2: 0.1, pyeongPrice: 10 }, "평당가 × 평수가 0원입니다 — 면적이나 평당가를 확인해 주세요"],
    [{ constructionType: "roof", areaM2: 100_000, pyeongPrice: 10_000_000 }, "견적 금액이 너무 큽니다 — 면적이나 평당가를 확인해 주세요"],
  ])("%j → %s", (body, message) => {
    expect(() => parseQuickEstimateBody(body)).toThrow(InputError);
    expect(() => parseQuickEstimateBody(body)).toThrow(message);
  });

  it("미리보기 = 기본 payload 로 서버와 같은 계산", () => {
    const pv = previewQuickEstimate(settings, "roof", 100, 350_000)!;
    if (!pv.ok) throw new Error(pv.error);
    const { lineItemDrafts } = computeEstimate(settings, quickEstimateInput(settings, "roof", 100));
    const totalCost = lineItemDrafts.reduce((s, l) => s + l.total, 0);
    expect(pv.totalCost).toBe(totalCost);
    expect(pv.lineCount).toBe(lineItemDrafts.length);
    expect(pv.pricing).toEqual(calcFromSupplyPrice(totalCost, quickSupplyPrice(100, 350_000), true));
    expect(previewQuickEstimate(settings, "roof", 100, null)).toMatchObject({ ok: true, pricing: null });
    expect(previewQuickEstimate(settings, "roof", 0, 350_000)).toBeNull(); // 면적 입력 전
    expect(previewQuickEstimate(settings, "roof", 0.05, 350_000)).toEqual({
      ok: false, error: "시공면적은 0.1㎡ 이상이어야 합니다", suggestFullForm: false,
    });
  });
});

// ─── 면적 상한 (작업 일수 자동값 365일) ── 리뷰 2026-10-01 ─────────────────
describe("번개 견적 면적 상한 — 작업 일수 자동값이 365일을 넘으면 화면에 있는 칸 기준으로 안내", () => {
  it("상한 = min(100,000㎡, 365 × 작업일수 기준)", () => {
    expect(quickMaxAreaM2(settings)).toBe(32_850); // 공장값 90㎡/일
    expect(quickMaxAreaM2(custom)).toBe(14_600); // 40㎡/일
    expect(quickMaxAreaM2({ workDaysAreaDivisor: 300 })).toBe(100_000);
  });

  it.each(TYPES.flatMap((t) => [[t, settings], [t, custom]] as const))(
    "%s — 상한 면적은 만들 수 있고, 넘으면 QuickNeedsFullFormError (작업 일수 문구 아님)",
    (t, s) => {
      const max = quickMaxAreaM2(s);
      expect(quickEstimateInput(s, t, max).workDays).toBe(365);
      const over = () => quickEstimateInput(s, t, max + 0.1);
      expect(over).toThrow(QuickNeedsFullFormError);
      expect(over).toThrow(`번개 견적은 시공면적 ${max.toLocaleString("ko-KR")}㎡까지 만들 수 있습니다`);
      expect(over).not.toThrow(/작업 일수은/);
      // 미리보기도 같은 문구 + 일반 견적 안내, 제출 전 막힘
      expect(previewQuickEstimate(s, t, max + 0.1, 100_000)).toMatchObject({ ok: false, suggestFullForm: true });
    },
  );

  it("공장값 33,000㎡·100,000㎡ (리뷰 재현값) — 미리보기가 사라지지 않고 이유를 보여 준다", () => {
    for (const area of [33_000, 100_000]) {
      const pv = previewQuickEstimate(settings, "roof", area, 300_000);
      expect(pv).toMatchObject({ ok: false, suggestFullForm: true });
      expect(pv && !pv.ok && pv.error).toContain("32,850㎡");
    }
  });

  it("설정 기본값이 견적 검증 범위 밖이면 출처를 밝힌다 (예: 기본 작업 인원 150명)", () => {
    const odd = { ...settings, defaultWorkerCount: 150 } as PricingSettings;
    const run = () => quickEstimateInput(odd, "roof", 100);
    expect(run).toThrow(QuickNeedsFullFormError);
    expect(run).toThrow("설정 기본값으로는 만들 수 없습니다 (작업 인원은(는) 100 이하여야 합니다)");
  });
});

// ─── 저장 범위 (32비트 정수 금액 컬럼) ── 리뷰 2026-10-01 ─────────────────
describe("assertMoneyFitsDb — 금액이 컬럼 범위를 넘으면 500 대신 400", () => {
  const ok = { totalCost: 1, marginAmount: 0, supplyPrice: 1, vat: 0, finalPrice: 1 };
  it("경계값", () => {
    expect(() => assertMoneyFitsDb([{ unitPrice: DB_INT_MAX, total: DB_INT_MAX }], { ...ok, marginAmount: DB_INT_MIN })).not.toThrow();
    expect(() => assertMoneyFitsDb([{ unitPrice: 1, total: DB_INT_MAX + 1 }], ok)).toThrow(MONEY_TOO_LARGE_MESSAGE);
    expect(() => assertMoneyFitsDb([{ unitPrice: DB_INT_MAX + 1, total: 1 }], ok)).toThrow(InputError);
    expect(() => assertMoneyFitsDb([], { ...ok, totalCost: DB_INT_MAX + 1 })).toThrow(InputError);
    expect(() => assertMoneyFitsDb([], { ...ok, marginAmount: DB_INT_MIN - 1 })).toThrow(InputError);
    expect(() => assertMoneyFitsDb([], { ...ok, finalPrice: Number.NaN })).toThrow(InputError);
  });

  it("작업일수 기준 300 + 100,000㎡ (리뷰 재현값) — 미리보기도 같은 문구로 막힘", () => {
    const wide = { ...settings, workDaysAreaDivisor: 300 } as PricingSettings;
    expect(() => parseQuickEstimateBody({ constructionType: "roof", areaM2: 100_000, pyeongPrice: 1_000 })).not.toThrow();
    const { lineItemDrafts } = computeEstimate(wide, quickEstimateInput(wide, "roof", 100_000));
    expect(lineItemDrafts.reduce((s, l) => s + l.total, 0)).toBeGreaterThan(DB_INT_MAX); // 원가가 넘는 경우
    expect(previewQuickEstimate(wide, "roof", 100_000, 1_000)).toEqual({ ok: false, error: MONEY_TOO_LARGE_MESSAGE, suggestFullForm: false });
    expect(previewQuickEstimate(wide, "roof", 100_000, null)).toMatchObject({ ok: false, error: MONEY_TOO_LARGE_MESSAGE });
  });
});

// ─── 오류 토스트 문구 ── 리뷰 2026-10-01 ───────────────────────────────────
describe("quickErrorMessage — 영문 'Unauthorized' / 'Not found' 를 보이지 않는다", () => {
  it.each([
    [401, "Unauthorized", QUICK_SESSION_EXPIRED],
    [404, "Not found", QUICK_SITE_NOT_FOUND],
    [400, "평당가를 입력해 주세요", "평당가를 입력해 주세요"],
    [500, undefined, "번개 견적을 만들지 못했습니다"],
    [502, "  ", "번개 견적을 만들지 못했습니다"],
  ])("%i %j → %s", (status, serverError, expected) => {
    expect(quickErrorMessage(status, serverError)).toBe(expected);
  });
});

// ─── 라우트 (DB·인증 가짜) ────────────────────────────────────────────────
const prismaMock = {
  site: { findFirst: vi.fn() },
  estimate: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const auth = vi.hoisted(() => ({ settings: null as unknown }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => USER),
  requireUserAndSettings: vi.fn(async () => ({ user: USER, settings: auth.settings })),
}));
vi.mock("@/lib/sent-pdf", () => ({ removeForEstimates: vi.fn(async () => {}) }));

const ctx = { params: Promise.resolve({ id: SITE_ID }) };
const kstYear = new Date(Date.now() + 9 * 3600_000).getUTCFullYear();

function postJson(url: string, body: unknown) {
  return new Request(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.settings = settings;
  prismaMock.site.findFirst.mockResolvedValue(site);
  prismaMock.estimate.findMany.mockResolvedValue([{ estimateNumber: `${kstYear}-004` }]);
  prismaMock.estimate.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: EST_ID, ...data }));
});

describe("POST /api/sites/[id]/estimates/quick", () => {
  const url = `http://localhost/api/sites/${SITE_ID}/estimates/quick`;

  it.each(TYPES)("%s — 기본 payload 라인 + 공급가 = 평당가 × 평수, 마진 역산 (amount)", async (t) => {
    const { POST } = await import("../../app/api/sites/[id]/estimates/quick/route");
    const res = await POST(postJson(url, { constructionType: t, areaM2: 99.17, pyeongPrice: 300_000 }), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: EST_ID, siteId: SITE_ID });

    expect(prismaMock.site.findFirst.mock.calls[0][0].where).toEqual({ id: SITE_ID, userId: USER.id });
    const data = prismaMock.estimate.create.mock.calls[0][0].data;
    const { lineItemDrafts } = computeEstimate(settings, parseEstimateBody(defaultEstimatePayload(settings, t, 99.17)));
    const totalCost = lineItemDrafts.reduce((s, l) => s + l.total, 0);
    expect(data.lineItems.create).toEqual(lineItemDrafts);
    expect(data).toMatchObject({
      siteId: SITE_ID, constructionType: t, areaM2: 99.17,
      totalCost, supplyPrice: 9_000_000, marginAmount: 9_000_000 - totalCost,
      marginRate: (9_000_000 - totalCost) / 9_000_000, marginMode: "amount",
      vat: 900_000, finalPrice: 9_900_000, vatIncluded: true,
      estimateNumber: `${kstYear}-005`,
      customerNameSnapshot: "김고객", companyNameSnapshot: "테스트지붕",
      paymentTerms: "계약금 10% / 잔금 90%", validityDays: 30,
    });
  });

  it("설정이 부가세 별도면 최종가 = 공급가", async () => {
    auth.settings = custom;
    const { POST } = await import("../../app/api/sites/[id]/estimates/quick/route");
    const res = await POST(postJson(url, { constructionType: "roof", areaM2: 99.17, pyeongPrice: 300_000 }), ctx);
    expect(res.status).toBe(201);
    expect(prismaMock.estimate.create.mock.calls[0][0].data).toMatchObject({
      vatIncluded: false, supplyPrice: 9_000_000, finalPrice: 9_000_000, substructureType: "steel", workerCount: 5,
    });
  });

  it("남의 현장은 404 — 만들지 않음", async () => {
    prismaMock.site.findFirst.mockResolvedValue(null);
    const { POST } = await import("../../app/api/sites/[id]/estimates/quick/route");
    const res = await POST(postJson(url, { constructionType: "roof", areaM2: 100, pyeongPrice: 1 }), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe(QUICK_SITE_NOT_FOUND); // 한국어 (구 "Not found")
    expect(prismaMock.estimate.create).not.toHaveBeenCalled();
  });

  it("면적이 커서 작업 일수 자동값이 365일을 넘으면 400 — 번개 견적 화면 기준 문구", async () => {
    const { POST } = await import("../../app/api/sites/[id]/estimates/quick/route");
    const res = await POST(postJson(url, { constructionType: "steelWaterproof", areaM2: 33_000, pyeongPrice: 100_000 }), ctx);
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toContain("번개 견적은 시공면적 32,850㎡까지");
    expect(error).not.toContain("작업 일수은");
    expect(prismaMock.estimate.create).not.toHaveBeenCalled();
  });

  it("원가가 금액 컬럼(32비트)을 넘으면 500 대신 400 — 번호 조회·저장 전에", async () => {
    auth.settings = { ...settings, workDaysAreaDivisor: 300 };
    const { POST } = await import("../../app/api/sites/[id]/estimates/quick/route");
    const res = await POST(postJson(url, { constructionType: "roof", areaM2: 100_000, pyeongPrice: 1_000 }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(MONEY_TOO_LARGE_MESSAGE);
    expect(prismaMock.estimate.findMany).not.toHaveBeenCalled();
    expect(prismaMock.estimate.create).not.toHaveBeenCalled();
  });

  it("회사명 미입력·잘못된 본문은 400 (한국어) — 만들지 않음", async () => {
    const { POST } = await import("../../app/api/sites/[id]/estimates/quick/route");
    auth.settings = { ...settings, companyName: "회사명을 설정에서 입력하세요" };
    let res = await POST(postJson(url, { constructionType: "roof", areaM2: 100, pyeongPrice: 1 }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("설정에서 회사명을 먼저 입력해 주세요");

    auth.settings = settings;
    res = await POST(postJson(url, { constructionType: "roof", areaM2: 100 }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("평당가를 입력해 주세요");

    res = await POST(postJson(url, "{not json"), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("요청 형식이 올바르지 않습니다");
    expect(prismaMock.estimate.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/sites/[id]/estimates — 공용 생성 경로로 옮긴 뒤에도 그대로", () => {
  it("마진율(설정 기본) 기준 percent 모드, 번호·스냅샷·라인", async () => {
    const { POST } = await import("../../app/api/sites/[id]/estimates/route");
    const body = defaultEstimatePayload(settings, "roof", 100);
    const res = await POST(postJson(`http://localhost/api/sites/${SITE_ID}/estimates`, body), ctx);
    expect(res.status).toBe(201);
    const data = prismaMock.estimate.create.mock.calls[0][0].data;
    const { lineItemDrafts } = computeEstimate(settings, parseEstimateBody(body));
    expect(data.lineItems.create).toEqual(lineItemDrafts);
    expect(data).toMatchObject({
      siteId: SITE_ID, marginMode: "percent", marginRate: 0.3, vatIncluded: true,
      ...calcTotals(lineItemDrafts, 0.3, true),
      estimateNumber: `${kstYear}-005`, siteAddressSnapshot: "서울 강남구",
    });
    expect((await res.json()).id).toBe(EST_ID);
  });

  it("금액이 컬럼 범위를 넘으면 500 대신 400 (예: 기타 비용 30억)", async () => {
    const { POST } = await import("../../app/api/sites/[id]/estimates/route");
    const body = { ...defaultEstimatePayload(settings, "roof", 100), extraCosts: [{ name: "특수 장비", amount: 3_000_000_000 }] };
    const res = await POST(postJson(`http://localhost/api/sites/${SITE_ID}/estimates`, body), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(MONEY_TOO_LARGE_MESSAGE);
    expect(prismaMock.estimate.create).not.toHaveBeenCalled();
  });

  it("회사명 미입력이면 본문보다 먼저 400", async () => {
    auth.settings = { ...settings, companyName: "  " };
    const { POST } = await import("../../app/api/sites/[id]/estimates/route");
    const res = await POST(postJson(`http://localhost/api/sites/${SITE_ID}/estimates`, "{bad"), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("설정에서 회사명을 먼저 입력해 주세요");
  });
});

describe("PATCH /api/estimates/[eid] { supplyPrice } — calcFromSupplyPrice 사용", () => {
  it("서버 원가 기준 역산, amount 모드, VAT 설정 유지", async () => {
    prismaMock.estimate.findFirst.mockResolvedValue({
      id: EST_ID, totalCost: 7_000_000, vatIncluded: false, lineItems: [], site,
    });
    prismaMock.estimate.update.mockResolvedValue({ id: EST_ID });
    const { PATCH } = await import("../../app/api/estimates/[eid]/route");
    const req = new Request(`http://localhost/api/estimates/${EST_ID}`, { method: "PATCH", body: JSON.stringify({ supplyPrice: 9_000_000 }) });
    const res = await PATCH(req, { params: Promise.resolve({ eid: EST_ID }) });
    expect(res.status).toBe(200);
    const { data } = prismaMock.estimate.update.mock.calls[0][0];
    expect(data).toEqual({
      marginAmount: 2_000_000, marginRate: 2_000_000 / 9_000_000, supplyPrice: 9_000_000,
      vat: 900_000, finalPrice: 9_000_000, marginMode: "amount", updatedAt: expect.any(Date),
    });
  });
});

describe("PATCH /api/estimates/[eid] { action: 'replace' } — 생성과 같은 저장 범위 확인", () => {
  it("금액이 컬럼 범위를 넘으면 400, 라인을 지우지 않음", async () => {
    prismaMock.estimate.findFirst.mockResolvedValue({
      id: EST_ID, totalCost: 7_000_000, vatIncluded: true, lineItems: [], site,
      paymentTerms: "계약금 10% / 잔금 90%", validityDays: 30,
    });
    const { PATCH } = await import("../../app/api/estimates/[eid]/route");
    const body = {
      action: "replace", ...defaultEstimatePayload(settings, "roof", 100),
      extraCosts: [{ name: "특수 장비", amount: 3_000_000_000 }],
    };
    const req = new Request(`http://localhost/api/estimates/${EST_ID}`, { method: "PATCH", body: JSON.stringify(body) });
    const res = await PATCH(req, { params: Promise.resolve({ eid: EST_ID }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(MONEY_TOO_LARGE_MESSAGE);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
