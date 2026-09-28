import { describe, expect, it } from "vitest";
import type { PricingSettings } from "@prisma/client";
import { extractPresetSnapshot, applyPresetSnapshot, PRESET_EXCLUDE } from "../presets";
import { FACTORY_DEFAULTS } from "../defaults";

const settings = {
  id: "s1", userId: "u1",
  companyName: "포스코지붕", companyPhone: "010", companyAddress: "서울",
  businessRegistrationNumber: "347", sealImageUrl: "http://x", bankAccount: "신한",
  noticeText: "안내", estimateNumberStart: 100, baselineData: { a: 1 },
  activePresetId: "p1",
  materialPriceZinc250PerM: 8100, defaultMarginRate: 0.33,
  substructureWoodPricePerPiece: 3333, insuranceRateOfLabor: 0.05,
  materialWidths: { zinc250: 700 }, catalogDefaults: { accessory: {} },
  updatedAt: new Date(),
} as unknown as PricingSettings;

describe("preset snapshot scope", () => {
  it("회사 정체성·채번·이력·메타는 스냅샷에서 제외", () => {
    const snap = extractPresetSnapshot(settings);
    for (const k of ["companyName", "companyPhone", "companyAddress", "businessRegistrationNumber",
      "sealImageUrl", "bankAccount", "noticeText", "estimateNumberStart", "baselineData",
      "activePresetId", "id", "userId", "updatedAt"]) {
      expect(snap).not.toHaveProperty(k);
    }
  });

  it("단가·계수 필드는 포함", () => {
    const snap = extractPresetSnapshot(settings);
    expect(snap.materialPriceZinc250PerM).toBe(8100);
    expect(snap.defaultMarginRate).toBe(0.33);
    expect(snap.substructureWoodPricePerPiece).toBe(3333);
    expect(snap.insuranceRateOfLabor).toBe(0.05);
    expect(snap.materialWidths).toEqual({ zinc250: 700 });
    expect(snap.catalogDefaults).toEqual({ accessory: {} });
  });

  it("applyPresetSnapshot 도 제외 필드를 한 번 더 거름 (구버전 스냅샷 안전망)", () => {
    // 구버전 스냅샷이 실수로 회사정보를 품고 있어도 활성 전환이 덮어쓰지 않게.
    const dirty = { companyName: "해커", defaultMarginRate: 0.4, estimateNumberStart: 999 };
    const applied = applyPresetSnapshot(dirty);
    expect(applied).not.toHaveProperty("companyName");
    expect(applied).not.toHaveProperty("estimateNumberStart");
    expect(applied.defaultMarginRate).toBe(0.4);
  });

  it("null/비객체 입력은 공장 기본값", () => {
    expect(applyPresetSnapshot(null)).toEqual(FACTORY_DEFAULTS);
    expect(applyPresetSnapshot("x")).toEqual(FACTORY_DEFAULTS);
  });

  it("옛 프리셋에 없는 필드는 공장 기본값으로 채운다 (부분 복원 회귀)", () => {
    const out = applyPresetSnapshot({ dailyWage: 350000 });
    expect(out.dailyWage).toBe(350000);
    expect(out.workDaysAreaDivisor).toBe(FACTORY_DEFAULTS.workDaysAreaDivisor);
    expect(out.catalogPrices).toEqual({});
  });

  it("PRESET_EXCLUDE 에 회사 정체성 핵심 키가 있다 (회귀 방지)", () => {
    expect(PRESET_EXCLUDE.has("companyName")).toBe(true);
    expect(PRESET_EXCLUDE.has("estimateNumberStart")).toBe(true);
    expect(PRESET_EXCLUDE.has("baselineData")).toBe(true);
  });
});
