"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { PricingSettings } from "@/app/generated/prisma/client";
import type { ScopeFlags } from "@/lib/types";
import { pyeongToSqm, sqmToPyeong } from "@/lib/calculations";
import { StickySubmit } from "@/app/sites/new/NewSiteForm";
import { Ruler, ListChecks, Users, Calculator } from "lucide-react";

interface Props {
  siteId: string;
  settings: PricingSettings;
}

const DEFAULT_SCOPE: ScopeFlags = {
  colorSteel: true,
  overlay: false,
  removal: false,
  ridge: true,
  eave: true,
  gutter: false,
  waste: false,
  skylift: false,
  ladderTruck: false,
};

const SCOPE_ITEMS: { key: keyof ScopeFlags; label: string; icon?: string }[] = [
  { key: "colorSteel", label: "칼라강판 시공", icon: "🔩" },
  { key: "overlay", label: "기존 지붕 덧씌우기", icon: "📋" },
  { key: "removal", label: "기존 지붕 철거", icon: "🛠️" },
  { key: "ridge", label: "용마루 마감", icon: "📐" },
  { key: "eave", label: "처마 마감", icon: "✂️" },
  { key: "waste", label: "폐기물 처리", icon: "🗑️" },
];

export function NewEstimateForm({ siteId, settings }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [sqmInput, setSqmInput] = useState("");
  const [pyeongInput, setPyeongInput] = useState("");

  const [scope, setScope] = useState<ScopeFlags>(DEFAULT_SCOPE);
  const [workerCount, setWorkerCount] = useState(String(settings.defaultWorkerCount));
  const [workDays, setWorkDays] = useState("2");
  const [gutterLength, setGutterLength] = useState("");
  const [skyliftDays, setSkyliftDays] = useState("1");
  const [ladderTruckDays, setLadderTruckDays] = useState("1");

  function toggleScope(key: keyof ScopeFlags) {
    setScope((s) => ({ ...s, [key]: !s[key] }));
  }

  function handleSqmChange(val: string) {
    setSqmInput(val);
    const n = parseFloat(val);
    setPyeongInput(Number.isFinite(n) && n > 0 ? String(sqmToPyeong(n)) : "");
  }

  function handlePyeongChange(val: string) {
    setPyeongInput(val);
    const n = parseFloat(val);
    setSqmInput(Number.isFinite(n) && n > 0 ? String(pyeongToSqm(n)) : "");
  }

  async function handleCreate() {
    const areaM2 = parseFloat(sqmInput) || 0;
    if (areaM2 <= 0) { toast.error("면적을 입력해 주세요"); return; }
    if (scope.gutter && !gutterLength) { toast.error("물받이 길이를 입력해 주세요"); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/estimates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaM2,
          workerCount: parseInt(workerCount) || settings.defaultWorkerCount,
          workDays: parseFloat(workDays) || 2,
          gutterLengthM: scope.gutter ? parseFloat(gutterLength) || 0 : 0,
          skyliftDays: scope.skylift ? parseFloat(skyliftDays) || 1 : 0,
          ladderTruckDays: scope.ladderTruck ? parseFloat(ladderTruckDays) || 1 : 0,
          scopeFlags: scope,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "실패");
      }
      const est = await res.json();
      toast.success("견적이 생성되었습니다");
      router.push(`/sites/${siteId}/estimates/${est.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "견적 생성에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-3 pb-28">
        {/* Area — dual synced inputs */}
        <Section icon={<Ruler size={18} />} title="면적">
          <p className="text-[11px] text-muted-foreground -mt-1 mb-1">㎡ 또는 평 어느 쪽에 입력해도 자동 변환됩니다</p>
          <div className="grid grid-cols-2 gap-2.5">
            <UnitInput label="제곱미터" unit="㎡" value={sqmInput} onChange={handleSqmChange} />
            <UnitInput label="평" unit="평" value={pyeongInput} onChange={handlePyeongChange} />
          </div>
        </Section>

        {/* Scope */}
        <Section icon={<ListChecks size={18} />} title="공사 범위">
          <div className="grid grid-cols-2 gap-2">
            {SCOPE_ITEMS.map(({ key, label, icon }) => (
              <ScopeChip
                key={key}
                active={scope[key]}
                onClick={() => toggleScope(key)}
                icon={icon}
                label={label}
              />
            ))}
          </div>

          <div className="space-y-2 mt-3 pt-3 border-t border-border/40">
            <ScopeWithInput
              active={scope.gutter}
              onToggle={() => toggleScope("gutter")}
              label="물받이 교체"
              icon="💧"
              inputValue={gutterLength}
              onInputChange={setGutterLength}
              unit="m"
            />
            <ScopeWithInput
              active={scope.skylift}
              onToggle={() => toggleScope("skylift")}
              label="스카이차 사용"
              icon="🏗️"
              inputValue={skyliftDays}
              onInputChange={setSkyliftDays}
              unit="일"
            />
            <ScopeWithInput
              active={scope.ladderTruck}
              onToggle={() => toggleScope("ladderTruck")}
              label="사다리차 사용"
              icon="🚛"
              inputValue={ladderTruckDays}
              onInputChange={setLadderTruckDays}
              unit="일"
            />
          </div>
        </Section>

        {/* Work details */}
        <Section icon={<Users size={18} />} title="작업 정보">
          <div className="grid grid-cols-2 gap-2.5">
            <UnitInput label="작업 일수" unit="일" value={workDays} onChange={setWorkDays} />
            <UnitInput label="작업 인원" unit="명" value={workerCount} onChange={setWorkerCount} />
          </div>
        </Section>

        {/* Hint */}
        <div className="bg-primary/5 border border-primary/15 rounded-2xl p-4 flex items-start gap-2.5">
          <Calculator size={16} className="text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-primary leading-relaxed">
            계산하면 원가·마진을 즉시 확인하고 항목별 금액과 마진율을 자유롭게 조정할 수 있습니다
          </p>
        </div>
      </div>

      <StickySubmit
        onClick={handleCreate}
        disabled={saving}
        label={saving ? "계산 중..." : "견적 계산하기"}
      />
    </>
  );
}

function Section({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-primary">{icon}</span>}
        <h2 className="font-semibold text-foreground text-sm">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function UnitInput({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="h-14 text-xl font-bold text-center pr-10 rounded-2xl tabular-nums"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">{unit}</span>
      </div>
    </div>
  );
}

function ScopeChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon?: string; label: string }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`pressable rounded-2xl px-3 py-3 text-left flex items-center gap-2 border ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
          : "bg-card text-foreground border-border/60"
      }`}
    >
      {icon && <span className="text-base">{icon}</span>}
      <span className="text-sm font-medium leading-tight">{label}</span>
    </button>
  );
}

function ScopeWithInput({
  active, onToggle, label, icon, inputValue, onInputChange, unit,
}: {
  active: boolean; onToggle: () => void; label: string; icon?: string;
  inputValue: string; onInputChange: (v: string) => void; unit: string;
}) {
  return (
    <div className={`rounded-2xl border ${active ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card"} overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 pressable"
      >
        <div className="flex items-center gap-2.5">
          <Checkbox checked={active} className="w-5 h-5 pointer-events-none" />
          {icon && <span className="text-base">{icon}</span>}
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
      </button>
      {active && (
        <div className="px-3 pb-3 pt-1 flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="0"
            className="h-11 rounded-xl tabular-nums flex-1"
          />
          <span className="text-sm text-muted-foreground font-medium w-6">{unit}</span>
        </div>
      )}
    </div>
  );
}
