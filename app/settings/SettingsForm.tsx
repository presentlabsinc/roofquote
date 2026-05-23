"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Check } from "lucide-react";
import type { PricingSettings } from "@/app/generated/prisma/client";

const DEFAULTS = {
  companyName: "",
  companyPhone: "",
  companyAddress: "",
  materialPricePerSqm: 30000,
  accessoryRate: 0.15,
  ridgePricePerM: 25000,
  eavePricePerM: 20000,
  gutterPricePerM: 30000,
  removalPricePerSqm: 8000,
  wasteDisposalCost: 300000,
  dailyWage: 300000,
  defaultWorkerCount: 3,
  skyliftDailyCost: 500000,
  ladderTruckDailyCost: 300000,
  baseTransportCost: 250000,
  mealCostPerPersonMeal: 10000,
  lodgingCostPerPersonNight: 50000,
  defaultMarginRate: 0.25,
  vatIncludedByDefault: true,
};

type FieldDef = { key: keyof typeof DEFAULTS; label: string; unit?: string; step?: number; pct?: boolean };

const FIELDS: { section: string; emoji: string; items: FieldDef[] }[] = [
  {
    section: "회사 정보",
    emoji: "🏢",
    items: [
      { key: "companyName", label: "회사명" },
      { key: "companyPhone", label: "대표 연락처" },
      { key: "companyAddress", label: "회사 주소" },
    ],
  },
  {
    section: "자재 단가",
    emoji: "🧱",
    items: [
      { key: "materialPricePerSqm", label: "칼라강판 ㎡당", unit: "원" },
      { key: "accessoryRate", label: "부자재 비율", unit: "%", step: 0.01, pct: true },
      { key: "ridgePricePerM", label: "용마루 m당", unit: "원" },
      { key: "eavePricePerM", label: "처마 마감 m당", unit: "원" },
      { key: "gutterPricePerM", label: "물받이 m당", unit: "원" },
      { key: "removalPricePerSqm", label: "철거 ㎡당", unit: "원" },
      { key: "wasteDisposalCost", label: "폐기물 처리비", unit: "원" },
    ],
  },
  {
    section: "인건비",
    emoji: "👷",
    items: [
      { key: "dailyWage", label: "1인 1일", unit: "원" },
      { key: "defaultWorkerCount", label: "기본 작업 인원", unit: "명" },
    ],
  },
  {
    section: "장비비",
    emoji: "🏗️",
    items: [
      { key: "skyliftDailyCost", label: "스카이차 1일", unit: "원" },
      { key: "ladderTruckDailyCost", label: "사다리차 1일", unit: "원" },
    ],
  },
  {
    section: "운송·체류비",
    emoji: "🚚",
    items: [
      { key: "baseTransportCost", label: "기본 운송비", unit: "원" },
      { key: "mealCostPerPersonMeal", label: "1인 1식 식비", unit: "원" },
      { key: "lodgingCostPerPersonNight", label: "1인 1박 숙박비", unit: "원" },
    ],
  },
  {
    section: "마진 기본값",
    emoji: "💰",
    items: [
      { key: "defaultMarginRate", label: "기본 마진율", unit: "%", step: 0.01, pct: true },
    ],
  },
];

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
      materialPricePerSqm: defaultValues.materialPricePerSqm,
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
      baseTransportCost: defaultValues.baseTransportCost,
      mealCostPerPersonMeal: defaultValues.mealCostPerPersonMeal,
      lodgingCostPerPersonNight: defaultValues.lodgingCostPerPersonNight,
      defaultMarginRate: defaultValues.defaultMarginRate,
      vatIncludedByDefault: defaultValues.vatIncludedByDefault,
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
        {FIELDS.map(({ section, emoji, items }) => (
          <div key={section} className="bg-card rounded-2xl border border-border/60 overflow-hidden">
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <span className="text-lg">{emoji}</span>
              <h2 className="font-semibold text-foreground">{section}</h2>
            </div>
            <div className="divide-y divide-border/40">
              {items.map(({ key, label, unit, step, pct }) => {
                const rawVal = values[key];
                const isStr = key === "companyName" || key === "companyPhone" || key === "companyAddress";
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
        ))}

        {/* VAT toggle */}
        <div className="bg-card rounded-2xl border border-border/60 p-5">
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
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-24 left-0 right-0 z-30 safe-x pointer-events-none">
        <div className="max-w-lg mx-auto px-4 pointer-events-auto">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-14 text-base font-semibold rounded-2xl shadow-lg shadow-primary/25 pressable"
          >
            {saving ? "저장 중..." : <><Check size={20} className="mr-1.5" />단가 저장</>}
          </Button>
        </div>
      </div>
    </>
  );
}
