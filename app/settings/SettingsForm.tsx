"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Check, Upload, X } from "lucide-react";
import type { PricingSettings } from "@prisma/client";
import { MATERIAL_TYPES, MATERIAL_EFFECTIVE_WIDTH_MM, type MaterialType } from "@/lib/types";
import { convertMPriceToSqmPrice } from "@/lib/calculations";

// 강판 자재별 단가 카드에 표시할 자재 + 해당 m당 단가 키 매핑.
const STEEL_PRICE_KEYS: { type: MaterialType; label: string; key: string }[] = [
  { type: "slate",           label: "S골 / 슬레이트",   key: "materialPriceSlatePerM" },
  { type: "zinc250",         label: "징크250",          key: "materialPriceZinc250PerM" },
  { type: "v250",            label: "V250",             key: "materialPriceV250PerM" },
  { type: "generalTile",     label: "일반기와형",       key: "materialPriceGeneralTilePerM" },
  { type: "traditionalTile", label: "전통기와형",       key: "materialPriceTraditionalTilePerM" },
  { type: "realZinc",        label: "징크 / 리얼징크",  key: "materialPriceRealZincPerM" },
  { type: "parapet",         label: "파라펫",           key: "materialPriceParapetPerM" },
  { type: "overlayPanel",    label: "덧방용 강판",      key: "materialPriceOverlayPanelPerM" },
  { type: "tambour",         label: "템바징크 (미정)",  key: "materialPriceTambourPerM" },
];

// 부자재 단가 — 한 카드에 통합.
//  - spec: 규격(3m/5m) 기성품. [규격 길이]+[규격당 가격] → m당 환산. priceKey 엔 m당 저장.
//  - flat: 규격 없는 단순 단가 (처마 m당, 엔드캡 개당). priceKey 단가 그대로.
// 용마루 규격 단가 행 제거 (2026-06-12): finishingMethods 도입으로 ridgePricePerM 은
// 엔진 미사용 — 절곡 모드는 절곡 단가, 기성품 모드는 카탈로그(천보가) 사용.
// 처마 마감(eavePricePerM) 행도 제거 — 처마는 건당 시공(denjo)으로 재정의되어 미사용.
const ACCESSORY_SPEC_KEYS: { lenKey: string; priceKey: string; label: string; defaultLenMm: number }[] = [
  { lenKey: "gutter", priceKey: "gutterPricePerM", label: "물받이",  defaultLenMm: 5000 },
];
const ACCESSORY_FLAT_KEYS: { priceKey: string; label: string; unit: string }[] = [
  { priceKey: "endCapPrice",   label: "엔드캡",   unit: "원/개" },
];

// 절곡 부재 — 넓이mm 입력 → 3m당 가격 = 넓이 × 절곡단가 미리보기. (절곡은 3m 단위 가공이라 3m당이 직관적.)
const BENDING_PART_KEYS: { key: string; label: string }[] = [
  { key: "bendingWidthRidge",     label: "용마루" },
  { key: "bendingWidthEave",      label: "처마" },
  { key: "bendingWidthCap",       label: "두겁" },
  { key: "bendingWidthMishi",     label: "미시" },
  { key: "bendingWidthFlashing",  label: "프래싱" },
  { key: "bendingWidthFascia",    label: "페이샤/후레싱" },
  { key: "bendingWidthValley",    label: "회침" },
  { key: "bendingWidthSnowGuard", label: "눈방지턱" },
];

const DEFAULTS = {
  companyName: "",
  companyPhone: "",
  companyAddress: "",
  businessRegistrationNumber: "",
  sealImageUrl: "",
  bankAccount: "",
  noticeText: "1. 견적 외 공사 발생 시 추가 정산합니다.\n2. 공사 하자 A/S 기간은 3년입니다.",
  materialPricePerSqm: 30000,
  // 자재 타입별 m당 단가 (천보 도매가, VAT포함)
  materialPriceSlatePerM: 8100,
  materialPriceV250PerM: 8100,
  materialPriceZinc250PerM: 8100,
  materialPriceGeneralTilePerM: 8600,
  materialPriceTraditionalTilePerM: 8600,
  materialPriceRealZincPerM: 12000,
  materialPriceParapetPerM: 12200,
  materialPriceOverlayPanelPerM: 13300,
  materialPriceTambourPerM: 0,
  accessoryRate: 0.15,
  // materialPricePerSqm 은 DEFAULTS 에 이미 있음 (구버전 폴백). FIELDS 에선 숨김.
  ridgePricePerM: 25000,
  eavePricePerM: 20000,
  gutterPricePerM: 5000,
  removalPricePerSqm: 8000,
  wasteDisposalCost: 300000,
  dailyWage: 300000,
  defaultWorkerCount: 3,
  skyliftDailyCost: 500000,
  ladderTruckDailyCost: 150000,
  scaffoldDailyCost: 150000,
  scaffoldPricePerSqmDay: 3000,
  substructureMode: "wood",
  substructureWoodPricePerSqm: 30000,
  substructureSteelPricePerSqm: 40000,
  substructureWoodPricePerPiece: 3333,
  substructureWoodPiecesPerSqm: 1.4,
  substructureSteelPricePerPiece: 18000,
  substructureSteelPiecesPerSqm: 0.76,
  drainHolePrice: 0,
  capBendingPricePerM: 5000,
  endCapPrice: 3500,
  stainlessDrainPricePerM: 32000,
  peFoamPricePerSqm: 1000,
  downspoutUnitPrice: 50000,
  denjoPricePerUnit: 700000,
  parapetMultiplier: 1.4,
  defaultLossRate: 0.15,
  estimateNumberStart: 1,
  marginMaterialRatio: 0.5,
  marginLaborRatio: 0.25,
  marginProfitRatio: 0.25,
  useLossRateByDefault: false,
  baseTransportCost: 250000,
  mealCostPerPersonMeal: 20000,
  lodgingCostPerPersonNight: 35000,
  teamExpenseAmount: 150000,
  insuranceRateOfLabor: 0.05,
  defaultMarginRate: 0.33,
  vatIncludedByDefault: true,
  // 로스율 적용 모드 — "auto" (지붕형태별 자동) | "manual" (디폴트값 항상)
  lossRateMode: "auto" as "auto" | "manual",
  // ── 절곡 단가 및 기본 넓이 ──
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
  insulationPricePerSqm: 15000,
  insulationPriceEps: 4000,
  insulationPriceXps: 11000,
  insulationPricePir: 16000,
  insulationPriceThermalReflect: 6000,
};

/** 전화번호 자동 포맷 — 010-1234-5678 / 02-123-4567 / 031-123-4567 등.
 *  02(서울)는 지역번호 2자리, 그 외는 3자리. 입력 중 숫자만 받아 하이픈 자동 삽입. */
function formatPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.startsWith("02")) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `02-${d.slice(2)}`;
    if (d.length <= 9) return `02-${d.slice(2, d.length - 4)}-${d.slice(d.length - 4)}`;
    return `02-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(d.length - 4)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

/** 사업자등록번호 자동 포맷 — xxx-xx-xxxxx (3-2-5, 총 10자리). */
function formatBizNo(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5, 10)}`;
}

type FieldDef = { key: keyof typeof DEFAULTS; label: string; unit?: string; step?: number; pct?: boolean };

/**
 * 설정 섹션 — 변경 빈도 3계층으로 정렬.
 *   tier 1 회사 정보 (1회 설정) — 맨 위 (정체성)
 *   tier 2 견적 기본 정책 (자주 조정) — 마진/로스율/VAT/견적번호
 *   tier 3 단가표 (거의 고정) — 자재/하지/절곡/소모품/스틸방수/노무·장비·운송
 *
 * `tier` 값이 바뀌는 첫 섹션 앞에 구분선이 렌더링됨.
 * 특수 카드(직인+안내문구 / 마진분배 / 정책토글)는 특정 섹션 뒤에 끼워넣음 (render 참고).
 */
type Tier = "company" | "policy" | "price";
const FIELDS: { section: string; emoji: string; tier: Tier; items: FieldDef[] }[] = [
  // ─── tier 1: 회사 정보 ───
  {
    section: "회사 정보",
    emoji: "🏢",
    tier: "company",
    items: [
      { key: "companyName", label: "회사명" },
      { key: "companyPhone", label: "대표 연락처" },
      { key: "companyAddress", label: "회사 주소" },
      { key: "businessRegistrationNumber", label: "사업자등록번호" },
      { key: "bankAccount", label: "입금 계좌" },
    ],
  },
  // ─── tier 2: 견적 기본 정책 ───
  {
    section: "마진",
    emoji: "💰",
    tier: "policy",
    items: [
      { key: "defaultMarginRate", label: "기본 마진율 (매출 대비)", unit: "%", step: 0.01, pct: true },
    ],
  },
  {
    section: "견적 기본값",
    emoji: "📋",
    tier: "policy",
    items: [
      { key: "defaultLossRate", label: "기본 자재 로스율", unit: "%", step: 0.01, pct: true },
      { key: "defaultWorkerCount", label: "기본 작업 인원", unit: "명" },
      // 견적 번호 시작값 — 새 견적 번호 = estimateNumberStart + 올해 이미 만든 견적 수.
      { key: "estimateNumberStart", label: "견적 번호 시작값 (YYYY-XXX)", unit: "" },
    ],
  },
  // ─── tier 3: 단가표 ───
  // 단가표 첫 섹션("하지 작업 단가") 직전에 전용 카드 2개 렌더 (render 참고):
  //   ① 강판 자재별 단가 (SteelSheetPricingCard, PE폼 포함)
  //   ② 부자재 단가 (AccessoryPricingCard — 용마루/물받이 규격환산 + 처마/엔드캡 단순단가 통합)
  {
    // items 비움 — 하지는 SubstructurePricingCard(개당단가 × 개/㎡ 환산)로 렌더.
    // 이 섹션은 단가표 tier 의 첫 항목이라 tier 구분선 + 강판/부자재/하지 카드의 앵커.
    section: "하지 작업 단가",
    emoji: "🪵",
    tier: "price",
    items: [],
  },
  // 절곡(단가+부재 넓이) + 소모품(스크류+실리콘) + 단열재는 전용 카드로 "스틸방수 단가" 섹션 직전 렌더 (render 참고).
  {
    section: "스틸방수 단가",
    emoji: "🟦",
    tier: "price",
    items: [
      { key: "stainlessDrainPricePerM", label: "스테인리스 배수로 m당", unit: "원" },
      { key: "downspoutUnitPrice", label: "홈통 (개당)", unit: "원" },
      { key: "drainHolePrice", label: "새 배수구 타공 (개당)", unit: "원" },
      // 두겁 절곡은 절곡 단가 그룹(bendingWidthCap)으로 계산 — capBendingPricePerM 은 레거시라 UI에서 제거.
    ],
  },
  {
    section: "노무비",
    emoji: "👷",
    tier: "price",
    items: [
      { key: "dailyWage", label: "1인 1일 인건비", unit: "원" },
      { key: "mealCostPerPersonMeal", label: "식대·간식 (1인 1일)", unit: "원" },
      { key: "lodgingCostPerPersonNight", label: "숙박 (1인 1박)", unit: "원" },
      // 경비 — 팀 경비(잡비) + 제경비(산재·고용보험, 노무비 대비 %).
      { key: "teamExpenseAmount", label: "팀 경비 (잡비)", unit: "원" },
      { key: "insuranceRateOfLabor", label: "제경비 (노무비 대비)", unit: "%", step: 0.01, pct: true },
      // 철거는 인건이라 노무비. (폐기물은 트럭 운반이라 장비·운송으로.)
      { key: "removalPricePerSqm", label: "철거 ㎡당", unit: "원" },
      // 처마/덴조 — 건당 시공 (대부분 인건). 후레싱 등 자재는 별도.
      { key: "denjoPricePerUnit", label: "처마/덴조 시공 (건당)", unit: "원" },
    ],
  },
  {
    section: "장비·운송 단가",
    emoji: "🚚",
    tier: "price",
    items: [
      { key: "skyliftDailyCost", label: "스카이차 1일", unit: "원" },
      { key: "ladderTruckDailyCost", label: "사다리차 1일", unit: "원" },
      { key: "scaffoldPricePerSqmDay", label: "비계 ㎡·일당", unit: "원" },
      { key: "baseTransportCost", label: "기본 운송비", unit: "원" },
      // 폐기물은 트럭 운반비라 장비·운송.
      { key: "wasteDisposalCost", label: "폐기물 처리비 (트럭 1차당)", unit: "원" },
    ],
  },
];

/** 계층 구분선 라벨 — 각 tier 의 첫 섹션 앞에 표시. */
const TIER_LABELS: Record<Tier, string> = {
  company: "",                     // 맨 위라 라벨 생략
  policy: "견적 기본 정책 · 자주 조정",
  price: "단가표 · 한 번 설정하면 거의 고정",
};

interface Props {
  defaultValues: PricingSettings | null;
  presets?: { id: string; name: string }[];
  activePresetId?: string | null;
}

export function SettingsForm({ defaultValues, presets = [], activePresetId = null }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // ── 프리셋 (활성 프리셋 모델) ──
  const [presetList, setPresetList] = useState(presets);
  const [activeId, setActiveId] = useState<string | null>(activePresetId);
  const activeName = presetList.find((p) => p.id === activeId)?.name ?? null;
  const [pickerOpen, setPickerOpen] = useState(false);
  // naming UI: "first" = 활성 프리셋 없을 때 첫 저장, "saveAs" = 다른 이름으로 저장
  const [naming, setNaming] = useState<null | "first" | "saveAs">(null);
  const [nameInput, setNameInput] = useState("");
  const [values, setValues] = useState<typeof DEFAULTS>(() => {
    if (!defaultValues) return DEFAULTS;
    return {
      companyName: defaultValues.companyName,
      companyPhone: defaultValues.companyPhone ?? "",
      companyAddress: defaultValues.companyAddress ?? "",
      businessRegistrationNumber: defaultValues.businessRegistrationNumber ?? "",
      sealImageUrl: defaultValues.sealImageUrl ?? "",
      bankAccount: defaultValues.bankAccount ?? "",
      noticeText: defaultValues.noticeText ?? "1. 견적 외 공사 발생 시 추가 정산합니다.\n2. 공사 하자 A/S 기간은 3년입니다.",
      materialPricePerSqm: defaultValues.materialPricePerSqm,
      materialPriceSlatePerM: (defaultValues as unknown as Record<string, number>).materialPriceSlatePerM ?? 8100,
      materialPriceV250PerM: (defaultValues as unknown as Record<string, number>).materialPriceV250PerM ?? 8100,
      materialPriceZinc250PerM: (defaultValues as unknown as Record<string, number>).materialPriceZinc250PerM ?? 8100,
      materialPriceGeneralTilePerM: (defaultValues as unknown as Record<string, number>).materialPriceGeneralTilePerM ?? 8600,
      materialPriceTraditionalTilePerM: (defaultValues as unknown as Record<string, number>).materialPriceTraditionalTilePerM ?? 8600,
      materialPriceRealZincPerM: (defaultValues as unknown as Record<string, number>).materialPriceRealZincPerM ?? 12000,
      materialPriceParapetPerM: (defaultValues as unknown as Record<string, number>).materialPriceParapetPerM ?? 12200,
      materialPriceOverlayPanelPerM: (defaultValues as unknown as Record<string, number>).materialPriceOverlayPanelPerM ?? 13300,
      materialPriceTambourPerM: (defaultValues as unknown as Record<string, number>).materialPriceTambourPerM ?? 0,
      accessoryRate: defaultValues.accessoryRate,
      ridgePricePerM: defaultValues.ridgePricePerM,
      eavePricePerM: defaultValues.eavePricePerM,
      gutterPricePerM: defaultValues.gutterPricePerM,
      removalPricePerSqm: defaultValues.removalPricePerSqm,
      wasteDisposalCost: defaultValues.wasteDisposalCost,
      dailyWage: defaultValues.dailyWage,
      defaultWorkerCount: defaultValues.defaultWorkerCount,
      skyliftDailyCost: defaultValues.skyliftDailyCost,
      ladderTruckDailyCost: defaultValues.ladderTruckDailyCost,
      scaffoldDailyCost: defaultValues.scaffoldDailyCost,
      scaffoldPricePerSqmDay: defaultValues.scaffoldPricePerSqmDay,
      substructureMode: defaultValues.substructureMode,
      substructureWoodPricePerSqm: defaultValues.substructureWoodPricePerSqm,
      substructureSteelPricePerSqm: defaultValues.substructureSteelPricePerSqm,
      substructureWoodPricePerPiece: (defaultValues as unknown as Record<string, number>).substructureWoodPricePerPiece ?? 3333,
      substructureWoodPiecesPerSqm: (defaultValues as unknown as Record<string, number>).substructureWoodPiecesPerSqm ?? 1.4,
      substructureSteelPricePerPiece: (defaultValues as unknown as Record<string, number>).substructureSteelPricePerPiece ?? 18000,
      substructureSteelPiecesPerSqm: (defaultValues as unknown as Record<string, number>).substructureSteelPiecesPerSqm ?? 0.76,
      drainHolePrice: defaultValues.drainHolePrice,
      capBendingPricePerM: defaultValues.capBendingPricePerM,
      endCapPrice: defaultValues.endCapPrice,
      stainlessDrainPricePerM: defaultValues.stainlessDrainPricePerM,
      peFoamPricePerSqm: defaultValues.peFoamPricePerSqm ?? 1000,
      parapetMultiplier: defaultValues.parapetMultiplier,
      defaultLossRate: defaultValues.defaultLossRate,
      useLossRateByDefault: defaultValues.useLossRateByDefault,
      baseTransportCost: defaultValues.baseTransportCost,
      mealCostPerPersonMeal: defaultValues.mealCostPerPersonMeal,
      lodgingCostPerPersonNight: defaultValues.lodgingCostPerPersonNight,
      teamExpenseAmount: (defaultValues as unknown as Record<string, number>).teamExpenseAmount ?? 150000,
      insuranceRateOfLabor: (defaultValues as unknown as Record<string, number>).insuranceRateOfLabor ?? 0.05,
      defaultMarginRate: defaultValues.defaultMarginRate,
      vatIncludedByDefault: defaultValues.vatIncludedByDefault,
      estimateNumberStart: defaultValues.estimateNumberStart ?? 1,
      marginMaterialRatio: defaultValues.marginMaterialRatio ?? 0.5,
      marginLaborRatio: defaultValues.marginLaborRatio ?? 0.25,
      marginProfitRatio: defaultValues.marginProfitRatio ?? 0.25,
      bendingPricePerMmPer3m: defaultValues.bendingPricePerMmPer3m ?? 36,
      bendingWidthRidge: defaultValues.bendingWidthRidge ?? 350,
      bendingWidthEave: defaultValues.bendingWidthEave ?? 250,
      bendingWidthCap: defaultValues.bendingWidthCap ?? 200,
      bendingWidthMishi: defaultValues.bendingWidthMishi ?? 150,
      bendingWidthFlashing: defaultValues.bendingWidthFlashing ?? 200,
      bendingWidthValley: defaultValues.bendingWidthValley ?? 300,
      bendingWidthSnowGuard: defaultValues.bendingWidthSnowGuard ?? 180,
      bendingWidthFascia: (defaultValues as unknown as Record<string, number>).bendingWidthFascia ?? 200,
      screwLargePrice: defaultValues.screwLargePrice ?? 300,
      screwSmallPrice: defaultValues.screwSmallPrice ?? 100,
      screwLargePerBag: (defaultValues as unknown as Record<string, number>).screwLargePerBag ?? 100,
      screwSmallPerBag: (defaultValues as unknown as Record<string, number>).screwSmallPerBag ?? 100,
      siliconePrice: defaultValues.siliconePrice ?? 5000,
      screwLargePerSqm: (defaultValues as unknown as Record<string, number>).screwLargePerSqm ?? 2,
      screwSmallPerBendM: (defaultValues as unknown as Record<string, number>).screwSmallPerBendM ?? 3.3,
      siliconeCoverageM: (defaultValues as unknown as Record<string, number>).siliconeCoverageM ?? 6,
      insulationPricePerSqm: defaultValues.insulationPricePerSqm ?? 15000,
      insulationPriceEps: (defaultValues as unknown as Record<string, number>).insulationPriceEps ?? 4000,
      insulationPriceXps: (defaultValues as unknown as Record<string, number>).insulationPriceXps ?? 11000,
      insulationPricePir: (defaultValues as unknown as Record<string, number>).insulationPricePir ?? 16000,
      insulationPriceThermalReflect: (defaultValues as unknown as Record<string, number>).insulationPriceThermalReflect ?? 6000,
      lossRateMode: (((defaultValues as unknown as { lossRateMode?: string }).lossRateMode === "manual") ? "manual" : "auto") as "auto" | "manual",
      downspoutUnitPrice: (defaultValues as unknown as { downspoutUnitPrice?: number }).downspoutUnitPrice ?? 50000,
      denjoPricePerUnit: (defaultValues as unknown as { denjoPricePerUnit?: number }).denjoPricePerUnit ?? 700000,
    };
  });

  function setField<K extends keyof typeof DEFAULTS>(key: K, val: (typeof DEFAULTS)[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  // 자재별 유효폭(mm) override — JSON 맵이라 values 와 별도 state. 비면 코드 상수 폴백.
  const [materialWidths, setMaterialWidths] = useState<Record<string, number>>(
    () => ((defaultValues as unknown as { materialWidths?: Record<string, number> } | null)?.materialWidths) ?? {},
  );
  function setWidth(materialType: string, mm: number) {
    setMaterialWidths((w) => ({ ...w, [materialType]: mm }));
  }

  // 부자재 규격 길이(mm) override — 비면 ACCESSORY_SPEC_KEYS defaultLenMm 폴백.
  const [accessoryLengths, setAccessoryLengths] = useState<Record<string, number>>(
    () => ((defaultValues as unknown as { accessoryLengths?: Record<string, number> } | null)?.accessoryLengths) ?? {},
  );
  function setAccLen(lenKey: string, mm: number) {
    setAccessoryLengths((m) => ({ ...m, [lenKey]: mm }));
  }

  // 단열재 제품별 단위(롤/판) 면적 ㎡ override.
  const [insulationUnitAreas, setInsulationUnitAreas] = useState<Record<string, number>>(
    () => ((defaultValues as unknown as { insulationUnitAreas?: Record<string, number> } | null)?.insulationUnitAreas) ?? {},
  );
  function setInsArea(typeKey: string, area: number) {
    setInsulationUnitAreas((m) => ({ ...m, [typeKey]: area }));
  }

  /** 현재 폼 값을 라이브 PricingSettings 에 저장. 성공 시 true. */
  async function saveLive(): Promise<boolean> {
    const payload = {
      ...values,
      materialWidths,
      accessoryLengths,
      insulationUnitAreas,
      companyPhone: values.companyPhone || null,
      companyAddress: values.companyAddress || null,
      businessRegistrationNumber: values.businessRegistrationNumber || null,
      sealImageUrl: values.sealImageUrl || null,
      bankAccount: values.bankAccount || null,
      noticeText: values.noticeText || null,
    };
    const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return res.ok;
  }

  async function handleSave() {
    if (!values.companyName.trim()) {
      toast.error("회사명을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const ok = await saveLive();
      if (!ok) throw new Error("저장 실패");
      if (activeId) {
        // 활성 프리셋 덮어쓰기 (현재 단가표 갱신)
        await fetch(`/api/presets/${activeId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "overwrite" }),
        });
        toast.success(activeName ? `저장됨 · '${activeName}' 갱신` : "저장되었습니다");
        router.refresh();
      } else {
        // 활성 프리셋 없음 — 라이브는 저장됐고, 이름 붙여 프리셋으로 만들지 물어봄(선택).
        toast.success("저장되었습니다");
        setNaming("first");
        setNameInput("");
      }
    } catch {
      toast.error("저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  /** 이름 확정 — "first"(첫 저장)이면 라이브 이미 저장됨, "saveAs"면 먼저 저장 후 새 프리셋 생성. */
  async function confirmPresetName() {
    const name = nameInput.trim();
    if (!name) { toast.error("이름을 입력해 주세요."); return; }
    setSaving(true);
    try {
      if (naming === "saveAs") {
        const ok = await saveLive();
        if (!ok) throw new Error();
      }
      const res = await fetch("/api/presets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      const preset = await res.json();
      setPresetList((l) => [...l, { id: preset.id, name: preset.name }]);
      setActiveId(preset.id);
      setNaming(null); setNameInput("");
      toast.success(`'${name}' 프리셋으로 저장되었습니다`);
      router.refresh();
    } catch {
      toast.error("프리셋 저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  /** 프리셋 활성화(전환) — 서버에서 PricingSettings 에 값 복사 후 새로고침으로 폼 재초기화. */
  async function activatePreset(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/presets/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });
      if (!res.ok) throw new Error();
      // 새 값으로 폼을 다시 초기화하려면 전체 새로고침이 가장 확실 (useState 초기화는 mount 시 1회).
      window.location.reload();
    } catch {
      toast.error("불러오기에 실패했습니다");
      setSaving(false);
    }
  }

  // 공장 기본값 불러오기 — 불러오기 목록의 "공장 기본값" 항목에서 호출.
  // 단가·계수만 DEFAULTS 로, 회사정보·견적번호는 유지. 화면(state)만 바꾸고
  // 저장해야 적용 (비파괴). 활성 프리셋 해제 (activeId=null = 공장 기본값 상태).
  function loadFactoryDefaults() {
    setValues((v) => ({
      ...DEFAULTS,
      companyName: v.companyName,
      companyPhone: v.companyPhone,
      companyAddress: v.companyAddress,
      businessRegistrationNumber: v.businessRegistrationNumber,
      sealImageUrl: v.sealImageUrl,
      bankAccount: v.bankAccount,
      noticeText: v.noticeText,
      estimateNumberStart: v.estimateNumberStart,
    }));
    setMaterialWidths({});
    setAccessoryLengths({});
    setInsulationUnitAreas({});
    setActiveId(null);
    setPickerOpen(false);
    toast.success("공장 기본값을 불러왔어요. 저장하면 적용됩니다.");
  }

  return (
    <>
      {/* ── 단가표 바 (불러오기: 공장 기본값 + 내 프리셋) ── */}
      <div className="bg-card rounded-2xl border border-border/60 p-3 mb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">현재 단가표</p>
            <p className="text-sm font-semibold text-foreground truncate">
              {activeName ?? "공장 기본값"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="px-3 h-9 rounded-full bg-muted text-foreground text-xs font-semibold pressable shrink-0"
          >
            불러오기
          </button>
        </div>

        {/* 불러오기 목록 — 공장 기본값(못 지움) + 내 프리셋(지울 수 있음) */}
        {pickerOpen && (
          <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
            <button
              type="button"
              onClick={loadFactoryDefaults}
              disabled={saving}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm pressable ${activeId === null ? "bg-primary/10 text-primary font-semibold" : "bg-muted/40 text-foreground"}`}
            >
              공장 기본값{activeId === null ? " · 현재" : ""}
            </button>
            {presetList.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => activatePreset(p.id)}
                  disabled={saving}
                  className={`flex-1 text-left px-3 py-2 rounded-xl text-sm pressable ${p.id === activeId ? "bg-primary/10 text-primary font-semibold" : "bg-muted/40 text-foreground"}`}
                >
                  {p.name}{p.id === activeId ? " · 현재" : ""}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`'${p.name}' 프리셋을 삭제할까요?`)) return;
                    await fetch(`/api/presets/${p.id}`, { method: "DELETE" });
                    setPresetList((l) => l.filter((x) => x.id !== p.id));
                    if (activeId === p.id) setActiveId(null);
                  }}
                  className="w-8 h-8 grid place-items-center rounded-full bg-muted/60 pressable shrink-0"
                  aria-label="삭제"
                >
                  <X size={13} className="text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 pb-4">
        {FIELDS.map(({ section, emoji, tier, items }, idx) => {
          const isTierStart = idx === 0 || FIELDS[idx - 1].tier !== tier;
          const tierLabel = isTierStart ? TIER_LABELS[tier] : "";
          return (
          <Fragment key={section}>
            {tierLabel && (
              <div className="flex items-center gap-2 pt-3 px-1">
                <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide">{tierLabel}</span>
                <span className="flex-1 h-px bg-border/60" />
              </div>
            )}
          {/* 단가표 첫 섹션 직전에 강판 + 부자재 전용 카드 2개 렌더 */}
          {section === "하지 작업 단가" && (
            <SteelSheetPricingCard
              values={values}
              widths={materialWidths}
              peFoam={values.peFoamPricePerSqm}
              onPriceChange={(key, v) => setField(key as keyof typeof DEFAULTS, v as never)}
              onWidthChange={setWidth}
              onPeFoamChange={(v) => setField("peFoamPricePerSqm", v)}
            />
          )}
          {section === "하지 작업 단가" && (
            <AccessoryPricingCard
              values={values}
              lengths={accessoryLengths}
              onPriceChange={(key, v) => setField(key as keyof typeof DEFAULTS, v as never)}
              onLenChange={setAccLen}
            />
          )}
          {section === "하지 작업 단가" && (
            <SubstructurePricingCard
              values={values}
              onChange={(key, v) => setField(key as keyof typeof DEFAULTS, v as never)}
            />
          )}
          {items.length > 0 && (
          <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <span className="text-lg">{emoji}</span>
              <h2 className="font-semibold text-foreground">{section}</h2>
            </div>
            <div className="divide-y divide-border/40">
              {items.map(({ key, label, unit, step, pct }) => {
                const rawVal = values[key];
                const isStr = key === "companyName" || key === "companyPhone" || key === "companyAddress" || key === "businessRegistrationNumber" || key === "sealImageUrl" || key === "substructureMode" || key === "bankAccount" || key === "noticeText";
                const displayVal = isStr
                  ? String(rawVal)
                  : pct
                  ? String(Math.round((rawVal as number) * 100))
                  : String(rawVal);

                // 문자열 필드(회사명·연락처·주소·사업자번호·계좌)는 값이 길어 잘리므로
                // 라벨 위 + 전폭 입력으로 스택. 전화·사업자번호는 입력 중 자동 포맷.
                const onStrChange = (raw: string) => {
                  if (key === "companyPhone") setField(key, formatPhone(raw));
                  else if (key === "businessRegistrationNumber") setField(key, formatBizNo(raw));
                  else setField(key as "companyName", raw);
                };
                const strPlaceholder = key === "companyPhone" ? "010-1234-5678"
                  : key === "businessRegistrationNumber" ? "123-45-67890"
                  : key === "bankAccount" ? "신한 110-123-456789 (예금주)"
                  : "";

                if (isStr) {
                  return (
                    <div key={key} className="px-5 py-3">
                      <Label className="text-sm text-muted-foreground mb-1.5 block">{label}</Label>
                      <Input
                        type="text"
                        inputMode={key === "companyPhone" || key === "businessRegistrationNumber" ? "numeric" : "text"}
                        value={displayVal}
                        placeholder={strPlaceholder}
                        onChange={(e) => onStrChange(e.target.value)}
                        className="h-11 w-full font-medium text-foreground border-border/60 rounded-xl"
                      />
                    </div>
                  );
                }

                return (
                  <div key={key} className="px-5 py-3 flex items-center gap-3">
                    <Label className="flex-1 text-sm text-muted-foreground">{label}</Label>
                    <div className="relative w-36 shrink-0">
                      <Input
                        type="number"
                        step={step}
                        inputMode="numeric"
                        value={displayVal}
                        onChange={(e) => {
                          if (pct) {
                            setField(key as "accessoryRate", parseFloat(e.target.value) / 100 || 0);
                          } else if (step && step < 1) {
                            // Float field (e.g. parapetMultiplier)
                            setField(key as "parapetMultiplier", parseFloat(e.target.value) || 0);
                          } else {
                            setField(key as "materialPricePerSqm", parseInt(e.target.value) || 0);
                          }
                        }}
                        className="h-11 text-right pr-8 font-semibold text-foreground tabular-nums border-border/60 rounded-xl"
                      />
                      {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">{unit}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
          {/* 회사 정보 직속 — 직인 + 견적서 안내 문구 */}
          {section === "회사 정보" && (
            <SealAndNoticeCard
              sealImageUrl={values.sealImageUrl}
              onSealChange={(url) => setField("sealImageUrl", url)}
              noticeText={values.noticeText}
              onNoticeChange={(t) => setField("noticeText", t)}
            />
          )}

          {/* 스틸방수 섹션 직전 — 절곡 / 소모품 / 단열재 카드 */}
          {section === "스틸방수 단가" && (
            <BendingPricingCard
              values={values}
              onChange={(key, v) => setField(key as keyof typeof DEFAULTS, v as never)}
            />
          )}
          {section === "스틸방수 단가" && (
            <ConsumablesPricingCard
              values={values}
              onChange={(key, v) => setField(key as keyof typeof DEFAULTS, v as never)}
            />
          )}
          {section === "스틸방수 단가" && (
            <InsulationPricingCard
              values={values}
              unitAreas={insulationUnitAreas}
              onPriceChange={(key, v) => setField(key as keyof typeof DEFAULTS, v as never)}
              onAreaChange={setInsArea}
            />
          )}

          {/* 기본 마진율 바로 아래 — 마진 분배 비율 */}
          {section === "마진" && (
            <MarginDistributionCard
              material={values.marginMaterialRatio}
              labor={values.marginLaborRatio}
              profit={values.marginProfitRatio}
              onChange={(field, val) => {
                if (field === "material") setField("marginMaterialRatio", val);
                else if (field === "labor") setField("marginLaborRatio", val);
                else setField("marginProfitRatio", val);
              }}
            />
          )}

          {/* 견적 기본값 아래 — 정책 토글 (VAT / 로스율 적용·방식 / 기본 하지) */}
          {section === "견적 기본값" && (
            <div className="bg-card rounded-2xl border border-border/60 p-5 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={values.vatIncludedByDefault}
                  onCheckedChange={(c) => setField("vatIncludedByDefault", c === true)}
                  className="w-5 h-5"
                />
                <span className="flex-1">
                  <span className="block font-medium text-foreground text-sm">VAT 포함을 기본값으로</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">새 견적의 부가세 표시 방식</span>
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={values.useLossRateByDefault}
                  onCheckedChange={(c) => setField("useLossRateByDefault", c === true)}
                  className="w-5 h-5"
                />
                <span className="flex-1">
                  <span className="block font-medium text-foreground text-sm">자재 로스율을 기본 적용</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">새 견적 만들 때 로스율 토글이 켜진 상태로 시작</span>
                </span>
              </label>
              {/* 로스율 적용 모드 — 자동(지붕형태별) vs 수동(디폴트값) */}
              <div className="pt-2 border-t border-border/40">
                <div className="font-medium text-foreground text-sm mb-2">로스율 적용 방식</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "auto", label: "지붕 형태별 자동", desc: "박공 7% · 모임 12% · 멘사드 18% 등" },
                    { value: "manual", label: "디폴트 항상 적용", desc: `위 ${Math.round(values.defaultLossRate * 100)}% 사용` },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setField("lossRateMode", opt.value as "auto" | "manual")}
                      className={`pressable rounded-xl py-2.5 px-3 text-left border ${
                        values.lossRateMode === opt.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border/60 bg-card text-foreground"
                      }`}
                    >
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  자동 모드 + 지붕 형태 미선택 시엔 디폴트 로스율 사용
                </p>
              </div>
              <div className="pt-2 border-t border-border/40">
                <div className="font-medium text-foreground text-sm mb-2">기본 하지 자재</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "wood", label: "목재" },
                    { value: "steel", label: "철재" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setField("substructureMode", opt.value)}
                      className={`pressable rounded-xl py-2.5 text-sm font-semibold border ${
                        values.substructureMode === opt.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border/60 bg-card text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">새 견적 만들 때 지붕/옥상지붕 공사의 하지 기본값</p>
              </div>
            </div>
          )}
          </Fragment>
          );
        })}
      </div>

      <div className="pb-44" />

      {/* Sticky save bar — sits above the BottomNav.
          평소: [저장 · 활성 갱신] + [다른 이름으로]. 이름 입력 중: [이름][저장][취소]. */}
      <div className="fixed bottom-28 left-0 right-0 z-30 safe-x pointer-events-none">
        <div className="max-w-lg mx-auto px-4 pointer-events-auto">
          {naming ? (
            <div className="bg-card/95 backdrop-blur rounded-2xl border border-border/60 shadow-lg p-2.5 space-y-2">
              <p className="text-[11px] text-muted-foreground px-1">
                {naming === "first" ? "이 단가표를 프리셋으로 저장 (선택)" : "새 프리셋 이름"}
              </p>
              <div className="flex gap-2">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="예: 표준, 겨울 비수기"
                  className="h-12 rounded-xl text-sm flex-1"
                  autoFocus
                />
                <Button onClick={confirmPresetName} disabled={saving} className="h-12 rounded-xl text-sm px-4 font-semibold">저장</Button>
                <Button variant="outline" onClick={() => { setNaming(null); setNameInput(""); }} className="h-12 rounded-xl text-sm px-3">{naming === "first" ? "나중에" : "취소"}</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-14 text-base font-semibold rounded-2xl shadow-lg shadow-primary/25 pressable"
              >
                {saving ? "저장 중..." : <><Check size={20} className="mr-1.5" />{activeName ? `저장 · '${activeName}' 갱신` : "저장"}</>}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setNaming("saveAs"); setNameInput(""); setPickerOpen(false); }}
                disabled={saving}
                className="h-14 px-4 text-sm font-semibold rounded-2xl bg-card shadow-lg pressable"
              >
                다른 이름으로
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * 강판 자재별 단가 카드 — 자재마다 [유효폭 mm] + [m당 단가] 입력하면
 * ㎡당 환산가를 자동 표시 (천보 단가표는 m당 → 시공은 ㎡ 이라서).
 * 유효폭/m당 단가 모두 사용자가 직접 조정 가능. 환산 = convertMPriceToSqmPrice.
 */
function SteelSheetPricingCard({
  values, widths, peFoam, onPriceChange, onWidthChange, onPeFoamChange,
}: {
  values: Record<string, number | string | boolean>;
  widths: Record<string, number>;
  peFoam: number;
  onPriceChange: (key: string, v: number) => void;
  onWidthChange: (type: string, mm: number) => void;
  onPeFoamChange: (v: number) => void;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span className="text-lg">🪟</span>
        <h2 className="font-semibold text-foreground">강판 자재별 단가</h2>
      </div>
      <p className="px-5 pb-2 text-[11px] text-muted-foreground">
        유효폭 + m당 단가 입력 → ㎡당 환산가 자동 계산 (시공은 ㎡ 기준)
      </p>
      <div className="divide-y divide-border/40">
        {STEEL_PRICE_KEYS.map(({ type, label, key }) => {
          const pricePerM = Number(values[key] ?? 0);
          const widthMm = widths[type] ?? MATERIAL_EFFECTIVE_WIDTH_MM[type] ?? 700;
          const sqm = pricePerM > 0 ? convertMPriceToSqmPrice(pricePerM, type, widths) : 0;
          return (
            <div key={type} className="px-5 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <span className="text-[11px] font-semibold text-primary tabular-nums">
                  {sqm > 0 ? `→ ㎡당 ${sqm.toLocaleString("ko-KR")}원` : "단가 입력 필요"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* 유효폭 */}
                <div className="relative flex-1">
                  <Input
                    type="number" inputMode="numeric"
                    value={String(widthMm)}
                    onChange={(e) => onWidthChange(type, parseInt(e.target.value) || 0)}
                    className="h-11 text-right pr-9 tabular-nums rounded-xl"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">mm</span>
                </div>
                {/* m당 단가 */}
                <div className="relative flex-1">
                  <Input
                    type="number" inputMode="numeric"
                    value={String(pricePerM)}
                    onChange={(e) => onPriceChange(key, parseInt(e.target.value) || 0)}
                    className="h-11 text-right pr-9 font-semibold tabular-nums rounded-xl"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">원/m</span>
                </div>
              </div>
            </div>
          );
        })}
        {/* PE폼 부착 추가비용 — 강판 옵션이라 여기로 (㎡당, 강판 면적에 가산) */}
        <div className="px-5 py-3 flex items-center gap-3 bg-muted/20">
          <Label className="flex-1 text-sm text-muted-foreground">PE폼 부착 추가 (㎡당)</Label>
          <div className="relative w-36 shrink-0">
            <Input
              type="number" inputMode="numeric"
              value={String(peFoam)}
              onChange={(e) => onPeFoamChange(parseInt(e.target.value) || 0)}
              className="h-11 text-right pr-8 font-semibold tabular-nums rounded-xl"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">원</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 부자재 규격 단가 카드 — 용마루/물받이처럼 규격(3m/5m) 기성품.
 * [규격 길이 mm] + [규격당 가격] 입력 → "m당 X원" 환산 표시.
 * priceKey 에는 m당 단가로 저장 (자동 추정 로직 호환). 길이는 accessoryLengths JSON.
 * (실제 견적 시 규격 단위 올림 — 10m면 3m×4개 — 은 Phase 3 엔진에서.)
 */
function AccessoryPricingCard({
  values, lengths, onPriceChange, onLenChange,
}: {
  values: Record<string, number | string | boolean>;
  lengths: Record<string, number>;
  onPriceChange: (key: string, perM: number) => void;
  onLenChange: (lenKey: string, mm: number) => void;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span className="text-lg">🧱</span>
        <h2 className="font-semibold text-foreground">부자재 단가</h2>
      </div>
      <p className="px-5 pb-2 text-[11px] text-muted-foreground">
        규격 자재(용마루 3m·물받이 5m)는 규격당 가격 입력 → m당 환산. 처마·엔드캡은 단순 단가.
      </p>
      <div className="divide-y divide-border/40">
        {/* 규격 기성품 — 규격 + 규격당 가격 → m당 환산 */}
        {ACCESSORY_SPEC_KEYS.map(({ lenKey, priceKey, label, defaultLenMm }) => {
          const lenMm = lengths[lenKey] ?? defaultLenMm;
          const perM = Number(values[priceKey] ?? 0);
          const lenM = lenMm / 1000;
          const pricePerSpec = lenM > 0 ? Math.round(perM * lenM) : 0;
          return (
            <div key={lenKey} className="px-5 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <span className="text-[11px] font-semibold text-primary tabular-nums">
                  {perM > 0 ? `→ m당 ${perM.toLocaleString("ko-KR")}원` : "단가 입력 필요"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="number" inputMode="numeric"
                    value={String(lenMm)}
                    onChange={(e) => onLenChange(lenKey, parseInt(e.target.value) || 0)}
                    className="h-11 text-right pr-9 tabular-nums rounded-xl"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">mm</span>
                </div>
                <div className="relative flex-1">
                  <Input
                    type="number" inputMode="numeric"
                    value={String(pricePerSpec)}
                    onChange={(e) => {
                      const spec = parseInt(e.target.value) || 0;
                      onPriceChange(priceKey, lenM > 0 ? Math.round(spec / lenM) : 0);
                    }}
                    className="h-11 text-right pr-9 font-semibold tabular-nums rounded-xl"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">원/개</span>
                </div>
              </div>
            </div>
          );
        })}
        {/* 규격 없는 단순 단가 — 처마(m당)/엔드캡(개당) */}
        {ACCESSORY_FLAT_KEYS.map(({ priceKey, label, unit }) => (
          <div key={priceKey} className="px-5 py-3 flex items-center gap-3">
            <Label className="flex-1 text-sm text-muted-foreground">{label}</Label>
            <div className="relative w-36 shrink-0">
              <Input
                type="number" inputMode="numeric"
                value={String(Number(values[priceKey] ?? 0))}
                onChange={(e) => onPriceChange(priceKey, parseInt(e.target.value) || 0)}
                className="h-11 text-right pr-12 font-semibold tabular-nums rounded-xl"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">{unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 하지 단가 카드 — 개당 매입단가 × 개/㎡ 계수 → ㎡당 환산 표시.
 * 옛 "㎡당 한 덩어리" 대신, 사장님이 아는 두 숫자(개당 가격 + 격자 기준 개수)로 쪼갬.
 *   목재 40×50×3.6m 낙송 (30×60 격자 → 1.4개/㎡), 철재 아연각관 40×40×6m (30×80 → 0.76개/㎡).
 * 견적 결과도 "목재 X개" 발주 수량으로 떨어짐.
 */
function SubstructurePricingCard({
  values, onChange,
}: {
  values: Record<string, number | string | boolean>;
  onChange: (key: string, v: number) => void;
}) {
  const ROWS: { priceKey: string; coeffKey: string; label: string; spec: string }[] = [
    { priceKey: "substructureWoodPricePerPiece",  coeffKey: "substructureWoodPiecesPerSqm",  label: "목재 하지", spec: "40×50×3.6m 낙송" },
    { priceKey: "substructureSteelPricePerPiece", coeffKey: "substructureSteelPiecesPerSqm", label: "철재 하지", spec: "아연각관 40×40×6m" },
  ];
  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span className="text-lg">🪵</span>
        <h2 className="font-semibold text-foreground">하지 작업 단가</h2>
      </div>
      <p className="px-5 pb-2 text-[11px] text-muted-foreground">
        개당 매입단가 × ㎡당 개수(격자 기준) → ㎡당 환산. 견적엔 개수로 떨어짐.
      </p>
      <div className="divide-y divide-border/40">
        {ROWS.map(({ priceKey, coeffKey, label, spec }) => {
          const pricePerPiece = Number(values[priceKey] ?? 0);
          const piecesPerSqm = Number(values[coeffKey] ?? 0);
          const perSqm = Math.round(pricePerPiece * piecesPerSqm);
          const piecesPerPyeong = Math.round(piecesPerSqm * 3.3058 * 10) / 10;
          const perPyeong = Math.round(perSqm * 3.3058);
          return (
            <div key={priceKey} className="px-5 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground">{label} <span className="text-[10px] text-muted-foreground font-normal">{spec}</span></span>
                <span className="text-[11px] font-semibold text-primary tabular-nums">
                  {perSqm > 0 ? `평당 ${piecesPerPyeong}개 · ${perPyeong.toLocaleString("ko-KR")}원` : "값 입력 필요"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="number" inputMode="numeric"
                    value={String(pricePerPiece)}
                    onChange={(e) => onChange(priceKey, parseInt(e.target.value) || 0)}
                    className="h-11 text-right pr-12 font-semibold tabular-nums rounded-xl"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">원/개</span>
                </div>
                <span className="text-xs text-muted-foreground">×</span>
                <div className="relative flex-1">
                  <Input
                    type="number" inputMode="decimal" step={0.1}
                    value={String(piecesPerSqm)}
                    onChange={(e) => onChange(coeffKey, parseFloat(e.target.value) || 0)}
                    className="h-11 text-right pr-12 font-semibold tabular-nums rounded-xl"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">개/㎡</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 절곡 단가 카드 — 절곡 기준 단가(1mm·3m) + 부재별 넓이(mm)를 한 곳에.
 * 부재마다 3m당 = 넓이 × 기준단가 환산 표시. 강판 카드와 동일 패턴.
 */
function BendingPricingCard({
  values, onChange,
}: {
  values: Record<string, number | string | boolean>;
  onChange: (key: string, v: number) => void;
}) {
  const unit = Number(values.bendingPricePerMmPer3m ?? 0);
  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span className="text-lg">📐</span>
        <h2 className="font-semibold text-foreground">절곡 단가</h2>
      </div>
      <p className="px-5 pb-2 text-[11px] text-muted-foreground">
        기준 단가(1mm·3m) × 부재 넓이 → 3m당 절곡 가격 자동 표시
      </p>
      <div className="divide-y divide-border/40">
        {/* 기준 단가 행 */}
        <div className="px-5 py-3 flex items-center gap-3">
          <Label className="flex-1 text-sm text-muted-foreground">절곡 단가 (1mm × 3m 기준)</Label>
          <div className="relative w-36 shrink-0">
            <Input
              type="number" inputMode="numeric"
              value={String(unit)}
              onChange={(e) => onChange("bendingPricePerMmPer3m", parseInt(e.target.value) || 0)}
              className="h-11 text-right pr-8 font-semibold tabular-nums rounded-xl"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">원</span>
          </div>
        </div>
        {BENDING_PART_KEYS.map(({ key, label }) => {
          const widthMm = Number(values[key] ?? 0);
          const per3m = widthMm > 0 && unit > 0 ? widthMm * unit : 0;
          return (
            <div key={key} className="px-5 py-3">
              {/* 강판 카드와 동일 레이아웃 — 라벨 + 환산단가(우상단), 입력 아래 풀폭 */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <span className="text-[11px] font-semibold text-primary tabular-nums">
                  {per3m > 0 ? `→ 3m당 ${per3m.toLocaleString("ko-KR")}원` : "넓이 입력 필요"}
                </span>
              </div>
              <div className="relative">
                <Input
                  type="number" inputMode="numeric"
                  value={String(widthMm)}
                  onChange={(e) => onChange(key, parseInt(e.target.value) || 0)}
                  className="h-11 text-right pr-9 font-semibold tabular-nums rounded-xl"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">mm</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 소모품 단가 카드 — 스크류(봉지 환산) + 실리콘(낱개) 한 곳에.
 * 스크류: [봉지당 개수]+[봉지 가격] → "1개당 X원" 환산, priceKey 엔 1개당 저장.
 * 실리콘: 낱개 단가 직접.
 */
function ConsumablesPricingCard({
  values, onChange,
}: {
  values: Record<string, number | string | boolean>;
  onChange: (key: string, v: number) => void;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span className="text-lg">🔩</span>
        <h2 className="font-semibold text-foreground">소모품 단가</h2>
      </div>
      <p className="px-5 pb-2 text-[11px] text-muted-foreground">
        스크류는 봉지당 개수 + 봉지 가격 → 1개당 환산. 실리콘은 낱개 단가.
      </p>
      <div className="divide-y divide-border/40">
        <ScrewRow
          label="스크류 (대)"
          perPiece={Number(values.screwLargePrice ?? 0)}
          perBag={Number(values.screwLargePerBag ?? 0)}
          coeff={Number(values.screwLargePerSqm ?? 0)}
          coeffUnit="개/㎡"
          areaDriven
          onPerBagChange={(n) => onChange("screwLargePerBag", n)}
          onPerPieceChange={(p) => onChange("screwLargePrice", p)}
          onCoeffChange={(c) => onChange("screwLargePerSqm", c)}
        />
        <ScrewRow
          label="스크류 (소)"
          perPiece={Number(values.screwSmallPrice ?? 0)}
          perBag={Number(values.screwSmallPerBag ?? 0)}
          coeff={Number(values.screwSmallPerBendM ?? 0)}
          coeffUnit="개/m"
          onPerBagChange={(n) => onChange("screwSmallPerBag", n)}
          onPerPieceChange={(p) => onChange("screwSmallPrice", p)}
          onCoeffChange={(c) => onChange("screwSmallPerBendM", c)}
        />
        {/* 실리콘 — 낱개 단가 + 1개 커버 길이 */}
        <div className="px-5 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-foreground">실리콘</span>
            <span className="text-[11px] font-semibold text-primary tabular-nums">
              접합부 {Number(values.siliconeCoverageM ?? 6)}m당 1개
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type="number" inputMode="numeric"
                value={String(Number(values.siliconePrice ?? 0))}
                onChange={(e) => onChange("siliconePrice", parseInt(e.target.value) || 0)}
                className="h-11 text-right pr-12 font-semibold tabular-nums rounded-xl"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">원/개</span>
            </div>
            <span className="text-xs text-muted-foreground">/</span>
            <div className="relative flex-1">
              <Input
                type="number" inputMode="decimal" step={0.5}
                value={String(Number(values.siliconeCoverageM ?? 6))}
                onChange={(e) => onChange("siliconeCoverageM", parseFloat(e.target.value) || 0)}
                className="h-11 text-right pr-12 tabular-nums rounded-xl"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">m/개</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 스크류 한 행 — 봉지 가격 로컬 버퍼로 받아서(타이핑 중 재계산 간섭 X)
 * 1개당 = round(봉지가격 / 봉지개수) 저장. InsulationRow 와 동일 패턴.
 */
function ScrewRow({
  label, perPiece, perBag, coeff, coeffUnit, areaDriven, onPerBagChange, onPerPieceChange, onCoeffChange,
}: {
  label: string;
  perPiece: number;
  perBag: number;
  coeff: number;
  coeffUnit: string;
  areaDriven?: boolean;
  onPerBagChange: (n: number) => void;
  onPerPieceChange: (p: number) => void;
  onCoeffChange: (c: number) => void;
}) {
  const [bagBuf, setBagBuf] = useState(() => String(perBag > 0 ? Math.round(perPiece * perBag) : 0));
  const syncRef = useRef({ perBag, perPiece });
  useEffect(() => {
    if (syncRef.current.perBag !== perBag || syncRef.current.perPiece !== perPiece) {
      syncRef.current = { perBag, perPiece };
      setBagBuf(String(perBag > 0 ? Math.round(perPiece * perBag) : 0));
    }
  }, [perBag, perPiece]);

  function commitBagPrice(raw: string) {
    setBagBuf(raw);
    const bp = parseInt(raw) || 0;
    onPerPieceChange(perBag > 0 ? Math.round(bp / perBag) : 0);
  }
  function commitCount(raw: string) {
    const n = parseInt(raw) || 0;
    onPerBagChange(n);
    const bp = parseInt(bagBuf) || 0;
    onPerPieceChange(n > 0 ? Math.round(bp / n) : 0);
  }

  // 소비량 미리보기 — 면적 기반이면 평당 갯수, 길이 기반이면 단위당 그대로.
  const consumptionNote = coeff > 0
    ? (areaDriven
        ? `평당 ${(Math.round(coeff * 3.3058 * 10) / 10).toLocaleString("ko-KR")}개`
        : `절곡 m당 ${coeff.toLocaleString("ko-KR")}개`)
    : "";

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-[11px] font-semibold text-primary tabular-nums">
          {perPiece > 0 ? `1개당 ${perPiece.toLocaleString("ko-KR")}원` : "단가 입력 필요"}
          {consumptionNote && <span className="text-muted-foreground font-normal"> · {consumptionNote}</span>}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type="number" inputMode="numeric"
            value={String(perBag)}
            onChange={(e) => commitCount(e.target.value)}
            className="h-11 text-right pr-12 tabular-nums rounded-xl"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">개/봉</span>
        </div>
        <div className="relative flex-1">
          <Input
            type="number" inputMode="numeric"
            value={bagBuf}
            onChange={(e) => commitBagPrice(e.target.value)}
            className="h-11 text-right pr-12 font-semibold tabular-nums rounded-xl"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">원/봉</span>
        </div>
        <div className="relative flex-1">
          <Input
            type="number" inputMode="decimal" step={0.1}
            value={String(coeff)}
            onChange={(e) => onCoeffChange(parseFloat(e.target.value) || 0)}
            className="h-11 text-right pr-12 tabular-nums rounded-xl"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">{coeffUnit}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * 단열재 제품별 단가 카드 — [단위(롤/판) 면적 ㎡] + [단위 가격] → "㎡당 X원" 환산.
 * 단위면적 미입력(0)이면 환산 없이 ㎡당 직접 입력. priceKey 엔 ㎡당 저장 (로직 호환).
 */
function InsulationPricingCard({
  values, unitAreas, onPriceChange, onAreaChange,
}: {
  values: Record<string, number | string | boolean>;
  unitAreas: Record<string, number>;
  onPriceChange: (key: string, perSqm: number) => void;
  onAreaChange: (typeKey: string, area: number) => void;
}) {
  // 판재(EPS/XPS/PIR)는 장 단위(보통 0.72㎡=600×1200), 열반사는 롤(보통 36㎡=1.2×30).
  const ROWS = [
    { typeKey: "eps",            priceKey: "insulationPriceEps",            label: "스티로폼 (EPS)",    unitLabel: "장", defaultArea: 0.72 },
    { typeKey: "xps",            priceKey: "insulationPriceXps",            label: "아이소핑크 (XPS)",  unitLabel: "장", defaultArea: 0.72 },
    { typeKey: "pir",            priceKey: "insulationPricePir",            label: "경질우레탄폼 (PIR)", unitLabel: "장", defaultArea: 0.72 },
    { typeKey: "thermalReflect", priceKey: "insulationPriceThermalReflect", label: "열반사단열재",      unitLabel: "롤", defaultArea: 36 },
  ];
  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span className="text-lg">🧊</span>
        <h2 className="font-semibold text-foreground">단열재 단가</h2>
      </div>
      <p className="px-5 pb-2 text-[11px] text-muted-foreground">
        판/롤 면적(㎡) + 장/롤당 가격 입력 → ㎡당 단가 자동 환산. 면적 0이면 ㎡당 직접 입력.
      </p>
      <div className="divide-y divide-border/40">
        {ROWS.map((row) => (
          <InsulationRow
            key={row.typeKey}
            label={row.label}
            unitLabel={row.unitLabel}
            perSqm={Number(values[row.priceKey] ?? 0)}
            area={unitAreas[row.typeKey] ?? 0}
            onAreaChange={(a) => onAreaChange(row.typeKey, a)}
            onPerSqmChange={(p) => onPriceChange(row.priceKey, p)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 단열재 한 행 — 롤/개당 가격을 로컬 버퍼로 받아서(타이핑 중 재계산 간섭 X)
 * ㎡당 = round(롤가격 / 면적) 으로 저장. 면적 바뀌면 현재 롤가격 유지하며 ㎡당 재계산.
 * 면적 0이면 가격 입력칸이 곧 ㎡당 (환산 없음).
 */
function InsulationRow({
  label, unitLabel, perSqm, area, onAreaChange, onPerSqmChange,
}: {
  label: string;
  unitLabel: string;  // "장" | "롤"
  perSqm: number;
  area: number;
  onAreaChange: (area: number) => void;
  onPerSqmChange: (perSqm: number) => void;
}) {
  // 가격 입력 버퍼 — 면적>0이면 "롤/개당", 면적 0이면 "㎡당". 저장값에서 역산한 초기값.
  const [priceBuf, setPriceBuf] = useState(() =>
    area > 0 ? String(Math.round(perSqm * area)) : String(perSqm)
  );
  // 면적이나 저장 ㎡당이 바뀌면 버퍼 재동기화 (다른 곳에서 값 변경 시).
  const syncRef = useRef({ area, perSqm });
  useEffect(() => {
    if (syncRef.current.area !== area || syncRef.current.perSqm !== perSqm) {
      syncRef.current = { area, perSqm };
      setPriceBuf(area > 0 ? String(Math.round(perSqm * area)) : String(perSqm));
    }
  }, [area, perSqm]);

  function commitPrice(raw: string) {
    setPriceBuf(raw);
    const v = parseInt(raw) || 0;
    onPerSqmChange(area > 0 ? Math.round(v / area) : v);
  }
  function commitArea(raw: string) {
    const a = parseFloat(raw) || 0;
    onAreaChange(a);
    // 면적 바뀌면 현재 가격 버퍼(롤가격) 기준으로 ㎡당 재계산.
    const v = parseInt(priceBuf) || 0;
    onPerSqmChange(a > 0 ? Math.round(v / a) : v);
  }

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-[11px] font-semibold text-primary tabular-nums">
          {perSqm > 0 ? `→ ㎡당 ${perSqm.toLocaleString("ko-KR")}원` : "단가 입력 필요"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {/* 단위 면적 ㎡ (롤/판 1개) */}
        <div className="relative flex-1">
          <Input
            type="number" inputMode="decimal" step={0.01}
            value={String(area)}
            onChange={(e) => commitArea(e.target.value)}
            className="h-11 text-right pr-10 tabular-nums rounded-xl"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">㎡/{unitLabel}</span>
        </div>
        {/* 장/롤당 가격 (면적 0이면 ㎡당 직접) */}
        <div className="relative flex-1">
          <Input
            type="number" inputMode="numeric"
            value={priceBuf}
            onChange={(e) => commitPrice(e.target.value)}
            className="h-11 text-right pr-12 font-semibold tabular-nums rounded-xl"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">{area > 0 ? `원/${unitLabel}` : "원/㎡"}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * 직인 이미지 업로드 + 견적서 안내 문구 카드.
 * 직인은 Supabase Storage 의 site-photos 버킷에 올라감 (PDF에 embedded).
 * 안내 문구는 줄바꿈으로 구분된 자유 텍스트; PDF에서 번호 매김.
 */
function SealAndNoticeCard({
  sealImageUrl, onSealChange, noticeText, onNoticeChange,
}: {
  sealImageUrl: string;
  onSealChange: (url: string) => void;
  noticeText: string;
  onNoticeChange: (t: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      onSealChange(url);
      toast.success("직인 이미지가 업로드되었습니다");
    } catch {
      toast.error("업로드에 실패했습니다");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span className="text-lg">📜</span>
        <h2 className="font-semibold text-foreground">견적서 디테일</h2>
      </div>
      <div className="divide-y divide-border/40">
        {/* Seal upload */}
        <div className="px-5 py-3">
          <Label className="text-sm text-muted-foreground mb-2 block">직인 이미지</Label>
          <div className="flex items-center gap-3">
            {sealImageUrl ? (
              <div className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sealImageUrl} alt="직인" className="w-16 h-16 rounded-full object-cover border border-border" />
                <button
                  type="button"
                  onClick={() => onSealChange("")}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-black/80 text-white rounded-full flex items-center justify-center pressable"
                  aria-label="제거"
                >
                  <X size={13} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-border flex items-center justify-center text-xs text-muted-foreground shrink-0">
                (직인)
              </div>
            )}
            <div className="flex-1">
              <label className="inline-flex items-center gap-1.5 px-3 h-10 rounded-xl bg-primary/10 text-primary text-xs font-semibold cursor-pointer pressable">
                <Upload size={14} />
                {uploading ? "업로드 중..." : sealImageUrl ? "다시 업로드" : "직인 이미지 업로드"}
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
              <p className="text-[10px] text-muted-foreground mt-1.5">PNG 권장. 배경 투명하면 더 깔끔하게 보임</p>
            </div>
          </div>
        </div>

        {/* Notice text */}
        <div className="px-5 py-3">
          <Label className="text-sm text-muted-foreground mb-2 block">안내 문구</Label>
          <Textarea
            value={noticeText}
            onChange={(e) => onNoticeChange(e.target.value)}
            rows={3}
            placeholder="견적서 하단 안내 문구. 줄바꿈으로 항목 구분."
            className="text-sm rounded-xl resize-none"
          />
          <p className="text-[10px] text-muted-foreground mt-1">PDF에 1, 2, ... 자동 번호 매겨짐</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 마진 분배 비율 카드 — 견적서 PDF 에서 마진을 자재/인건비/이윤으로 어떻게
 * 흩뿌릴지 정함. 세 값의 합이 1.0(100%) 이 되어야 자연스럽지만, 합이 100%
 * 가 아니어도 PDF 렌더 시점에 정규화되므로 안전함.
 *
 * UI: 세 입력 + 합계 표시 + 100% 가 아니면 부드러운 경고. "기본값으로
 * 되돌리기" 버튼으로 50/25/25 빠르게 복귀.
 */
function MarginDistributionCard({
  material,
  labor,
  profit,
  onChange,
}: {
  material: number;
  labor: number;
  profit: number;
  onChange: (field: "material" | "labor" | "profit", val: number) => void;
}) {
  const matPct = Math.round(material * 100);
  const labPct = Math.round(labor * 100);
  const proPct = Math.round(profit * 100);
  const sum = matPct + labPct + proPct;
  const isOk = sum === 100;

  function reset() {
    onChange("material", 0.5);
    onChange("labor", 0.25);
    onChange("profit", 0.25);
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span className="text-lg">📊</span>
        <h2 className="font-semibold text-foreground">마진 분배 비율</h2>
      </div>
      <p className="text-[11px] text-muted-foreground px-5 -mt-1 leading-relaxed">
        견적서 PDF 에서 마진을 어떻게 흩뿌릴지. 자재·인건비는 해당 항목에
        비례 분배되고, "이윤" 은 별도 라인으로 표시됩니다. 합이 100% 가
        되도록 조정해 주세요.
        <span className="block mt-1 text-muted-foreground/80">
          ※ 이윤은 상세 견적서에만 별도 표시되고, 간단 견적서에선 시공비에 포함됩니다.
        </span>
      </p>
      <div className="divide-y divide-border/40 mt-2">
        {(["material", "labor", "profit"] as const).map((field) => {
          const val = field === "material" ? matPct : field === "labor" ? labPct : proPct;
          const label = field === "material" ? "자재에 분배" : field === "labor" ? "인건비에 분배" : "이윤 (별도 라인)";
          return (
            <div key={field} className="px-5 py-3 flex items-center gap-3">
              <Label className="flex-1 text-sm text-muted-foreground">{label}</Label>
              <div className="relative w-28 shrink-0">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={String(val)}
                  onChange={(e) => onChange(field, (parseInt(e.target.value) || 0) / 100)}
                  className="h-11 text-right pr-8 font-semibold text-foreground tabular-nums border-border/60 rounded-xl"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">%</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className={`px-5 py-3 flex items-center justify-between text-xs ${isOk ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
        <span>
          합계 <b className="tabular-nums">{sum}%</b>
          {!isOk && <span className="ml-1">— 100% 가 아니면 비율대로 자동 정규화됨</span>}
        </span>
        <button
          type="button"
          onClick={reset}
          className="text-[11px] font-semibold text-primary pressable px-2"
        >
          기본값 (50/25/25)
        </button>
      </div>
    </div>
  );
}
