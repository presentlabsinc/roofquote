/**
 * 공장 기본값 — 단가·계수·정책의 **유일한 출처** (2026-09-28 통합).
 *
 * 이전엔 같은 값이 세 곳(SettingsForm DEFAULTS · lib/auth.ts 신규 계정 생성 · prisma @default)에
 * 따로 있어 서로 달랐다 (폐기물 30만 vs 100만/차 등 — 외부 감사 L11). 이제:
 *   - 신규 계정 PricingSettings 생성 (lib/auth.ts getOrCreatePricingSettings)
 *   - 설정 화면 '공장 기본값' 불러오기 (SettingsForm)
 *   - 옛 프리셋 활성화 시 스냅샷에 없는 필드 채우기 (lib/presets.ts)
 * 가 모두 이 객체를 쓴다. 값을 바꿀 땐 여기만 고치고, prisma @default 도 맞춰 둘 것
 * (lib/__tests__/defaults.test.ts 가 스키마 @default 와의 일치를 검사).
 *
 * 클라이언트·서버 공용 (순수 데이터) — 서버 전용 import 금지.
 */
export const FACTORY_DEFAULTS = {
  // ── 강판 ──
  /** 레거시 ㎡ 단가 — m당 단가가 0인 자재(템바징크)의 폴백으로만 쓰임. */
  materialPricePerSqm: 12000,
  // 자재 타입별 m당 단가 (천보 도매가, VAT포함, 0.45t, 100원 올림)
  materialPriceSlatePerM: 8100,
  materialPriceV250PerM: 8100,
  materialPriceZinc250PerM: 8100,
  materialPriceGeneralTilePerM: 8600,
  materialPriceTraditionalTilePerM: 8600,
  materialPriceRealZincPerM: 12000,
  materialPriceParapetPerM: 12200,
  materialPriceOverlayPanelPerM: 13300,
  materialPriceTambourPerM: 0,
  /** 레거시 — 엔진 미사용 (부자재는 카탈로그 그룹 %). */
  accessoryRate: 0.03,
  // ── 레거시 마감 단가 (엔진 미사용, 호환 유지) ──
  ridgePricePerM: 25000,
  eavePricePerM: 20000,
  capBendingPricePerM: 5000,
  // ── 물받이·철거·폐기물 ──
  gutterPricePerM: 5000,
  removalPricePerSqm: 8000,
  /** 폐기물 트럭 1대당 (견적의 트럭 수 × 이 값). */
  wasteDisposalCost: 1000000,
  // ── 노무 ──
  dailyWage: 300000,
  defaultWorkerCount: 3,
  // ── 장비 ──
  skyliftDailyCost: 500000,
  ladderTruckDailyCost: 150000,
  scaffoldDailyCost: 150000,
  scaffoldPricePerSqmDay: 3000,
  baseTransportCost: 250000,
  // ── 하지 ──
  substructureMode: "wood",
  substructureWoodPricePerSqm: 30000,
  substructureSteelPricePerSqm: 40000,
  substructureWoodPricePerPiece: 3333,
  substructureWoodPiecesPerSqm: 1.4,
  substructureSteelPricePerPiece: 14000,
  substructureSteelPiecesPerSqm: 0.76,
  // ── 스틸방수 ──
  /** 새 배수구 타공 — 원가 0 (다 마진, 2026-06-16 사용자 확인). */
  drainHolePrice: 0,
  stainlessDrainPricePerM: 32000,
  downspoutUnitPrice: 50000,
  denjoPricePerUnit: 700000,
  endCapPrice: 3500,
  parapetMultiplier: 1.4,
  drainageWorkCost: 500000,
  // ── 강판 부속 ──
  peFoamPricePerSqm: 1000,
  // ── 로스율 ──
  defaultLossRate: 0.10,
  /** 새 견적의 로스율 토글 기본값. true = 그동안 폼이 항상 켜서 시작하던 동작과 같음. */
  useLossRateByDefault: true,
  lossRateMode: "auto",
  // ── 절곡 ──
  bendingPricePerMmPer3m: 36,
  bendingWidthRidge: 350,
  bendingWidthEave: 250,
  bendingWidthCap: 200,
  bendingWidthMishi: 150,
  bendingWidthFlashing: 200,
  bendingWidthValley: 300,
  bendingWidthSnowGuard: 180,
  bendingWidthFascia: 200,
  // ── 소모품 ──
  screwLargePrice: 300,
  screwSmallPrice: 100,
  screwLargePerBag: 100,
  screwSmallPerBag: 100,
  siliconePrice: 5000,
  screwLargePerSqm: 2,
  screwSmallPerBendM: 3.3,
  siliconeCoverageM: 6,
  // ── 단열재 ──
  insulationPricePerSqm: 15000,
  insulationPriceEps: 4000,
  insulationPriceXps: 11000,
  insulationPricePir: 16000,
  insulationPriceThermalReflect: 6000,
  // ── 경비 ──
  mealCostPerPersonMeal: 20000,     // 점심 1만 + 음료·간식 1만 (1인 1일)
  lodgingCostPerPersonNight: 35000, // 2인실 7만 ÷ 2 (1인 1박)
  teamExpenseAmount: 150000,
  insuranceRateOfLabor: 0.05,
  // ── 정책 ──
  defaultMarginRate: 0.30,
  vatIncludedByDefault: true,
  marginMaterialRatio: 0.5,
  marginLaborRatio: 0.25,
  marginProfitRatio: 0.25,
  // ── 계수 ──
  constructionToBuildingRatio: 1.4,
  workDaysAreaDivisor: 90,
  // ── JSON override (빈 객체 = 코드 기본) ──
  materialWidths: {} as Record<string, number>,
  accessoryLengths: {} as Record<string, number>,
  insulationUnitAreas: {} as Record<string, number>,
  catalogDefaults: {} as Record<string, Record<string, number | string | boolean>>,
  catalogPrices: {} as Record<string, number>,
  thicknessMultipliers: {} as Record<string, number>,
  roofShapeLossRates: {} as Record<string, number>,
};

export type FactoryDefaults = typeof FACTORY_DEFAULTS;

/** 신규 계정 기본 안내 문구 (설정 → 안내 문구). */
export const DEFAULT_NOTICE_TEXT = "1. 견적 외 공사 발생 시 추가 정산합니다.\n2. 공사 하자 A/S 기간은 3년입니다.";

/** 신규 계정의 회사명 자리표시 — 홈 화면 '회사 정보 입력 필요' 배너가 이 값을 감지. */
export const PLACEHOLDER_COMPANY_NAME = "회사명을 설정에서 입력하세요";
