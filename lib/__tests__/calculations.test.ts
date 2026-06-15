/**
 * 돈 계산 엔진 핵심 테스트 — 2026-06-12 외부 감사 백로그 2번.
 * 절곡 OPEN DECISION 확정(절곡 단가 = 자재+가공 포함, finishingMethods 부재별)
 * 기준의 수식을 고정한다. 이 테스트가 깨지면 과거 견적과 다른 숫자가 나온다는 뜻.
 */
import { describe, expect, it } from "vitest";
import type { PricingSettings } from "@prisma/client";
import {
  buildLineItems,
  calcBendingCost,
  calcFromFinalPrice,
  calcTotals,
  distributeMarginForDisplay,
  resolveEffectiveLossRate,
  type BuildLineItemsInput,
} from "../calculations";

// ─── 픽스처 ──────────────────────────────────────────────────────────

const baseSettings = {
  id: "s1",
  userId: "u1",
  companyName: "테스트지붕",
  companyPhone: null,
  companyAddress: null,
  businessRegistrationNumber: null,
  sealImageUrl: null,
  bankAccount: null,
  noticeText: null,
  materialPricePerSqm: 30000,
  accessoryRate: 0.15,
  materialPriceSlatePerM: 8100,
  materialPriceV250PerM: 8100,
  materialPriceZinc250PerM: 8100,
  materialPriceGeneralTilePerM: 8600,
  materialPriceTraditionalTilePerM: 8600,
  materialPriceRealZincPerM: 12000,
  materialPriceParapetPerM: 12200,
  materialPriceOverlayPanelPerM: 13300,
  materialPriceTambourPerM: 0,
  materialWidths: {},
  accessoryLengths: {},
  ridgePricePerM: 25000,
  eavePricePerM: 20000,
  gutterPricePerM: 5000,
  removalPricePerSqm: 8000,
  wasteDisposalCost: 1000000,
  dailyWage: 300000,
  defaultWorkerCount: 3,
  skyliftDailyCost: 500000,
  ladderTruckDailyCost: 300000,
  scaffoldDailyCost: 150000,
  scaffoldPricePerSqmDay: 3000,
  baseTransportCost: 100000,
  parapetMultiplier: 1.4,
  defaultLossRate: 0.15,
  useLossRateByDefault: false,
  lossRateMode: "auto",
  substructureMode: "wood",
  substructureWoodPricePerSqm: 30000,
  substructureSteelPricePerSqm: 40000,
  substructureWoodPricePerPiece: 3333,
  substructureWoodPiecesPerSqm: 1.4,
  substructureSteelPricePerPiece: 18000,
  substructureSteelPiecesPerSqm: 0.76,
  drainHolePrice: 200000,
  stainlessDrainPricePerM: 50000,
  capBendingPricePerM: 5000,
  denjoPricePerUnit: 700000,
  endCapPrice: 3500,
  peFoamPricePerSqm: 1000,
  downspoutUnitPrice: 50000,
  bendingPricePerMmPer3m: 36,
  bendingWidthRidge: 350,
  bendingWidthEave: 250,
  bendingWidthCap: 200,
  bendingWidthMishi: 150,
  bendingWidthFlashing: 200,
  bendingWidthValley: 300,
  bendingWidthSnowGuard: 180,
  bendingWidthFascia: 200,
  screwLargePrice: 300,
  screwSmallPrice: 100,
  screwLargePerBag: 100,
  screwSmallPerBag: 100,
  siliconePrice: 5000,
  screwLargePerSqm: 2,
  screwSmallPerBendM: 3.3,
  siliconeCoverageM: 6,
  insulationPricePerSqm: 15000,
  insulationPriceEps: 4000,
  insulationPriceXps: 11000,
  insulationPricePir: 16000,
  insulationPriceThermalReflect: 6000,
  insulationUnitAreas: {},
  baselineData: null,
  catalogDefaults: {},
  mealCostPerPersonMeal: 10000,
  lodgingCostPerPersonNight: 50000,
  defaultMarginRate: 0.25,
  vatIncludedByDefault: false,
  marginMaterialRatio: 0.5,
  marginLaborRatio: 0.25,
  marginProfitRatio: 0.25,
  estimateNumberStart: 1,
  updatedAt: new Date(),
} as unknown as PricingSettings;

function baseInput(over: Partial<BuildLineItemsInput> = {}): BuildLineItemsInput {
  return {
    settings: baseSettings,
    constructionType: "roof",
    materialType: "zinc250",
    thickness: "0.45",
    areaM2: 100,
    scope: {},
    workerCount: 3,
    workDays: 2,
    gutterLengthM: 0,
    skyliftDays: 0,
    ladderTruckDays: 0,
    scaffoldDays: 0,
    ...over,
  };
}

// ─── calcTotals — 매출 대비 마진 ─────────────────────────────────────

describe("calcTotals (매출 대비 마진)", () => {
  it("원가 800만 + 마진율 20% → 공급가 1,000만 / 마진 200만", () => {
    const t = calcTotals([{ total: 8_000_000 }], 0.2, false);
    expect(t.totalCost).toBe(8_000_000);
    expect(t.supplyPrice).toBe(10_000_000);
    expect(t.marginAmount).toBe(2_000_000);
    expect(t.vat).toBe(1_000_000);
    expect(t.finalPrice).toBe(10_000_000); // VAT 별도
  });

  it("VAT 포함이면 finalPrice = 공급가 + VAT", () => {
    const t = calcTotals([{ total: 8_000_000 }], 0.2, true);
    expect(t.finalPrice).toBe(11_000_000);
  });

  it("마진율 99% 클램프 — 공급가 폭발 방지", () => {
    const t = calcTotals([{ total: 1_000_000 }], 1.5, false);
    expect(t.supplyPrice).toBe(Math.round(1_000_000 / 0.01));
  });

  it("라인 없으면 전부 0", () => {
    const t = calcTotals([], 0.25, false);
    expect(t.totalCost).toBe(0);
    expect(t.supplyPrice).toBe(0);
  });
});

// ─── calcFromFinalPrice — 최종가 역산 ────────────────────────────────

describe("calcFromFinalPrice (최종가 역산)", () => {
  it("VAT 별도: 원가 800만 / 최종가 1,000만 → 마진율 20%", () => {
    const r = calcFromFinalPrice(8_000_000, 10_000_000, false);
    expect(r.supplyPrice).toBe(10_000_000);
    expect(r.marginAmount).toBe(2_000_000);
    expect(r.marginRate).toBeCloseTo(0.2, 10);
  });

  it("VAT 포함: 최종가 1,100만 → 공급가 1,000만 + VAT 100만", () => {
    const r = calcFromFinalPrice(8_000_000, 11_000_000, true);
    expect(r.supplyPrice).toBe(10_000_000);
    expect(r.vat).toBe(1_000_000);
    expect(r.marginRate).toBeCloseTo(0.2, 10);
  });

  it("손해 견적 (최종가 < 원가) — 음수 마진율 허용", () => {
    const r = calcFromFinalPrice(10_000_000, 9_000_000, false);
    expect(r.marginAmount).toBe(-1_000_000);
    expect(r.marginRate).toBeLessThan(0);
  });

  it("calcTotals 와 왕복 일관성: rate → final → rate", () => {
    const t = calcTotals([{ total: 7_777_777 }], 0.23, true);
    const back = calcFromFinalPrice(t.totalCost, t.finalPrice, true);
    expect(back.marginRate).toBeCloseTo(0.23, 2);
  });
});

// ─── calcBendingCost — 절곡 공식 (자재비+가공비 포함 단가) ───────────

describe("calcBendingCost", () => {
  it("350mm 용마루 10m × 36원 = 42,000원", () => {
    expect(calcBendingCost(350, 10, 36)).toBe(42_000);
  });

  it("0 입력 가드", () => {
    expect(calcBendingCost(0, 10, 36)).toBe(0);
    expect(calcBendingCost(350, 0, 36)).toBe(0);
    expect(calcBendingCost(350, 10, 0)).toBe(0);
  });
});

// ─── resolveEffectiveLossRate ────────────────────────────────────────

describe("resolveEffectiveLossRate", () => {
  it("auto + 박공 → 형태별 7%", () => {
    expect(resolveEffectiveLossRate("auto", "gable", 0.15)).toBe(0.07);
  });

  it("auto + 지붕형태 없음 → manual 폴백", () => {
    expect(resolveEffectiveLossRate("auto", null, 0.15)).toBe(0.15);
  });

  it("manual 모드는 형태 무시", () => {
    expect(resolveEffectiveLossRate("manual", "gable", 0.2)).toBe(0.2);
  });
});

// ─── distributeMarginForDisplay — 고객 PDF 마진 분배 ─────────────────

const ratios = { material: 0.5, labor: 0.25, profit: 0.25 };

function li(category: string, total: number, name = category) {
  return { category, name, quantity: 1, unit: "식", unitPrice: total, total };
}

describe("distributeMarginForDisplay", () => {
  it("합계 불변식: 분배 후 합 === 원가 + 마진 (라운딩 스윕 ±1원 보정)", () => {
    const items = [li("material", 3_333_333), li("labor", 1_111_111), li("equipment", 777_777)];
    const margin = 1_234_567; // 일부러 안 나눠떨어지는 값
    const out = distributeMarginForDisplay(items, margin, ratios);
    const target = 3_333_333 + 1_111_111 + 777_777 + margin;
    expect(out.reduce((s, i) => s + i.total, 0)).toBe(target);
    expect(out.find((i) => i.synthetic)?.name).toBe("이윤");
  });

  it("자재 라인 없으면 자재 몫이 인건비로 spill — 합계 불변", () => {
    const items = [li("labor", 2_000_000), li("equipment", 500_000)];
    const margin = 900_000;
    const out = distributeMarginForDisplay(items, margin, ratios);
    expect(out.reduce((s, i) => s + i.total, 0)).toBe(2_500_000 + margin);
    // 장비 라인은 분배 대상 아님 — 원금 그대로
    expect(out.find((i) => i.category === "equipment")?.total).toBe(500_000);
  });

  it("자재·인건비 둘 다 없으면 전액 이윤 라인으로", () => {
    const items = [li("equipment", 1_000_000)];
    const margin = 300_000;
    const out = distributeMarginForDisplay(items, margin, ratios);
    const profit = out.find((i) => i.synthetic);
    expect(profit?.total).toBe(300_000);
  });

  it("비율 합 ≠ 100% (60/30/30) 도 정규화되어 합계 불변", () => {
    const items = [li("material", 1_000_000), li("labor", 1_000_000)];
    const margin = 600_000;
    const out = distributeMarginForDisplay(items, margin, { material: 0.6, labor: 0.3, profit: 0.3 });
    expect(out.reduce((s, i) => s + i.total, 0)).toBe(2_000_000 + margin);
  });

  it("내부 라인 원본은 수정하지 않음 (새 배열 반환)", () => {
    const items = [li("material", 1_000_000)];
    distributeMarginForDisplay(items, 500_000, ratios);
    expect(items[0].total).toBe(1_000_000);
  });
});

// ─── buildLineItems — finishingMethods (절곡/기성품, 2026-06-12 확정) ─

describe("buildLineItems — 용마루 마감 방식", () => {
  // areaM2 100 → ridgeLength = round(√100 × 0.8) = 8m

  it("징크250 기본 = 절곡: 용마루 절곡 라인 하나만 (마감 m당 라인 없음 — 이중 계산 회귀 방지)", () => {
    const items = buildLineItems(baseInput({ scope: { ridge: true } }));
    const ridgeBend = items.find((i) => i.name.startsWith("용마루 절곡"));
    expect(ridgeBend).toBeDefined();
    // 350mm × 36원 × (8m/3) = 33,600원
    expect(ridgeBend?.total).toBe(33_600);
    expect(items.find((i) => i.name === "용마루 마감")).toBeUndefined();
    expect(items.find((i) => i.name.includes("기성품"))).toBeUndefined();
  });

  it("일반기와 기본 = 기성품: 3m 규격 개수 환산 (8m → 3개 × 고전 14,300원)", () => {
    const items = buildLineItems(baseInput({ materialType: "generalTile", scope: { ridge: true } }));
    const ready = items.find((i) => i.name.includes("기성품"));
    expect(ready).toBeDefined();
    expect(ready?.quantity).toBe(3); // ceil(8 / 3)
    expect(ready?.unitPrice).toBe(14_300); // 카탈로그 용마루 (고전)
    expect(ready?.total).toBe(42_900);
    expect(items.find((i) => i.name.startsWith("용마루 절곡"))).toBeUndefined();
  });

  it("명시적 override 가 자재 default 를 이김 (기와 + 절곡 지정)", () => {
    const items = buildLineItems(baseInput({
      materialType: "generalTile",
      scope: { ridge: true },
      finishingMethods: { ridge: "bending" },
    }));
    expect(items.find((i) => i.name.startsWith("용마루 절곡"))).toBeDefined();
    expect(items.find((i) => i.name.includes("기성품"))).toBeUndefined();
  });

  it("징크250 + 기성품 지정 → 멀티용마루 (혼용 케이스)", () => {
    const items = buildLineItems(baseInput({
      scope: { ridge: true },
      finishingMethods: { ridge: "ready" },
    }));
    const ready = items.find((i) => i.name.includes("기성품"));
    expect(ready?.name).toContain("멀티용마루");
    expect(ready?.unitPrice).toBe(13_200);
  });

  it("카탈로그에서 이미 용마루를 골랐으면 자동 기성품 라인 생략 (중복 방지 가드)", () => {
    const items = buildLineItems(baseInput({
      scope: { ridge: true },
      finishingMethods: { ridge: "ready" },
      catalogSelections: [{
        category: "finishing", key: "multiRidge", label: "멀티용마루",
        unit: "개", quantity: 2, unitPrice: 13_200,
      }],
    }));
    expect(items.find((i) => i.name.includes("기성품"))).toBeUndefined();
  });

  it("scope.ridge 꺼져 있으면 어떤 용마루 라인도 없음", () => {
    const items = buildLineItems(baseInput({ scope: {} }));
    expect(items.find((i) => i.name.includes("용마루"))).toBeUndefined();
  });
});

describe("buildLineItems — 미시 마감 방식 (스틸방수)", () => {
  const steelInput = (finishing?: BuildLineItemsInput["finishingMethods"]) => baseInput({
    constructionType: "steelWaterproof",
    materialType: "parapet",
    scope: { handrail: true, cap: true },
    railPerimeterM: 20,
    parapetHeightCm: 60,
    finishingMethods: finishing,
  });

  it("기본 = 절곡: 미시 절곡 라인 생성", () => {
    const items = buildLineItems(steelInput());
    expect(items.find((i) => i.name.startsWith("미시 절곡"))).toBeDefined();
  });

  it("기성품 지정 → 미시 절곡 생략, 두겁 절곡은 유지", () => {
    const items = buildLineItems(steelInput({ mishi: "ready" }));
    expect(items.find((i) => i.name.startsWith("미시 절곡"))).toBeUndefined();
    expect(items.find((i) => i.name.startsWith("두겁 절곡"))).toBeDefined();
  });
});

describe("buildLineItems — 카탈로그 3그룹 (마감재/부자재/물받이 부속)", () => {
  it("기본값: 부자재 심플 3% 라인 생성, 마감재는 켜져 있지만 추가 금액 0 → 라인 없음 (0원 라인 금지)", () => {
    const items = buildLineItems(baseInput());
    const accessory = items.find((i) => i.name.includes("부자재"));
    expect(accessory).toBeDefined();
    expect(accessory?.name).toContain("(심플)");
    expect(items.find((i) => i.name.includes("마감재"))).toBeUndefined();
    expect(items.find((i) => i.total === 0)).toBeUndefined(); // 0원 라인 금지
  });

  it("마감재 상세 모드: 기성품(용마루)과 절곡 항목을 같이 담을 수 있음", () => {
    const items = buildLineItems(baseInput({
      catalogModes: { finishing: { enabled: true, mode: "detailed" } },
      catalogSelections: [
        { category: "finishing", key: "multiRidge", label: "멀티용마루", unit: "개", quantity: 2, unitPrice: 13_200 },
        { category: "bending", key: "custom_bending_1", label: "추가 절곡", unit: "m", quantity: 5, unitPrice: 4_000 },
      ],
    }));
    expect(items.find((i) => i.name === "멀티용마루")?.total).toBe(26_400);
    expect(items.find((i) => i.name === "추가 절곡")?.total).toBe(20_000);
  });

  it("그룹 체크 해제 시 상세 선택 항목도 전부 제외", () => {
    const items = buildLineItems(baseInput({
      catalogModes: { accessory: { enabled: false, mode: "detailed" } },
      catalogSelections: [
        { category: "fastener", key: "custom_fastener_1", label: "피스", unit: "개", quantity: 100, unitPrice: 300 },
      ],
    }));
    expect(items.find((i) => i.name === "피스")).toBeUndefined();
    expect(items.find((i) => i.name.includes("부자재"))).toBeUndefined();
  });

  it("물받이 부속 심플 perM — 물받이 길이 없으면 라인 없음, 있으면 길이 × 단가", () => {
    const without = buildLineItems(baseInput());
    expect(without.find((i) => i.name.includes("물받이 부속"))).toBeUndefined();
    const withGutter = buildLineItems(baseInput({ gutterMode: "front", gutterLengthM: 10 }));
    const line = withGutter.find((i) => i.name.includes("물받이 부속"));
    expect(line?.total).toBe(20_000); // 10m × 2,000원
  });
});

describe("buildLineItems — 하지 (개수 × 개당단가 × 계수)", () => {
  it("목재: 100㎡ × 1.4개/㎡ = 140개 × 3,333원", () => {
    const items = buildLineItems(baseInput({ substructureType: "wood" }));
    const sub = items.find((i) => i.name === "목재 하지");
    expect(sub).toBeDefined();
    expect(sub?.quantity).toBe(140); // ceil(100 × 1.4)
    expect(sub?.unit).toBe("개");
    expect(sub?.unitPrice).toBe(3333);
    expect(sub?.total).toBe(140 * 3333);
  });

  it("철재: 100㎡ × 0.76개/㎡ = 76개 × 18,000원", () => {
    const items = buildLineItems(baseInput({ substructureType: "steel" }));
    const sub = items.find((i) => i.name === "철재 하지");
    expect(sub?.quantity).toBe(76); // ceil(100 × 0.76)
    expect(sub?.unitPrice).toBe(18000);
    expect(sub?.total).toBe(76 * 18000);
  });

  it("개수는 올림 (발주 단위) — 50㎡ × 1.4 = 70개", () => {
    const items = buildLineItems(baseInput({ areaM2: 50, substructureType: "wood" }));
    expect(items.find((i) => i.name === "목재 하지")?.quantity).toBe(70);
  });

  it("로스율은 하지 개수에 영향 없음 (계수가 곧 소비 규칙)", () => {
    const withLoss = buildLineItems(baseInput({ substructureType: "wood", applyLossRate: true, lossRate: 0.2 }));
    expect(withLoss.find((i) => i.name === "목재 하지")?.quantity).toBe(140); // 로스 무관
  });

  it("substructureType 없으면 하지 라인 없음", () => {
    const items = buildLineItems(baseInput());
    expect(items.find((i) => i.name.includes("하지"))).toBeUndefined();
  });

  it("override 로 개당 단가 변경 시 반영", () => {
    const items = buildLineItems(baseInput({
      substructureType: "wood",
      pricingOverrides: { substructureWoodPricePerPiece: 4000 },
    }));
    expect(items.find((i) => i.name === "목재 하지")?.unitPrice).toBe(4000);
  });
});

describe("buildLineItems — 소모품 계수 (설정값에서 읽음)", () => {
  // 소모품은 buildingShape 있을 때만 자동 생성.
  it("스크류 대 = 면적 × screwLargePerSqm (설정값)", () => {
    const items = buildLineItems(baseInput({
      buildingShape: "rectangle",
      settings: { ...baseSettings, screwLargePerSqm: 5 } as typeof baseSettings,
    }));
    // 100㎡ × 5 = 500개
    expect(items.find((i) => i.name === "스크류 (대)")?.quantity).toBe(500);
  });

  it("실리콘 = ceil(접합부 ÷ siliconeCoverageM)", () => {
    // 절곡 라인이 있어야 접합부 길이가 생김 — ridge bending (8m) 사용
    const items = buildLineItems(baseInput({
      buildingShape: "rectangle",
      scope: { ridge: true },
      settings: { ...baseSettings, siliconeCoverageM: 4 } as typeof baseSettings,
    }));
    const silicone = items.find((i) => i.name === "실리콘");
    // 용마루 절곡 8m ÷ 4 = 2개 (다른 절곡 없으면)
    expect(silicone).toBeDefined();
    expect(silicone!.quantity).toBeGreaterThan(0);
  });

  it("buildingShape 없으면 소모품 라인 없음 (현행 게이트 유지)", () => {
    const items = buildLineItems(baseInput());
    expect(items.find((i) => i.name.startsWith("스크류"))).toBeUndefined();
    expect(items.find((i) => i.name === "실리콘")).toBeUndefined();
  });
});

describe("buildLineItems — 로스율", () => {
  it("로스율 적용 시 강판 면적 = 면적 × (1 + 로스율)", () => {
    const items = buildLineItems(baseInput({ applyLossRate: true, lossRate: 0.1 }));
    const main = items.find((i) => i.name.includes("시공"));
    expect(main?.quantity).toBeCloseTo(110, 5);
    expect(main?.name).toContain("로스율 10%");
  });

  it("로스율 미적용 시 면적 그대로", () => {
    const items = buildLineItems(baseInput());
    const main = items.find((i) => i.name.includes("시공"));
    expect(main?.quantity).toBe(100);
  });
});
