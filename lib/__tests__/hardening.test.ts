/**
 * 2026-09-28 보안·신뢰 수정의 회귀 테스트 — 9/27 전수 점검에서 나온 결함들이 다시 생기지 않게.
 */
import { describe, expect, it } from "vitest";
import { Prisma, type PricingSettings } from "@prisma/client";
import { InputError, effectiveLossRateFor, parseEstimateBody, parseMarginRate, snapshotColumns } from "../estimate-input";
import { safeNextPath } from "../safe-redirect";
import { buildLineItems, distributeMarginForDisplay, type BuildLineItemsInput } from "../calculations";
import { mergeGroupModes, resolveGroupDefaults } from "../catalog";
import { FACTORY_DEFAULTS } from "../defaults";
import { SettingsInputError, sanitizeSettingsData } from "../settings-input";

const settings = {
  ...FACTORY_DEFAULTS,
  id: "s1", userId: "u1", companyName: "테스트지붕",
  companyPhone: null, companyAddress: null, businessRegistrationNumber: null,
  sealImageUrl: null, bankAccount: null, noticeText: null,
  estimateNumberStart: 1, baselineData: null, activePresetId: null,
  updatedAt: new Date(0),
} as unknown as PricingSettings;

const minimalBody = { constructionType: "roof", areaM2: 100, workerCount: 3, workDays: 2 };

describe("parseEstimateBody — 서버 입력 검증", () => {
  it("정상 입력은 기본값을 채워 통과", () => {
    const i = parseEstimateBody(minimalBody);
    expect(i.areaM2).toBe(100);
    expect(i.wasteTruckCount).toBe(1);
    expect(i.includeInsurance).toBe(true);
    expect(i.extraCosts).toEqual([]);
  });

  it("음수·NaN·범위 밖 값은 거부", () => {
    expect(() => parseEstimateBody({ ...minimalBody, areaM2: -5 })).toThrow(InputError);
    expect(() => parseEstimateBody({ ...minimalBody, areaM2: "abc" })).toThrow(InputError);
    expect(() => parseEstimateBody({ ...minimalBody, workerCount: 0 })).toThrow(InputError);
    expect(() => parseEstimateBody({ ...minimalBody, gutterLengthM: -1 })).toThrow(InputError);
    expect(() => parseEstimateBody({ ...minimalBody, constructionType: "hack" })).toThrow(InputError);
    expect(() => parseEstimateBody({ ...minimalBody, constructionMonth: "2026/13" })).toThrow(InputError);
  });

  it("마진율 99% 초과·100% 이상 거부 (저장값과 실제 적용값이 달라지던 문제)", () => {
    expect(() => parseMarginRate(3)).toThrow(InputError);
    expect(() => parseMarginRate(1)).toThrow(InputError);
    expect(parseMarginRate(0.3)).toBe(0.3);
    expect(parseMarginRate(-0.1)).toBe(-0.1); // 손해 견적은 허용
  });

  it("기타 비용: 이름 없거나 0원인 항목은 버리고 원본을 보존", () => {
    const i = parseEstimateBody({ ...minimalBody, extraCosts: [{ name: "크레인", amount: 300000 }, { name: "", amount: 5 }, { name: "x", amount: 0 }] });
    expect(i.extraCosts).toEqual([{ name: "크레인", amount: 300000 }]);
  });

  it("절곡 상세 넓이(detailWidthMm)는 simpleQty 와 별도로 보존", () => {
    const i = parseEstimateBody({ ...minimalBody, catalogModes: { bending: { mode: "detailed", detailWidthMm: 700, simpleQty: 12 } } });
    expect(i.catalogModes.bending?.detailWidthMm).toBe(700);
    expect(i.catalogModes.bending?.simpleQty).toBe(12);
  });
});

describe("로스율 결정 — 사용자가 고친 값이 자동 모드를 이긴다", () => {
  const input = (over: Record<string, unknown>) => parseEstimateBody({ ...minimalBody, roofShape: "hip", applyLossRate: true, ...over });
  it("직접 고친 값(lossRateManual) 우선", () => {
    expect(effectiveLossRateFor(settings, input({ lossRate: 0.2, lossRateManual: true }))).toBe(0.2);
  });
  it("안 고쳤으면 자동 모드의 형태별 값 (모임 12%)", () => {
    expect(effectiveLossRateFor(settings, input({ lossRate: 0.2, lossRateManual: false }))).toBe(0.12);
  });
});

describe("snapshotColumns — 발송본 고정", () => {
  it("고객명·주소·마진 분배 비율·발행일을 견적에 박제", () => {
    const now = new Date("2026-09-28T01:00:00Z");
    const snap = snapshotColumns(settings, { customerName: "김고객", siteAddress: "서울" }, now);
    expect(snap.customerNameSnapshot).toBe("김고객");
    expect(snap.siteAddressSnapshot).toBe("서울");
    expect(snap.marginMaterialRatioSnapshot).toBe(0.5);
    expect(snap.issuedAt).toBe(now);
  });
});

describe("safeNextPath — 오픈 리다이렉트 차단", () => {
  it.each([
    ["//evil.com", "/"],
    ["/.//evil.com", "/"],
    ["/a/..//evil.com", "/"],
    ["/%2e//evil.com", "/"],
    ["/%2e%2e//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["https://evil.com", "/"],
    ["javascript:alert(1)", "/"],
    ["", "/"],
    [null, "/"],
    ["/sites/abc?detail=simple", "/sites/abc?detail=simple"],
    ["/settings#x", "/settings#x"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input as string | null)).toBe(expected);
  });
});

describe("distributeMarginForDisplay — 손해 견적", () => {
  const items = [
    { category: "material", name: "강판", quantity: 100, unit: "㎡", unitPrice: 10000, total: 1_000_000 },
    { category: "labor", name: "인건비", quantity: 6, unit: "명·일", unitPrice: 300000, total: 1_800_000 },
    { category: "other", name: "운송", quantity: 1, unit: "식", unitPrice: 5_000, total: 5_000 },
  ];
  it("음수 라인 없이 전체를 같은 비율로 줄이고 합계 = 원가 + 마진", () => {
    const out = distributeMarginForDisplay(items, -300_000, { material: 0.5, labor: 0.25, profit: 0.25 });
    expect(out.every((l) => l.total >= 0)).toBe(true);
    expect(out.find((l) => l.synthetic)).toBeUndefined();
    expect(out.reduce((s, l) => s + l.total, 0)).toBe(2_805_000 - 300_000);
  });
  it("반올림 오차는 가장 큰 라인이 흡수 (작은 마지막 라인이 음수가 되지 않게)", () => {
    const out = distributeMarginForDisplay(items, 333_333, { material: 0.5, labor: 0.25, profit: 0.25 });
    expect(out.reduce((s, l) => s + l.total, 0)).toBe(2_805_000 + 333_333);
    expect(out.every((l) => l.total >= 0)).toBe(true);
  });
});

describe("카탈로그 그룹 — 모드 병합·절곡 넓이", () => {
  it("견적에 일부 키만 있어도 설정의 그룹 기본값(simpleValue)이 살아 있다", () => {
    const merged = resolveGroupDefaults(mergeGroupModes({ bending: { mode: "simple", simpleValue: 5000 } }, { bending: { mode: "simple", enabled: true } }), "roof");
    expect(merged.bending.simpleValue).toBe(5000);
  });

  it("절곡 상세는 detailWidthMm 로 계산 (구 견적은 simpleQty 폴백)", () => {
    const base: BuildLineItemsInput = {
      settings, constructionType: "roof", materialType: "zinc250", thickness: "0.45",
      areaM2: 100, scope: {}, workerCount: 3, workDays: 2,
      gutterMode: null, gutterLengthM: 0, capLengthM: 0, drainHoleCount: 0, endCapCount: 0,
      skyliftDays: 0, ladderTruckDays: 0, scaffoldDays: 0, wasteTruckCount: 1,
      substructureType: null, extraCosts: [],
    } as BuildLineItemsInput;
    const fresh = buildLineItems({ ...base, catalogModes: { bending: { mode: "detailed", detailWidthMm: 700, simpleQty: 3 } } });
    expect(fresh.find((l) => l.name === "절곡 (전개 넓이 기준)")?.quantity).toBe(700);
    const legacy = buildLineItems({ ...base, catalogModes: { bending: { mode: "detailed", simpleQty: 500 } } });
    expect(legacy.find((l) => l.name === "절곡 (전개 넓이 기준)")?.quantity).toBe(500);
  });
});

describe("공장 기본값 — 한 곳에서만 정의", () => {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "PricingSettings")!;
  const fields = new Map(model.fields.map((f) => [f.name, f]));

  it("FACTORY_DEFAULTS 의 모든 키가 스키마 컬럼이다 (오타·삭제된 컬럼 방지)", () => {
    for (const k of Object.keys(FACTORY_DEFAULTS)) expect(fields.has(k), k).toBe(true);
  });

  it("스키마 @default 가 있는 필드는 공장 기본값과 같다", () => {
    for (const [k, v] of Object.entries(FACTORY_DEFAULTS)) {
      const d = fields.get(k)?.default;
      if (d === undefined || typeof d === "object") continue; // 기본값 없음 / JSON·함수 기본값
      if (typeof d === "number") expect(d, k).toBeCloseTo(v as number, 9); // DMMF 부동소수 표현(1.4000000000000001)
      else if (typeof v === "object") expect(JSON.parse(String(d)), k).toEqual(v); // Json @default("{}")
      else expect(d, k).toBe(v);
    }
  });
});

describe("sanitizeSettingsData — 설정 저장 검증", () => {
  it("모르는 키·쓰기 금지 키는 버리고 숫자 맵은 정리", () => {
    const out = sanitizeSettingsData({
      userId: "other", id: "x", hacker: 1, dailyWage: "310000",
      catalogPrices: { multiRidge: 15000, bad: -1, junk: "abc" },
    });
    expect(out).toEqual({ dailyWage: 310000, catalogPrices: { multiRidge: 15000 } });
  });
  it("음수 단가·100% 이상 마진율 거부", () => {
    expect(() => sanitizeSettingsData({ dailyWage: -1 })).toThrow(SettingsInputError);
    expect(() => sanitizeSettingsData({ defaultMarginRate: 1.2 })).toThrow(SettingsInputError);
  });
  it("activePresetId 는 명시 허용 없이는 받지 않는다", () => {
    expect(sanitizeSettingsData({ activePresetId: "p1" })).toEqual({});
  });
  it("lenient 모드(프리셋 적용)는 잘못된 값을 조용히 버린다", () => {
    expect(sanitizeSettingsData({ dailyWage: -1, removedColumn: 3, siliconePrice: 4000 }, { lenient: true })).toEqual({ siliconePrice: 4000 });
  });
});
