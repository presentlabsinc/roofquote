"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Check, Upload, X } from "lucide-react";
import type { PricingSettings } from "@prisma/client";

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
  ridgePricePerM: 25000,
  eavePricePerM: 20000,
  gutterPricePerM: 5000,
  removalPricePerSqm: 8000,
  wasteDisposalCost: 300000,
  dailyWage: 300000,
  defaultWorkerCount: 3,
  skyliftDailyCost: 500000,
  ladderTruckDailyCost: 300000,
  scaffoldDailyCost: 150000,
  scaffoldPricePerSqmDay: 3000,
  substructureMode: "wood",
  substructureWoodPricePerSqm: 30000,
  substructureSteelPricePerSqm: 40000,
  drainHolePrice: 200000,
  capBendingPricePerM: 5000,
  endCapPrice: 3500,
  stainlessDrainPricePerM: 50000,
  peFoamPricePerSqm: 1000,
  downspoutUnitPrice: 50000,
  parapetMultiplier: 1.4,
  defaultLossRate: 0.15,
  estimateNumberStart: 1,
  marginMaterialRatio: 0.5,
  marginLaborRatio: 0.25,
  marginProfitRatio: 0.25,
  useLossRateByDefault: false,
  baseTransportCost: 250000,
  mealCostPerPersonMeal: 10000,
  lodgingCostPerPersonNight: 50000,
  defaultMarginRate: 0.25,
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
  // ── 소모품 ──
  screwLargePrice: 300,
  screwSmallPrice: 100,
  siliconePrice: 5000,
  insulationPricePerSqm: 15000,
};

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
  {
    section: "자재 단가",
    emoji: "🧱",
    tier: "price",
    items: [
      { key: "materialPricePerSqm", label: "칼라강판 ㎡당 (0.45t 기준)", unit: "원" },
      { key: "ridgePricePerM", label: "용마루 m당", unit: "원" },
      { key: "eavePricePerM", label: "처마 마감 m당", unit: "원" },
      { key: "gutterPricePerM", label: "물받이 m당", unit: "원" },
      { key: "endCapPrice", label: "엔드캡 (개당)", unit: "원" },
      { key: "peFoamPricePerSqm", label: "PE폼 부착 ㎡당", unit: "원" },
      { key: "removalPricePerSqm", label: "철거 ㎡당", unit: "원" },
      { key: "wasteDisposalCost", label: "폐기물 처리비 (트럭 1차당)", unit: "원" },
    ],
  },
  {
    section: "하지 작업 단가",
    emoji: "🪵",
    tier: "price",
    items: [
      { key: "substructureWoodPricePerSqm", label: "목재 하지 ㎡당", unit: "원" },
      { key: "substructureSteelPricePerSqm", label: "철재 하지 ㎡당", unit: "원" },
    ],
  },
  {
    section: "절곡 단가",
    emoji: "📏",
    tier: "price",
    items: [
      { key: "bendingPricePerMmPer3m", label: "절곡 단가 (1mm × 3m 기준)", unit: "원" },
      { key: "bendingWidthRidge", label: "용마루 기본 넓이", unit: "mm" },
      { key: "bendingWidthEave", label: "처마 기본 넓이", unit: "mm" },
      { key: "bendingWidthCap", label: "두겁 기본 넓이", unit: "mm" },
      { key: "bendingWidthMishi", label: "미시 기본 넓이", unit: "mm" },
      { key: "bendingWidthFlashing", label: "프래싱 기본 넓이", unit: "mm" },
      { key: "bendingWidthValley", label: "회침 기본 넓이", unit: "mm" },
      { key: "bendingWidthSnowGuard", label: "눈방지턱 기본 넓이", unit: "mm" },
    ],
  },
  {
    section: "소모품 단가",
    emoji: "🔩",
    tier: "price",
    items: [
      { key: "screwLargePrice", label: "스크류 (대) 개당", unit: "원" },
      { key: "screwSmallPrice", label: "스크류 (소) 개당", unit: "원" },
      { key: "siliconePrice", label: "실리콘 개당", unit: "원" },
      { key: "insulationPricePerSqm", label: "단열재 ㎡당", unit: "원" },
    ],
  },
  {
    section: "스틸방수 단가",
    emoji: "🟦",
    tier: "price",
    items: [
      { key: "stainlessDrainPricePerM", label: "스테인리스 배수로 m당", unit: "원" },
      { key: "downspoutUnitPrice", label: "홈통 (개당)", unit: "원" },
      { key: "drainHolePrice", label: "새 배수구 타공 (개당)", unit: "원" },
      { key: "capBendingPricePerM", label: "두겁 절곡 m당", unit: "원" },
    ],
  },
  {
    section: "노무·장비·운송 단가",
    emoji: "🚚",
    tier: "price",
    items: [
      { key: "dailyWage", label: "1인 1일 인건비", unit: "원" },
      { key: "skyliftDailyCost", label: "스카이차 1일", unit: "원" },
      { key: "ladderTruckDailyCost", label: "사다리차 1일", unit: "원" },
      { key: "scaffoldPricePerSqmDay", label: "비계 ㎡·일당", unit: "원" },
      { key: "baseTransportCost", label: "기본 운송비", unit: "원" },
      { key: "mealCostPerPersonMeal", label: "1인 1식 식비", unit: "원" },
      { key: "lodgingCostPerPersonNight", label: "1인 1박 숙박비", unit: "원" },
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
}

export function SettingsForm({ defaultValues }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
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
      screwLargePrice: defaultValues.screwLargePrice ?? 300,
      screwSmallPrice: defaultValues.screwSmallPrice ?? 100,
      siliconePrice: defaultValues.siliconePrice ?? 5000,
      insulationPricePerSqm: defaultValues.insulationPricePerSqm ?? 15000,
      lossRateMode: (((defaultValues as unknown as { lossRateMode?: string }).lossRateMode === "manual") ? "manual" : "auto") as "auto" | "manual",
      downspoutUnitPrice: (defaultValues as unknown as { downspoutUnitPrice?: number }).downspoutUnitPrice ?? 50000,
    };
  });

  function setField<K extends keyof typeof DEFAULTS>(key: K, val: (typeof DEFAULTS)[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  async function handleSave() {
    if (!values.companyName.trim()) {
      toast.error("회사명을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...values,
        companyPhone: values.companyPhone || null,
        companyAddress: values.companyAddress || null,
        businessRegistrationNumber: values.businessRegistrationNumber || null,
        sealImageUrl: values.sealImageUrl || null,
        bankAccount: values.bankAccount || null,
        noticeText: values.noticeText || null,
      };
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("저장 실패");
      toast.success("저장되었습니다");
      router.refresh();
    } catch {
      toast.error("저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
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
          <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <span className="text-lg">{emoji}</span>
              <h2 className="font-semibold text-foreground">{section}</h2>
            </div>
            {section === "자재 단가" && (
              <PriceCalculator
                onApply={(perSqm) => setField("materialPricePerSqm", perSqm)}
              />
            )}
            <div className="divide-y divide-border/40">
              {items.map(({ key, label, unit, step, pct }) => {
                const rawVal = values[key];
                const isStr = key === "companyName" || key === "companyPhone" || key === "companyAddress" || key === "businessRegistrationNumber" || key === "sealImageUrl" || key === "substructureMode" || key === "bankAccount" || key === "noticeText";
                const displayVal = isStr
                  ? String(rawVal)
                  : pct
                  ? String(Math.round((rawVal as number) * 100))
                  : String(rawVal);

                return (
                  <div key={key} className="px-5 py-3 flex items-center gap-3">
                    <Label className="flex-1 text-sm text-muted-foreground">{label}</Label>
                    <div className="relative w-36 shrink-0">
                      <Input
                        type={isStr ? "text" : "number"}
                        step={step}
                        inputMode={isStr ? "text" : "numeric"}
                        value={displayVal}
                        onChange={(e) => {
                          if (isStr) {
                            setField(key as "companyName", e.target.value);
                          } else if (pct) {
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
          {/* 회사 정보 직속 — 직인 + 견적서 안내 문구 */}
          {section === "회사 정보" && (
            <SealAndNoticeCard
              sealImageUrl={values.sealImageUrl}
              onSealChange={(url) => setField("sealImageUrl", url)}
              noticeText={values.noticeText}
              onNoticeChange={(t) => setField("noticeText", t)}
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

      {/* Sticky save bar — sits above the BottomNav */}
      <div className="fixed bottom-28 left-0 right-0 z-30 safe-x pointer-events-none">
        <div className="max-w-lg mx-auto px-4 pointer-events-auto">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-14 text-base font-semibold rounded-2xl shadow-lg shadow-primary/25 pressable"
          >
            {saving ? "저장 중..." : <><Check size={20} className="mr-1.5" />설정 저장</>}
          </Button>
        </div>
      </div>
    </>
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
 * Helper widget: convert (강판 너비 × m단가) → ㎡당 단가.
 * Different material models come in different widths (e.g. 슬레이트골 1.0m,
 * 징크250 0.75m, 기와형 0.7m). Suppliers usually quote per-meter, so this
 * lets the user input the supplier's number and auto-derive the ㎡ price.
 */
function PriceCalculator({ onApply }: { onApply: (perSqm: number) => void }) {
  // 기본값: 징크250 (너비 0.75m) × 9,000원/m — 가장 자주 쓰는 조합.
  // 다른 폭(슬레이트골 1.0m, 기와형 0.7m 등) 은 사용자가 너비만 바꾸면 됨.
  const [width, setWidth] = useState("0.75");
  const [perM, setPerM] = useState("9000");

  const w = parseFloat(width);
  const pm = parseFloat(perM);
  const perSqm = Number.isFinite(w) && Number.isFinite(pm) && w > 0
    ? Math.round(pm / w)
    : 0;

  return (
    <div className="bg-primary/5 border-t border-b border-primary/10 px-5 py-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-sm">📐</span>
        <span className="text-xs font-semibold text-primary">㎡당 단가 계산기</span>
      </div>
      {/* 1m × [너비] m = [m단가] 원  →  ㎡당 = m단가 / 너비 */}
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-sm font-semibold text-foreground tabular-nums whitespace-nowrap">1m ×</span>
        <div className="relative flex-1">
          <Input
            type="number" inputMode="decimal" step={0.05}
            value={width} onChange={(e) => setWidth(e.target.value)}
            placeholder="너비" className="h-10 pr-6 text-right text-sm tabular-nums rounded-lg"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">m</span>
        </div>
        <span className="text-sm font-semibold text-foreground px-0.5">=</span>
        <div className="relative flex-1">
          <Input
            type="number" inputMode="numeric"
            value={perM} onChange={(e) => setPerM(e.target.value)}
            placeholder="m단가" className="h-10 pr-6 text-right text-sm tabular-nums rounded-lg"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">원</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="text-xs text-muted-foreground">
          ㎡당 = <span className="font-bold text-foreground tabular-nums">{perSqm.toLocaleString("ko-KR")}원</span>
        </div>
        <button
          type="button"
          onClick={() => perSqm > 0 && onApply(perSqm)}
          disabled={perSqm <= 0}
          className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full pressable disabled:opacity-40"
        >
          이 값으로 설정
        </button>
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
