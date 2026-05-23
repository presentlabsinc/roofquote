"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { PricingSettings } from "@prisma/client";
import {
  type ConstructionType,
  type MaterialType,
  type ScopeFlags,
  type Thickness,
  CONSTRUCTION_TYPES,
  MATERIAL_TYPES,
  THICKNESSES,
  SCOPE_BY_TYPE,
  SCOPE_LABELS,
} from "@/lib/types";
import { pyeongToSqm, sqmToPyeong } from "@/lib/calculations";
import { StickySubmit } from "@/app/sites/new/NewSiteForm";
import { Ruler, ListChecks, Users, Hammer, Palette, Layers, Wrench, Building2 } from "lucide-react";

interface Props {
  siteId: string;
  settings: PricingSettings;
}

export function NewEstimateForm({ siteId, settings }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Step 1: Construction type
  const [constructionType, setConstructionType] = useState<ConstructionType | null>(null);

  // Step 2-4: Material
  const [materialType, setMaterialType] = useState<MaterialType>("slate");
  const [thickness, setThickness] = useState<Thickness>("0.45");
  const [materialColor, setMaterialColor] = useState("");

  // Area
  const [sqmInput, setSqmInput] = useState("");
  const [pyeongInput, setPyeongInput] = useState("");

  // Scope
  const [scope, setScope] = useState<ScopeFlags>({});

  // Lengths / days
  const [gutterLength, setGutterLength] = useState("");
  const [skyliftDays, setSkyliftDays] = useState("1");
  const [ladderTruckDays, setLadderTruckDays] = useState("1");
  const [scaffoldDays, setScaffoldDays] = useState("3");
  const [otherEquipment, setOtherEquipment] = useState("");

  // Work info
  const [workerCount, setWorkerCount] = useState(String(settings.defaultWorkerCount));
  const [workDays, setWorkDays] = useState("2");

  // When construction type changes, reset scope to sensible defaults for that type
  function pickConstructionType(t: ConstructionType) {
    setConstructionType(t);
    const defaults: ScopeFlags = {};
    if (t === "roof") {
      defaults.ridge = true;
      defaults.eave = true;
      defaults.waste = true;
    } else if (t === "rooftopRoof") {
      defaults.frameReinforcement = true;
      defaults.ridge = true;
      defaults.eave = true;
      defaults.waste = true;
    } else if (t === "steelWaterproof") {
      defaults.handrailAndCap = true;
      defaults.waste = true;
    }
    setScope(defaults);
  }

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

  const scopeItems = useMemo(
    () => (constructionType ? SCOPE_BY_TYPE[constructionType] : []),
    [constructionType],
  );

  const materialOptions = useMemo(() => {
    // Steel waterproof is usually 슬레이트골; show options but highlight default
    return MATERIAL_TYPES;
  }, []);

  async function handleCreate() {
    if (!constructionType) { toast.error("공사 유형을 선택해 주세요"); return; }
    const areaM2 = parseFloat(sqmInput) || 0;
    if (areaM2 <= 0) { toast.error("면적을 입력해 주세요"); return; }
    if (scope.gutter && !gutterLength) { toast.error("물받이 길이를 입력해 주세요"); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/estimates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          constructionType,
          materialType,
          materialThickness: thickness,
          materialColor: materialColor || null,
          areaM2,
          workerCount: parseInt(workerCount) || settings.defaultWorkerCount,
          workDays: parseFloat(workDays) || 2,
          gutterLengthM: scope.gutter ? parseFloat(gutterLength) || 0 : 0,
          skyliftDays: scope.skylift ? parseFloat(skyliftDays) || 1 : 0,
          ladderTruckDays: scope.ladderTruck ? parseFloat(ladderTruckDays) || 1 : 0,
          scaffoldDays: scope.scaffold ? parseFloat(scaffoldDays) || 1 : 0,
          otherEquipment: otherEquipment || null,
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

  const showMaterialSection = constructionType !== null;
  const showRestOfForm = constructionType !== null;

  return (
    <>
      <div className="space-y-3 pb-28">
        {/* STEP 1: Construction type */}
        <Section icon={<Building2 size={18} />} title="공사 유형" step={1}>
          <div className="space-y-2">
            {CONSTRUCTION_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => pickConstructionType(t.value)}
                className={`w-full text-left rounded-2xl px-4 py-3.5 border-2 pressable flex items-center gap-3 ${
                  constructionType === t.value
                    ? "border-primary bg-primary/5"
                    : "border-border/60 bg-card"
                }`}
              >
                <span className="text-2xl">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${constructionType === t.value ? "text-primary" : "text-foreground"}`}>
                    {t.label}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 shrink-0 ${
                  constructionType === t.value
                    ? "border-primary bg-primary"
                    : "border-border"
                }`}>
                  {constructionType === t.value && (
                    <div className="w-full h-full flex items-center justify-center text-white text-xs">✓</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* STEP 2-4: Material (depends on construction type) */}
        {showMaterialSection && (
          <>
            <Section icon={<Hammer size={18} />} title="자재 종류" step={2}>
              {constructionType === "steelWaterproof" && (
                <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                  바닥형은 보통 슬레이트골을 사용합니다
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {materialOptions.map((m) => (
                  <ChipBtn
                    key={m.value}
                    active={materialType === m.value}
                    onClick={() => setMaterialType(m.value)}
                    label={m.label}
                  />
                ))}
              </div>
            </Section>

            <Section icon={<Layers size={18} />} title="자재 두께" step={3}>
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">기본 0.45t</p>
              <div className="grid grid-cols-4 gap-2">
                {THICKNESSES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setThickness(t)}
                    className={`pressable rounded-xl py-3 text-sm font-bold border ${
                      thickness === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border/60"
                    }`}
                  >
                    {t}t
                  </button>
                ))}
              </div>
            </Section>

            <Section icon={<Palette size={18} />} title="색상 / 텍스처" step={4}>
              <Input
                value={materialColor}
                onChange={(e) => setMaterialColor(e.target.value)}
                placeholder="예: 차콜, 진회색, 적갈색"
                className="h-12 rounded-xl text-base"
              />
            </Section>
          </>
        )}

        {showRestOfForm && (
          <>
            {/* Area */}
            <Section icon={<Ruler size={18} />} title="면적" step={5}>
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">㎡ 또는 평 어디든 입력하면 자동 변환</p>
              <div className="grid grid-cols-2 gap-2.5">
                <UnitInput label="제곱미터" unit="㎡" value={sqmInput} onChange={handleSqmChange} />
                <UnitInput label="평" unit="평" value={pyeongInput} onChange={handlePyeongChange} />
              </div>
            </Section>

            {/* Scope */}
            <Section icon={<ListChecks size={18} />} title="공사 범위" step={6}>
              <div className="space-y-2">
                {scopeItems.map((key) => {
                  const isGutter = key === "gutter";
                  return (
                    <div key={key}>
                      <ScopeRow
                        active={!!scope[key]}
                        label={SCOPE_LABELS[key]}
                        onToggle={() => toggleScope(key)}
                      />
                      {isGutter && scope.gutter && (
                        <div className="mt-2 ml-3 flex items-center gap-2">
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={gutterLength}
                            onChange={(e) => setGutterLength(e.target.value)}
                            placeholder="0"
                            className="h-11 rounded-xl tabular-nums flex-1"
                          />
                          <span className="text-sm text-muted-foreground font-medium w-6">m</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* Equipment */}
            <Section icon={<Wrench size={18} />} title="장비대" step={7}>
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">사용하는 장비를 선택하고 사용 일수를 입력하세요</p>
              <div className="space-y-2">
                <EquipmentRow
                  active={!!scope.skylift}
                  label="스카이차"
                  onToggle={() => toggleScope("skylift")}
                  days={skyliftDays}
                  onDaysChange={setSkyliftDays}
                />
                <EquipmentRow
                  active={!!scope.ladderTruck}
                  label="사다리차"
                  onToggle={() => toggleScope("ladderTruck")}
                  days={ladderTruckDays}
                  onDaysChange={setLadderTruckDays}
                />
                <EquipmentRow
                  active={!!scope.scaffold}
                  label="비계 / 발판"
                  onToggle={() => toggleScope("scaffold")}
                  days={scaffoldDays}
                  onDaysChange={setScaffoldDays}
                />
                <div className="pt-2">
                  <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">기타 장비 (자유 입력)</Label>
                  <Input
                    value={otherEquipment}
                    onChange={(e) => setOtherEquipment(e.target.value)}
                    placeholder="예: 크레인 1일, 지게차 2일"
                    className="h-11 rounded-xl text-sm"
                  />
                </div>
              </div>
            </Section>

            {/* Work info */}
            <Section icon={<Users size={18} />} title="작업 정보" step={8}>
              <div className="grid grid-cols-2 gap-2.5">
                <UnitInput label="작업 일수" unit="일" value={workDays} onChange={setWorkDays} />
                <UnitInput label="작업 인원" unit="명" value={workerCount} onChange={setWorkerCount} />
              </div>
            </Section>
          </>
        )}
      </div>

      <StickySubmit
        onClick={handleCreate}
        disabled={saving}
        label={saving ? "계산 중..." : "견적 계산하기"}
      />
    </>
  );
}

function Section({ icon, title, step, children }: { icon?: React.ReactNode; title: string; step?: number; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        {step !== undefined && (
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">
            {step}
          </span>
        )}
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

function ChipBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable rounded-2xl px-3 py-2.5 text-sm font-medium border ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border/60"
      }`}
    >
      {label}
    </button>
  );
}

function ScopeRow({ active, label, onToggle }: { active: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl pressable border ${
        active ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card"
      }`}
    >
      <Checkbox checked={active} className="w-5 h-5 pointer-events-none" />
      <span className="text-sm font-medium text-foreground">{label}</span>
    </button>
  );
}

function EquipmentRow({
  active, label, onToggle, days, onDaysChange,
}: {
  active: boolean; label: string; onToggle: () => void;
  days: string; onDaysChange: (v: string) => void;
}) {
  return (
    <div className={`rounded-2xl border ${active ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card"} overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 pressable"
      >
        <Checkbox checked={active} className="w-5 h-5 pointer-events-none" />
        <span className="text-sm font-medium text-foreground flex-1 text-left">{label}</span>
      </button>
      {active && (
        <div className="px-3 pb-3 pt-1 flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            value={days}
            onChange={(e) => onDaysChange(e.target.value)}
            placeholder="0"
            className="h-11 rounded-xl tabular-nums flex-1"
          />
          <span className="text-sm text-muted-foreground font-medium w-6">일</span>
        </div>
      )}
    </div>
  );
}
