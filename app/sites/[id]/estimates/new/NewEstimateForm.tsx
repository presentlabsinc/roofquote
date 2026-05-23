"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/number-stepper";
import type { PricingSettings } from "@prisma/client";
import {
  type ConstructionType,
  type MaterialType,
  type ScopeFlags,
  type Thickness,
  type ExtraCost,
  type GutterMode,
  type SubstructureType,
  CONSTRUCTION_TYPES,
  MATERIAL_TYPES,
  THICKNESSES,
  SCOPE_BY_TYPE,
  SCOPE_LABELS,
  SCOPE_HINTS,
  SCOPE_MUTEX,
  COLOR_PRESETS,
  DEFAULT_COLOR,
  SUBSTRUCTURE_OPTIONS,
  GUTTER_MODE_OPTIONS,
} from "@/lib/types";
import { pyeongToSqm, sqmToPyeong } from "@/lib/calculations";
import { CatalogPicker } from "@/components/CatalogPicker";
import type { CatalogSelection } from "@/lib/catalog";
import { StickySubmit } from "@/app/sites/new/NewSiteForm";
import { Ruler, ListChecks, Users, Hammer, Palette, Layers, Wrench, Building2, Plus, X, Receipt, Percent, Package, Pickaxe, Trash2 } from "lucide-react";

interface Props {
  siteId: string;
  settings: PricingSettings;
}

export function NewEstimateForm({ siteId, settings }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Step 1: Area
  const [sqmInput, setSqmInput] = useState("");
  const [pyeongInput, setPyeongInput] = useState("");
  const [showBuildingArea, setShowBuildingArea] = useState(false);
  const [buildingSqmInput, setBuildingSqmInput] = useState("");
  const [buildingPyeongInput, setBuildingPyeongInput] = useState("");

  // Step 2: Construction type
  const [constructionType, setConstructionType] = useState<ConstructionType | null>(null);

  // Step 3-5: Material
  const [materialType, setMaterialType] = useState<MaterialType>("slate");
  const [thickness, setThickness] = useState<Thickness>("0.45");
  const [colorChoice, setColorChoice] = useState<string>(DEFAULT_COLOR);
  const [colorCustom, setColorCustom] = useState("");

  // Loss rate (per-estimate override)
  const [applyLossRate, setApplyLossRate] = useState(settings.useLossRateByDefault);
  const [lossRatePct, setLossRatePct] = useState(String(Math.round(settings.defaultLossRate * 100)));

  // 하지작업 (NEW — between 색상 and 로스율)
  const [substructureType, setSubstructureType] = useState<SubstructureType | "none">(
    settings.substructureMode === "steel" ? "steel" : "wood",
  );

  // Step 6: Scope
  const [scope, setScope] = useState<ScopeFlags>({});

  // 물받이 mode (replaces scope.gutter)
  const [gutterMode, setGutterMode] = useState<GutterMode>("full");
  const [gutterLength, setGutterLength] = useState("");

  // 폐기물 트럭 수
  const [wasteTrucks, setWasteTrucks] = useState("1");

  // Step 7: Equipment days (use steppers — small numeric range)
  const [skyliftDays, setSkyliftDays] = useState("1");
  const [ladderTruckDays, setLadderTruckDays] = useState("1");
  const [scaffoldDays, setScaffoldDays] = useState("3");
  const [scaffoldArea, setScaffoldArea] = useState("");
  const [otherEquipment, setOtherEquipment] = useState("");

  // Step 8: Work info (steppers)
  const [workerCount, setWorkerCount] = useState(String(settings.defaultWorkerCount));
  const [workDays, setWorkDays] = useState("2");

  // Catalog selections (마감재 / 물받이 부속 / 부자재 / 절곡)
  const [catalogSelections, setCatalogSelections] = useState<CatalogSelection[]>([]);

  // Step 9: 기타 비용
  const [extraCosts, setExtraCosts] = useState<ExtraCost[]>([]);

  function pickConstructionType(t: ConstructionType) {
    setConstructionType(t);
    const defaults: ScopeFlags = {};
    if (t === "roof") {
      defaults.ridge = true;
      defaults.eave = true;
      defaults.waste = true;
      setGutterMode("full");
      setSubstructureType(settings.substructureMode === "steel" ? "steel" : "wood");
    } else if (t === "rooftopRoof") {
      defaults.frameReinforcement = true;
      defaults.ridge = true;
      defaults.eave = true;
      defaults.waste = true;
      setGutterMode("full");
      setSubstructureType(settings.substructureMode === "steel" ? "steel" : "wood");
    } else if (t === "steelWaterproof") {
      defaults.handrailAndCap = true;
      defaults.waste = true;
      setGutterMode("none");
      setSubstructureType("none");
    }
    setScope(defaults);
  }

  function toggleScope(key: keyof ScopeFlags) {
    setScope((s) => {
      const next = { ...s, [key]: !s[key] };
      // Mutex: e.g. checking 덧씌우기 auto-unchecks 철거
      const mutexKey = SCOPE_MUTEX[key];
      if (mutexKey && next[key]) {
        next[mutexKey] = false;
      }
      return next;
    });
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

  function handleBuildingSqmChange(val: string) {
    setBuildingSqmInput(val);
    const n = parseFloat(val);
    setBuildingPyeongInput(Number.isFinite(n) && n > 0 ? String(sqmToPyeong(n)) : "");
  }

  function handleBuildingPyeongChange(val: string) {
    setBuildingPyeongInput(val);
    const n = parseFloat(val);
    setBuildingSqmInput(Number.isFinite(n) && n > 0 ? String(pyeongToSqm(n)) : "");
  }

  const scopeItems = useMemo(
    () => (constructionType ? SCOPE_BY_TYPE[constructionType] : []),
    [constructionType],
  );

  function addExtraCost() {
    setExtraCosts((arr) => [...arr, { name: "", amount: 0, note: "" }]);
  }

  function updateExtraCost(idx: number, patch: Partial<ExtraCost>) {
    setExtraCosts((arr) => arr.map((ec, i) => (i === idx ? { ...ec, ...patch } : ec)));
  }

  function removeExtraCost(idx: number) {
    setExtraCosts((arr) => arr.filter((_, i) => i !== idx));
  }

  const showRest = constructionType !== null;

  async function handleCreate() {
    const areaM2 = parseFloat(sqmInput) || 0;
    if (areaM2 <= 0) { toast.error("시공 면적을 입력해 주세요"); return; }
    if (!constructionType) { toast.error("공사 유형을 선택해 주세요"); return; }
    if (gutterMode !== "none" && !gutterLength) { toast.error("물받이 길이를 입력해 주세요"); return; }

    const finalColor = colorChoice === "기타" ? (colorCustom || "기타") : colorChoice;
    const lossRate = applyLossRate ? (parseFloat(lossRatePct) || 0) / 100 : null;

    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/estimates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          constructionType,
          materialType,
          materialThickness: thickness,
          materialColor: finalColor,
          areaM2,
          buildingAreaM2: showBuildingArea && buildingSqmInput ? parseFloat(buildingSqmInput) : null,
          workerCount: parseInt(workerCount) || settings.defaultWorkerCount,
          workDays: parseFloat(workDays) || 2,
          gutterMode: gutterMode === "none" ? null : gutterMode,
          gutterLengthM: gutterMode !== "none" ? parseFloat(gutterLength) || 0 : 0,
          substructureType: substructureType === "none" ? null : substructureType,
          wasteTruckCount: scope.waste ? Math.max(1, parseInt(wasteTrucks) || 1) : 1,
          skyliftDays: scope.skylift ? parseFloat(skyliftDays) || 1 : 0,
          ladderTruckDays: scope.ladderTruck ? parseFloat(ladderTruckDays) || 1 : 0,
          scaffoldDays: scope.scaffold ? parseFloat(scaffoldDays) || 1 : 0,
          scaffoldAreaM2: scope.scaffold && scaffoldArea ? parseFloat(scaffoldArea) || 0 : 0,
          otherEquipment: otherEquipment || null,
          scopeFlags: scope,
          extraCosts: extraCosts.filter((ec) => ec.name?.trim() && ec.amount > 0),
          catalogSelections: catalogSelections.filter((s) => s.quantity > 0 && s.label.trim()),
          applyLossRate,
          lossRate,
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
      <div className="space-y-3 pb-32">
        {/* STEP 1: Area */}
        <Section icon={<Ruler size={18} />} title="면적" step={1}>
          <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">시공 면적</Label>
          <div className="grid grid-cols-2 gap-2.5">
            <UnitInput label="평" unit="평" value={pyeongInput} onChange={handlePyeongChange} />
            <UnitInput label="㎡" unit="㎡" value={sqmInput} onChange={handleSqmChange} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">평 또는 ㎡ 어디든 입력하면 자동 변환</p>

          <button
            type="button"
            onClick={() => setShowBuildingArea((v) => !v)}
            className="mt-4 flex items-center gap-2 text-xs font-medium text-primary pressable"
          >
            <span className="w-5 h-5 rounded-md border border-primary/40 flex items-center justify-center text-[11px]">
              {showBuildingArea ? "−" : "+"}
            </span>
            건물 면적도 함께 기입 (옵션 — 참고용)
          </button>

          {showBuildingArea && (
            <div className="mt-3 pt-3 border-t border-border/40">
              <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">건물 면적</Label>
              <div className="grid grid-cols-2 gap-2.5">
                <UnitInput label="평" unit="평" value={buildingPyeongInput} onChange={handleBuildingPyeongChange} />
                <UnitInput label="㎡" unit="㎡" value={buildingSqmInput} onChange={handleBuildingSqmChange} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">견적 계산에는 사용되지 않습니다</p>
            </div>
          )}
        </Section>

        {/* STEP 2: Construction type */}
        <Section icon={<Building2 size={18} />} title="공사 유형" step={2}>
          <div className="space-y-2">
            {CONSTRUCTION_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => pickConstructionType(t.value)}
                className={`w-full text-left rounded-2xl px-4 py-3.5 border-2 pressable flex items-center gap-3 ${
                  constructionType === t.value ? "border-primary bg-primary/5" : "border-border/60 bg-card"
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
                  constructionType === t.value ? "border-primary bg-primary" : "border-border"
                }`}>
                  {constructionType === t.value && (
                    <div className="w-full h-full flex items-center justify-center text-white text-xs">✓</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Section>

        {showRest && (
          <>
            {/* STEP 3: Material type */}
            <Section icon={<Hammer size={18} />} title="자재 종류" step={3}>
              {constructionType === "steelWaterproof" && (
                <p className="text-[11px] text-muted-foreground -mt-1 mb-2">바닥형은 보통 슬레이트골을 사용합니다</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {MATERIAL_TYPES.map((m) => (
                  <ChipBtn
                    key={m.value}
                    active={materialType === m.value}
                    onClick={() => setMaterialType(m.value)}
                    label={m.label}
                  />
                ))}
              </div>
            </Section>

            {/* STEP 4: Thickness */}
            <Section icon={<Layers size={18} />} title="자재 두께" step={4}>
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

            {/* STEP 5: Color */}
            <Section icon={<Palette size={18} />} title="색상 / 텍스처" step={5}>
              <div className="grid grid-cols-3 gap-1.5">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorChoice(c)}
                    className={`pressable rounded-xl px-2 py-2.5 text-xs font-medium border ${
                      colorChoice === c
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border/60"
                    }`}
                  >
                    {c}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setColorChoice("기타")}
                  className={`pressable rounded-xl px-2 py-2.5 text-xs font-medium border ${
                    colorChoice === "기타"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border/60"
                  }`}
                >
                  기타 (직접 입력)
                </button>
              </div>
              {colorChoice === "기타" && (
                <Input
                  value={colorCustom}
                  onChange={(e) => setColorCustom(e.target.value)}
                  placeholder="색상명 입력"
                  className="mt-2.5 h-12 rounded-xl text-base"
                />
              )}
            </Section>

            {/* 하지작업 (Substructure) */}
            <Section icon={<Pickaxe size={18} />} title="하지 작업">
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                강판 아래 시공되는 하지. ㎡당 단가로 자동 계산
              </p>
              <div className="grid grid-cols-3 gap-2">
                {SUBSTRUCTURE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSubstructureType(opt.value)}
                    className={`pressable rounded-2xl py-3 px-2 text-sm font-semibold border-2 flex flex-col items-center gap-1 ${
                      substructureType === opt.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border/60 bg-card text-foreground"
                    }`}
                  >
                    <span className="text-lg leading-none">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
              {substructureType !== "none" && (
                <p className="text-[11px] text-muted-foreground mt-2 text-center tabular-nums">
                  ≈ 시공면적 × {(substructureType === "wood" ? settings.substructureWoodPricePerSqm : settings.substructureSteelPricePerSqm).toLocaleString("ko-KR")}원/㎡
                </p>
              )}
            </Section>

            {/* Loss rate toggle */}
            <Section icon={<Percent size={18} />} title="자재 로스율">
              <p className="text-[11px] text-muted-foreground -mt-1 mb-3">
                시공 시 자투리/낭비분을 자재 비용에 반영. 보통 10~15%
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setApplyLossRate((v) => !v)}
                  className={`w-12 h-7 rounded-full flex items-center px-0.5 pressable ${
                    applyLossRate ? "bg-primary justify-end" : "bg-muted justify-start"
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-white shadow-sm" />
                </button>
                <span className="text-sm font-medium text-foreground flex-1">
                  {applyLossRate ? "로스율 적용 중" : "로스율 미적용"}
                </span>
                {applyLossRate && (
                  <div className="relative w-20">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={lossRatePct}
                      onChange={(e) => setLossRatePct(e.target.value)}
                      className="h-10 pr-7 text-right tabular-nums rounded-xl"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                )}
              </div>
            </Section>

            {/* STEP 6: Scope */}
            <Section icon={<ListChecks size={18} />} title="공사 범위" step={6}>
              <div className="space-y-2">
                {scopeItems.map((key) => {
                  const hint = SCOPE_HINTS[key];
                  const isWaste = key === "waste";
                  return (
                    <div key={key}>
                      <ScopeRow
                        active={!!scope[key]}
                        label={SCOPE_LABELS[key]}
                        hint={hint}
                        onToggle={() => toggleScope(key)}
                      />
                      {/* 폐기물 트럭 수 stepper */}
                      {isWaste && scope.waste && (
                        <div className="mt-2 ml-3">
                          <Label className="text-[10px] text-muted-foreground mb-1 block">트럭 수 ({(settings.wasteDisposalCost).toLocaleString("ko-KR")}원/차)</Label>
                          <NumberStepper
                            value={wasteTrucks}
                            onChange={setWasteTrucks}
                            min={1} max={20} step={1}
                            unit="차"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 물받이 mode picker — separate from scope flags */}
              <div className="mt-3 pt-3 border-t border-border/40">
                <Label className="text-xs text-muted-foreground mb-2 block font-medium">물받이</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {GUTTER_MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGutterMode(opt.value)}
                      className={`pressable rounded-xl py-2 text-xs font-semibold border ${
                        gutterMode === opt.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border/60"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {gutterMode !== "none" && (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={gutterLength}
                      onChange={(e) => setGutterLength(e.target.value)}
                      placeholder="길이"
                      className="h-11 rounded-xl tabular-nums flex-1"
                    />
                    <span className="text-sm text-muted-foreground font-medium w-6">m</span>
                  </div>
                )}
              </div>
            </Section>

            {/* Catalog: 마감재 / 물받이 부속 / 부자재 / 절곡 */}
            <Section icon={<Package size={18} />} title="추가 자재 / 부속">
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                필요한 항목만 펼쳐서 수량 입력. 단가는 인라인 수정 가능. 카탈로그에 없으면 "직접 추가".
              </p>
              <CatalogPicker
                selections={catalogSelections}
                onChange={setCatalogSelections}
              />
            </Section>

            {/* STEP 7: Equipment — steppers */}
            <Section icon={<Wrench size={18} />} title="장비대" step={7}>
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">사용 장비 체크 + 일수 (− / + 로 조정)</p>
              <div className="space-y-2">
                <EquipmentRow
                  active={!!scope.skylift} label="스카이차" onToggle={() => toggleScope("skylift")}
                  days={skyliftDays} onDaysChange={setSkyliftDays}
                />
                <EquipmentRow
                  active={!!scope.ladderTruck} label="사다리차" onToggle={() => toggleScope("ladderTruck")}
                  days={ladderTruckDays} onDaysChange={setLadderTruckDays}
                />
                <ScaffoldRow
                  active={!!scope.scaffold}
                  onToggle={() => toggleScope("scaffold")}
                  days={scaffoldDays} onDaysChange={setScaffoldDays}
                  area={scaffoldArea} onAreaChange={setScaffoldArea}
                  pricePerSqmDay={settings.scaffoldPricePerSqmDay}
                />
                <div className="pt-2">
                  <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">기타 장비 메모 (가격은 아래 "기타 비용" 에)</Label>
                  <Input
                    value={otherEquipment} onChange={(e) => setOtherEquipment(e.target.value)}
                    placeholder="예: 크레인 1일, 지게차 2일" className="h-11 rounded-xl text-sm"
                  />
                </div>
              </div>
            </Section>

            {/* STEP 8: Work info — steppers */}
            <Section icon={<Users size={18} />} title="작업 정보" step={8}>
              <div className="grid grid-cols-2 gap-3">
                <NumberStepper
                  label="작업 일수"
                  value={workDays}
                  onChange={setWorkDays}
                  min={0.5} max={60} step={0.5}
                  unit="일"
                />
                <NumberStepper
                  label="작업 인원"
                  value={workerCount}
                  onChange={setWorkerCount}
                  min={1} max={30} step={1}
                  unit="명"
                />
              </div>
            </Section>

            {/* STEP 9: 기타 비용 */}
            <Section icon={<Receipt size={18} />} title="기타 비용" step={9}>
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">크레인, 추가 자재, 절곡비, 잡비 등 직접 추가</p>
              {extraCosts.length > 0 && (
                <div className="space-y-2 mb-2">
                  {extraCosts.map((ec, i) => (
                    <div key={i} className="bg-muted/40 rounded-2xl p-2.5 flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={ec.name}
                          onChange={(e) => updateExtraCost(i, { name: e.target.value })}
                          placeholder="항목명 (예: 절곡비, 크레인 사용료)"
                          className="h-11 rounded-xl text-sm bg-card"
                        />
                        <div className="flex items-center gap-2">
                          <Input
                            type="number" inputMode="numeric"
                            value={ec.amount || ""}
                            onChange={(e) => updateExtraCost(i, { amount: parseInt(e.target.value) || 0 })}
                            placeholder="금액"
                            className="h-11 rounded-xl tabular-nums flex-1 bg-card"
                          />
                          <span className="text-xs text-muted-foreground font-medium w-6">원</span>
                        </div>
                      </div>
                      <button
                        type="button" onClick={() => removeExtraCost(i)}
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-background pressable shrink-0 mt-1"
                      >
                        <X size={15} className="text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                type="button" onClick={addExtraCost}
                variant="outline"
                className="w-full h-11 rounded-2xl text-sm font-semibold pressable border-dashed border-primary/40 text-primary"
              >
                <Plus size={16} className="mr-1" /> 항목 추가
              </Button>
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

function ScopeRow({ active, label, hint, onToggle }: { active: boolean; label: string; hint?: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-2xl pressable border ${
        active ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card"
      }`}
    >
      <Checkbox checked={active} className="w-5 h-5 pointer-events-none mt-0.5" />
      <div className="text-left">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
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
        <div className="px-3 pb-3 pt-1">
          <NumberStepper
            value={days}
            onChange={onDaysChange}
            min={0.5} max={60} step={0.5}
            unit="일"
          />
        </div>
      )}
    </div>
  );
}

function ScaffoldRow({
  active, onToggle, days, onDaysChange, area, onAreaChange, pricePerSqmDay,
}: {
  active: boolean; onToggle: () => void;
  days: string; onDaysChange: (v: string) => void;
  area: string; onAreaChange: (v: string) => void;
  pricePerSqmDay: number;
}) {
  const d = parseFloat(days) || 0;
  const a = parseFloat(area) || 0;
  const total = Math.round(d * a * pricePerSqmDay);
  return (
    <div className={`rounded-2xl border ${active ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card"} overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 pressable"
      >
        <Checkbox checked={active} className="w-5 h-5 pointer-events-none" />
        <span className="text-sm font-medium text-foreground flex-1 text-left">비계 / 발판</span>
      </button>
      {active && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          <div>
            <Label className="text-[10px] text-muted-foreground mb-1 block">사용 일수</Label>
            <NumberStepper value={days} onChange={onDaysChange} min={0.5} max={60} step={0.5} unit="일" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground mb-1 block">비계 면적 (벽면 면적 — 층수 × 둘레 등)</Label>
            <div className="relative">
              <Input
                type="number" inputMode="decimal"
                value={area} onChange={(e) => onAreaChange(e.target.value)}
                placeholder="0" className="h-12 text-center text-lg font-bold pr-10 rounded-2xl tabular-nums"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">㎡</span>
            </div>
          </div>
          {a > 0 && d > 0 && (
            <p className="text-[11px] text-muted-foreground text-center tabular-nums">
              {a}㎡ × {d}일 × {pricePerSqmDay.toLocaleString("ko-KR")}원 = <span className="font-bold text-primary">{total.toLocaleString("ko-KR")}원</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
