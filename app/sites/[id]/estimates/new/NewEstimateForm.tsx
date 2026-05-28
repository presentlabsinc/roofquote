"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/number-stepper";
import type { PricingSettings, Estimate } from "@prisma/client";
import {
  type ConstructionType,
  type MaterialType,
  type ScopeFlags,
  type Thickness,
  type ExtraCost,
  type GutterMode,
  type SubstructureType,
  type PricingOverrides,
  type BuildingShape,
  type RoofShape,
  CONSTRUCTION_TYPES,
  MATERIAL_TYPES,
  THICKNESSES,
  SCOPE_BY_TYPE,
  SCOPE_LABELS,
  SCOPE_HINTS,
  SCOPE_MUTEX,
  SCOPE_FORCES,
  COLOR_PRESETS,
  DEFAULT_COLOR,
  TEXTURE_PRESETS,
  SUBSTRUCTURE_OPTIONS,
  GUTTER_SIDES,
  GUTTER_SIDE_LABELS,
  parseGutterSides,
  serializeGutterSides,
  type GutterSide,
  PRICING_OVERRIDE_GROUPS,
  BUILDING_SHAPES,
  ROOF_SHAPES,
} from "@/lib/types";
import { applyOverrides, estimatePerimeter, pyeongToSqm, sqmToPyeong } from "@/lib/calculations";
import { CatalogPicker } from "@/components/CatalogPicker";
import type { CatalogSelection, CategoryModesMap } from "@/lib/catalog";
import { StickySubmit } from "@/app/sites/new/NewSiteForm";
import { Ruler, ListChecks, Users, Hammer, Palette, Layers, Wrench, Building2, Plus, X, Receipt, Percent, Package, Pickaxe, Trash2, Calendar, Coins, ChevronDown, ChevronUp, CloudRain, Waves } from "lucide-react";

interface Props {
  siteId: string;
  settings: PricingSettings;
  existing?: Estimate;
}

export function NewEstimateForm({ siteId, settings, existing }: Props) {
  const router = useRouter();
  const isEditing = !!existing;
  const [saving, setSaving] = useState(false);

  // When editing, the scope is stored as a JSON object on the estimate
  const existingScope = (existing?.scopeFlags ?? {}) as unknown as ScopeFlags;

  // ─── Initial values: from `existing` when editing, otherwise sensible defaults ─

  // Step 1: Area
  const [sqmInput, setSqmInput] = useState(existing ? String(existing.areaM2) : "");
  const [pyeongInput, setPyeongInput] = useState(existing ? String(sqmToPyeong(existing.areaM2)) : "");
  const [showBuildingArea, setShowBuildingArea] = useState(!!existing?.buildingAreaM2);
  const [buildingSqmInput, setBuildingSqmInput] = useState(existing?.buildingAreaM2 ? String(existing.buildingAreaM2) : "");
  const [buildingPyeongInput, setBuildingPyeongInput] = useState(existing?.buildingAreaM2 ? String(sqmToPyeong(existing.buildingAreaM2)) : "");

  // Step 2: Construction type
  const [constructionType, setConstructionType] = useState<ConstructionType | null>(
    (existing?.constructionType as ConstructionType | undefined) ?? null,
  );

  // Step 3-5: Material
  const [materialType, setMaterialType] = useState<MaterialType>((existing?.materialType as MaterialType | undefined) ?? "slate");
  const [thickness, setThickness] = useState<Thickness>((existing?.materialThickness as Thickness | undefined) ?? "0.45");
  const [textureChoice, setTextureChoice] = useState<string>(() => {
    const t = existing?.materialTexture;
    if (!t) return "스톤";
    return (TEXTURE_PRESETS as readonly string[]).includes(t) ? t : "기타";
  });
  const [textureCustom, setTextureCustom] = useState<string>(() => {
    const t = existing?.materialTexture ?? "";
    return (TEXTURE_PRESETS as readonly string[]).includes(t) ? "" : t;
  });
  const [colorChoice, setColorChoice] = useState<string>(() => {
    const c = existing?.materialColor;
    if (!c) return DEFAULT_COLOR;
    return (COLOR_PRESETS as readonly string[]).includes(c) ? c : "기타";
  });
  const [colorCustom, setColorCustom] = useState<string>(() => {
    const c = existing?.materialColor ?? "";
    return (COLOR_PRESETS as readonly string[]).includes(c) ? "" : c;
  });

  // 공사 일정 — 3 modes: none / month (YYYY-MM) / date (YYYY-MM-DD)
  type SchedulePrecision = "none" | "month" | "date";
  const [schedulePrecision, setSchedulePrecision] = useState<SchedulePrecision>(() => {
    const v = existing?.constructionMonth;
    if (!v) return "none";
    return v.length === 7 ? "month" : "date"; // 7 = YYYY-MM, 10 = YYYY-MM-DD
  });
  const [constructionMonth, setConstructionMonth] = useState(() => {
    if (existing?.constructionMonth) return existing.constructionMonth;
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [constructionDate, setConstructionDate] = useState(() => {
    if (existing?.constructionMonth && existing.constructionMonth.length === 10) {
      return existing.constructionMonth;
    }
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });

  // Loss rate (per-estimate override) — default ON for new estimates per user request
  const [applyLossRate, setApplyLossRate] = useState(existing?.applyLossRate ?? true);
  const [lossRatePct, setLossRatePct] = useState(
    String(Math.round((existing?.lossRate ?? settings.defaultLossRate) * 100)),
  );

  // 하지작업
  const [substructureType, setSubstructureType] = useState<SubstructureType | "none">(() => {
    if (isEditing) return (existing?.substructureType as SubstructureType | null) ?? "none";
    return settings.substructureMode === "steel" ? "steel" : "wood";
  });

  // 건물 / 지붕 형태 (자재 자동 추정용)
  const [buildingShape, setBuildingShape] = useState<BuildingShape | null>(
    (existing?.buildingShape as BuildingShape | null) ?? null,
  );
  const [roofShape, setRoofShape] = useState<RoofShape | null>(
    (existing?.roofShape as RoofShape | null) ?? null,
  );
  const [perimeterInput, setPerimeterInput] = useState(
    existing?.perimeterM ? String(existing.perimeterM) : "",
  );
  const [ridgeCount, setRidgeCount] = useState(String(existing?.ridgeCount ?? 1));
  const [parapetHeightInput, setParapetHeightInput] = useState(
    existing?.parapetHeightCm ? String(existing.parapetHeightCm) : "60",
  );
  const [hasInsulation, setHasInsulation] = useState(existing?.hasInsulation ?? false);

  // 지붕 형태 / 용마루 수는 기본 숨김. 박공 1동 가정으로 자동 추정 (대부분 케이스).
  // 다른 형태(모임/팔작/외쪽/멘사드)거나 다중 용마루면 펼쳐서 직접 지정.
  // 기존 견적에 roofShape 가 저장돼 있으면 시작부터 펼친 상태.
  const [showRoofDetails, setShowRoofDetails] = useState(
    !!existing?.roofShape || (existing?.ridgeCount ?? 1) > 1,
  );

  // Step 6: Scope
  const [scope, setScope] = useState<ScopeFlags>(existingScope);

  // 물받이 multi-select sides — default all 4 selected
  const [gutterSides, setGutterSides] = useState<Set<GutterSide>>(() =>
    existing?.gutterMode ? parseGutterSides(existing.gutterMode) : new Set(GUTTER_SIDES),
  );
  const [gutterLength, setGutterLength] = useState(existing?.gutterLengthM ? String(existing.gutterLengthM) : "");

  // 스테인리스 배수로 (스틸방수 전용 — 물받이 대체)
  const [stainlessDrainLength, setStainlessDrainLength] = useState(
    existing?.stainlessDrainLengthM ? String(existing.stainlessDrainLengthM) : "",
  );

  function toggleGutterSide(side: GutterSide) {
    setGutterSides((s) => {
      const next = new Set(s);
      if (next.has(side)) next.delete(side);
      else next.add(side);
      return next;
    });
  }

  // 두겁 절곡 길이 (난간 시공 시 필수)
  const [capLength, setCapLength] = useState(existing?.capLengthM ? String(existing.capLengthM) : "");

  // 새 배수구 타공 개수
  const [drainHoles, setDrainHoles] = useState(existing?.drainHoleCount ? String(existing.drainHoleCount) : "1");

  // 엔드캡 개수 (지붕공사 / 옥상지붕)
  const [endCaps, setEndCaps] = useState(existing?.endCapCount ? String(existing.endCapCount) : "1");

  // 폐기물 트럭 수
  const [wasteTrucks, setWasteTrucks] = useState(existing?.wasteTruckCount ? String(existing.wasteTruckCount) : "1");

  // Step 7: Equipment days (use steppers — small numeric range)
  const [skyliftDays, setSkyliftDays] = useState(existing?.skyliftDays ? String(existing.skyliftDays) : "1");
  const [ladderTruckDays, setLadderTruckDays] = useState(existing?.ladderTruckDays ? String(existing.ladderTruckDays) : "1");
  const [scaffoldDays, setScaffoldDays] = useState(existing?.scaffoldDays ? String(existing.scaffoldDays) : "3");
  const [scaffoldArea, setScaffoldArea] = useState(existing?.scaffoldAreaM2 ? String(existing.scaffoldAreaM2) : "");
  const [otherEquipment, setOtherEquipment] = useState(existing?.otherEquipment ?? "");

  // Step 8: Work info (steppers)
  const [workerCount, setWorkerCount] = useState(existing ? String(existing.workerCount) : String(settings.defaultWorkerCount));
  const [workDays, setWorkDays] = useState(existing ? String(existing.workDays) : "2");

  // Catalog selections (마감재 / 물받이 부속 / 부자재 / 절곡)
  const [catalogSelections, setCatalogSelections] = useState<CatalogSelection[]>(
    (existing?.catalogSelections as unknown as CatalogSelection[]) ?? [],
  );
  const [catalogModes, setCatalogModes] = useState<CategoryModesMap>(
    (existing?.catalogModes as unknown as CategoryModesMap) ?? {},
  );

  // Step 9: 기타 비용 — not stored separately on Estimate; only relevant for new creation.
  // On edit, we don't preserve these (they were already turned into line items at create time).
  const [extraCosts, setExtraCosts] = useState<ExtraCost[]>([]);

  // Pricing overrides — per-estimate price replacements (settings stay unchanged)
  const [pricingOverrides, setPricingOverrides] = useState<PricingOverrides>(
    (existing?.pricingOverrides as unknown as PricingOverrides) ?? {},
  );

  function pickConstructionType(t: ConstructionType) {
    setConstructionType(t);
    // Defaults per construction type:
    // - 용마루(ridge) basic for roof + rooftopRoof
    // - 기존 지붕 덧씌우기(overlay) basic for roof
    // - 강판 종류 default differs: steelWaterproof = 슬레이트골, 나머지 = 징크250
    const defaults: ScopeFlags = {};
    if (t === "roof") {
      defaults.ridge = true;
      defaults.overlay = true;
      setMaterialType("zinc250");
      setGutterSides(new Set(GUTTER_SIDES)); // 전후좌우 모두
      setSubstructureType(settings.substructureMode === "steel" ? "steel" : "wood");
    } else if (t === "rooftopRoof") {
      defaults.ridge = true;
      setMaterialType("zinc250");
      setGutterSides(new Set(GUTTER_SIDES));
      setSubstructureType(settings.substructureMode === "steel" ? "steel" : "wood");
    } else if (t === "steelWaterproof") {
      setMaterialType("slate");
      setGutterSides(new Set()); // 안함 (스틸방수는 물받이 대신 스테인리스 배수로)
      // 하지작업은 모든 유형에서 목재 기본 — 안 쓰면 사용자가 '없음' 으로 변경
      setSubstructureType(settings.substructureMode === "steel" ? "steel" : "wood");
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
      // Forces: e.g. checking 난간 auto-checks 두겁 (waterproofing dependency)
      const forcedKey = SCOPE_FORCES[key];
      if (forcedKey && next[key]) {
        next[forcedKey] = true;
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
    if (constructionType !== "steelWaterproof" && gutterSides.size > 0 && !gutterLength) { toast.error("물받이 길이를 입력해 주세요"); return; }
    if ((scope.handrail || scope.cap) && !capLength) { toast.error("두겁 절곡 길이를 입력해 주세요"); return; }

    const finalColor = colorChoice === "기타" ? (colorCustom || "기타") : colorChoice;
    const finalTexture = textureChoice === "기타" ? (textureCustom || null) : textureChoice;
    const lossRate = applyLossRate ? (parseFloat(lossRatePct) || 0) / 100 : null;

    // Pick the right schedule value based on precision
    const scheduleValue = schedulePrecision === "none" ? null
      : schedulePrecision === "month" ? constructionMonth
      : constructionDate;

    const payload = {
      constructionType,
      materialType,
      materialThickness: thickness,
      materialTexture: finalTexture,
      materialColor: finalColor,
      constructionMonth: scheduleValue,
      areaM2,
      buildingAreaM2: showBuildingArea && buildingSqmInput ? parseFloat(buildingSqmInput) : null,
      workerCount: parseInt(workerCount) || settings.defaultWorkerCount,
      workDays: parseFloat(workDays) || 2,
      // 스틸방수는 물받이 비활성 — 기존 데이터가 있어도 null/0 로 보낸다.
      gutterMode: constructionType === "steelWaterproof" || gutterSides.size === 0
        ? null
        : serializeGutterSides(gutterSides),
      gutterLengthM: constructionType === "steelWaterproof" || gutterSides.size === 0
        ? 0
        : parseFloat(gutterLength) || 0,
      stainlessDrainLengthM: constructionType === "steelWaterproof"
        ? parseFloat(stainlessDrainLength) || 0
        : 0,
      capLengthM: (scope.cap || scope.handrail) ? parseFloat(capLength) || 0 : 0,
      drainHoleCount: scope.drainHole ? Math.max(1, parseInt(drainHoles) || 1) : 0,
      endCapCount: scope.endCap ? Math.max(1, parseInt(endCaps) || 1) : 0,
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
      catalogModes,
      pricingOverrides,
      applyLossRate,
      lossRate,
      // 건물/지붕 형태 + 단열재 (자재 자동 추정)
      buildingShape,
      roofShape: constructionType === "steelWaterproof" ? null : roofShape,
      perimeterM: perimeterInput ? parseFloat(perimeterInput) || null : null,
      ridgeCount: Math.max(1, parseInt(ridgeCount) || 1),
      parapetHeightCm: constructionType === "steelWaterproof"
        ? (parapetHeightInput ? parseInt(parapetHeightInput) || 60 : 60)
        : null,
      hasInsulation,
    };

    setSaving(true);
    try {
      let url: string;
      let body: object;
      if (isEditing && existing) {
        url = `/api/estimates/${existing.id}`;
        body = { action: "replace", ...payload };
      } else {
        url = `/api/sites/${siteId}/estimates`;
        body = payload;
      }
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "실패");
      }
      const est = await res.json();
      toast.success(isEditing ? "견적이 수정되었습니다" : "견적이 생성되었습니다");
      router.push(`/sites/${siteId}/estimates/${est.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : isEditing ? "수정에 실패했습니다" : "견적 생성에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  // Effective prices for inline display — settings with overrides merged on top
  const eff = applyOverrides(settings, pricingOverrides);

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
            {/* STEP 2.5: 건물 평면 형태 — 자재 자동 추정용 */}
            <Section icon={<Building2 size={18} />} title="건물 평면 형태">
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                건물 모양으로 둘레·꺾임 자동 추정 (자재 수량 계산에 사용)
              </p>
              <div className="grid grid-cols-3 gap-2">
                {BUILDING_SHAPES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setBuildingShape(s.value)}
                    className={`pressable rounded-2xl py-3 px-2 border-2 flex flex-col items-center gap-1 ${
                      buildingShape === s.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border/60 bg-card text-foreground"
                    }`}
                  >
                    <span className="text-2xl leading-none">{s.icon}</span>
                    <span className="text-sm font-semibold">{s.label}</span>
                    <span className="text-[10px] text-muted-foreground">{s.desc}</span>
                  </button>
                ))}
              </div>
              {buildingShape && (
                <div className="mt-3 pt-3 border-t border-border/40">
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    건물 둘레 (선택 — 비우면 자동 추정
                    {sqmInput && parseFloat(sqmInput) > 0
                      ? `: ${estimatePerimeter(parseFloat(sqmInput), buildingShape)}m`
                      : ""}
                    )
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" inputMode="decimal"
                      value={perimeterInput}
                      onChange={(e) => setPerimeterInput(e.target.value)}
                      placeholder={
                        sqmInput && parseFloat(sqmInput) > 0
                          ? String(estimatePerimeter(parseFloat(sqmInput), buildingShape))
                          : "0"
                      }
                      className="h-11 rounded-xl tabular-nums flex-1"
                    />
                    <span className="text-sm text-muted-foreground font-medium w-6">m</span>
                  </div>
                </div>
              )}
            </Section>

            {/* STEP 2.7: 지붕 형태 (지붕/옥상지붕) 또는 파라펫 (스틸방수) */}
            {constructionType !== "steelWaterproof" ? (
              <Section icon={<Layers size={18} />} title="지붕 형태 (선택)">
                {!showRoofDetails ? (
                  <button
                    type="button"
                    onClick={() => setShowRoofDetails(true)}
                    className="w-full text-left rounded-xl bg-muted/30 hover:bg-muted/50 pressable px-3 py-3 flex items-center justify-between"
                  >
                    <div className="text-xs">
                      <div className="font-semibold text-foreground">기본값: 박공 · 용마루 1개</div>
                      <div className="text-muted-foreground mt-0.5">
                        대부분 케이스에 이걸로 됨. 다르면 펼쳐서 직접 지정
                      </div>
                    </div>
                    <ChevronDown size={16} className="text-muted-foreground shrink-0 ml-2" />
                  </button>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-[11px] text-muted-foreground">
                        지붕 모양으로 용마루·처마 길이 + 강판 로스율 자동 추정
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRoofDetails(false);
                          setRoofShape(null);
                          setRidgeCount("1");
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground pressable shrink-0 flex items-center gap-0.5"
                      >
                        <ChevronUp size={12} />접기
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {ROOF_SHAPES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setRoofShape(s.value)}
                          className={`pressable rounded-2xl py-3 px-2 border-2 flex flex-col items-center gap-1 ${
                            roofShape === s.value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border/60 bg-card text-foreground"
                          }`}
                        >
                          <span className="text-sm font-bold">{s.label}</span>
                          <span className="text-[10px] text-muted-foreground">{s.desc}</span>
                        </button>
                      ))}
                    </div>
                    {/* 외쪽 (shed) 은 용마루 없으니 수 입력도 숨김 */}
                    {roofShape !== "shed" && (
                      <div className="mt-3 pt-3 border-t border-border/40">
                        <Label className="text-[10px] text-muted-foreground mb-1 block">
                          용마루 수 (보통 1, 2동 건물이면 2)
                        </Label>
                        <NumberStepper
                          value={ridgeCount}
                          onChange={setRidgeCount}
                          min={1} max={6} step={1}
                          unit="개"
                        />
                      </div>
                    )}
                  </>
                )}
              </Section>
            ) : (
              <Section icon={<Layers size={18} />} title="파라펫 정보">
                <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                  파라펫 높이로 둘레 강판 면적 자동 추정
                </p>
                <Label className="text-[10px] text-muted-foreground mb-1 block">파라펫 높이</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" inputMode="numeric"
                    value={parapetHeightInput}
                    onChange={(e) => setParapetHeightInput(e.target.value)}
                    placeholder="60"
                    className="h-11 rounded-xl tabular-nums flex-1"
                  />
                  <span className="text-sm text-muted-foreground font-medium w-7">cm</span>
                </div>
              </Section>
            )}

            {/* 단열재 옵션 */}
            <Section icon={<Package size={18} />} title="단열재 (옵션)">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setHasInsulation((v) => !v)}
                  className={`w-12 h-7 rounded-full flex items-center px-0.5 pressable ${
                    hasInsulation ? "bg-primary justify-end" : "bg-muted justify-start"
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-white shadow-sm" />
                </button>
                <span className="text-sm font-medium text-foreground flex-1">
                  {hasInsulation ? "단열재 추가됨" : "단열재 없음"}
                </span>
                {hasInsulation && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    ≈ {eff.insulationPricePerSqm.toLocaleString("ko-KR")}원/㎡
                  </span>
                )}
              </div>
            </Section>

            {/* STEP 3: Steel sheet type */}
            <Section icon={<Hammer size={18} />} title="강판 종류" step={3}>
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
            <Section icon={<Layers size={18} />} title="강판 두께" step={4}>
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

            {/* STEP 5: Texture + Color */}
            <Section icon={<Palette size={18} />} title="색상 / 텍스처" step={5}>
              <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">텍스처</Label>
              <div className="grid grid-cols-5 gap-1.5 mb-3">
                {TEXTURE_PRESETS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTextureChoice(t)}
                    className={`pressable rounded-xl px-2 py-2 text-xs font-medium border ${
                      textureChoice === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border/60"
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setTextureChoice("기타")}
                  className={`pressable rounded-xl px-2 py-2 text-xs font-medium border ${
                    textureChoice === "기타"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border/60"
                  }`}
                >
                  기타
                </button>
              </div>
              {textureChoice === "기타" && (
                <Input
                  value={textureCustom}
                  onChange={(e) => setTextureCustom(e.target.value)}
                  placeholder="텍스처명 입력"
                  className="mb-3 h-11 rounded-xl text-sm"
                />
              )}

              <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">색상</Label>
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
                  ≈ 시공면적 × {(substructureType === "wood" ? eff.substructureWoodPricePerSqm : eff.substructureSteelPricePerSqm).toLocaleString("ko-KR")}원/㎡
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
                  return (
                    <div key={key}>
                      <ScopeRow
                        active={!!scope[key]}
                        label={SCOPE_LABELS[key]}
                        hint={hint}
                        onToggle={() => toggleScope(key)}
                      />
                      {/* 폐기물 트럭 수 */}
                      {key === "waste" && scope.waste && (
                        <div className="mt-2 ml-3">
                          <Label className="text-[10px] text-muted-foreground mb-1 block">트럭 수 ({eff.wasteDisposalCost.toLocaleString("ko-KR")}원/차)</Label>
                          <NumberStepper
                            value={wasteTrucks}
                            onChange={setWasteTrucks}
                            min={1} max={20} step={1}
                            unit="차"
                          />
                        </div>
                      )}
                      {/* 두겁 절곡 길이 — 난간/두겁 통합 UI 에서 난간 토글 아래에 표시.
                          cap 은 SCOPE_FORCES 로 handrail 토글 시 자동 켜지므로 별도 row 없음. */}
                      {key === "handrail" && scope.handrail && (
                        <div className="mt-2 ml-3">
                          <Label className="text-[10px] text-muted-foreground mb-1 block">
                            두겁 절곡 길이 ({eff.capBendingPricePerM.toLocaleString("ko-KR")}원/m)
                          </Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number" inputMode="decimal"
                              value={capLength} onChange={(e) => setCapLength(e.target.value)}
                              placeholder="0" className="h-11 rounded-xl tabular-nums flex-1"
                            />
                            <span className="text-sm text-muted-foreground font-medium w-6">m</span>
                          </div>
                        </div>
                      )}
                      {/* 새 배수구 타공 개수 */}
                      {key === "drainHole" && scope.drainHole && (
                        <div className="mt-2 ml-3">
                          <Label className="text-[10px] text-muted-foreground mb-1 block">
                            개수 ({eff.drainHolePrice.toLocaleString("ko-KR")}원/개)
                          </Label>
                          <NumberStepper
                            value={drainHoles}
                            onChange={setDrainHoles}
                            min={1} max={20} step={1}
                            unit="개"
                          />
                        </div>
                      )}
                      {/* 엔드캡 개수 */}
                      {key === "endCap" && scope.endCap && (
                        <div className="mt-2 ml-3">
                          <Label className="text-[10px] text-muted-foreground mb-1 block">
                            개수 ({eff.endCapPrice.toLocaleString("ko-KR")}원/개)
                          </Label>
                          <NumberStepper
                            value={endCaps}
                            onChange={setEndCaps}
                            min={1} max={50} step={1}
                            unit="개"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </Section>

            {/* 물받이 (지붕/옥상지붕) — 별도 Section 으로 분리해서 눈에 잘 띄게.
                예전엔 공사 범위 섹션 안에 작은 라벨로 들어가 있어서 자주 건너뜀. */}
            {constructionType !== "steelWaterproof" && (
              <Section icon={<CloudRain size={18} />} title="물받이">
                <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                  설치 면을 선택하세요 (전부 = 4면, 0개 = 안함)
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {GUTTER_SIDES.map((side) => {
                    const active = gutterSides.has(side);
                    return (
                      <button
                        key={side}
                        type="button"
                        onClick={() => toggleGutterSide(side)}
                        className={`pressable rounded-xl py-2.5 text-sm font-semibold border ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-foreground border-border/60"
                        }`}
                      >
                        {GUTTER_SIDE_LABELS[side]}
                      </button>
                    );
                  })}
                </div>
                {gutterSides.size > 0 && (
                  <div className="mt-2.5">
                    <Label className="text-[10px] text-muted-foreground mb-1 block">
                      총 길이 ({eff.gutterPricePerM.toLocaleString("ko-KR")}원/m)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={gutterLength}
                        onChange={(e) => setGutterLength(e.target.value)}
                        placeholder="총 길이"
                        className="h-11 rounded-xl tabular-nums flex-1"
                      />
                      <span className="text-sm text-muted-foreground font-medium w-6">m</span>
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* 스테인리스 배수로 (스틸방수 전용 — 물받이 대체) */}
            {constructionType === "steelWaterproof" && (
              <Section icon={<Waves size={18} />} title="스테인리스 배수로">
                <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                  옥상 바닥의 배수로 — 물받이 대신 사용 (0 = 안함)
                </p>
                <Label className="text-[10px] text-muted-foreground mb-1 block">
                  총 길이 ({eff.stainlessDrainPricePerM.toLocaleString("ko-KR")}원/m)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={stainlessDrainLength}
                    onChange={(e) => setStainlessDrainLength(e.target.value)}
                    placeholder="총 길이"
                    className="h-11 rounded-xl tabular-nums flex-1"
                  />
                  <span className="text-sm text-muted-foreground font-medium w-6">m</span>
                </div>
              </Section>
            )}

            {/* Catalog: 마감재 / 물받이 부속 / 부자재 / 절곡 */}
            <Section icon={<Package size={18} />} title="추가 자재 / 부속">
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                각 카테고리는 <b>심플</b>(한 줄 자동 계산) 또는 <b>상세</b>(항목별) 모드 토글.
                심플 = 빠름, 상세 = 정확. 단가는 모두 인라인 수정 가능.
              </p>
              <CatalogPicker
                selections={catalogSelections}
                onChange={setCatalogSelections}
                modes={catalogModes}
                onModesChange={setCatalogModes}
                defaults={(settings.catalogDefaults as CategoryModesMap | null) ?? undefined}
                areaM2={parseFloat(sqmInput) || 0}
                gutterLengthM={gutterSides.size > 0 ? (parseFloat(gutterLength) || 0) : 0}
                materialTotalEstimate={Math.round((parseFloat(sqmInput) || 0) * eff.materialPricePerSqm)}
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
                  pricePerSqmDay={eff.scaffoldPricePerSqmDay}
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

            {/* STEP 9: 기타 비용 (구 step 8 위치) */}
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

            {/* Construction schedule — optional, 3 precisions: 없음 / 연월 / 연월일 */}
            <Section icon={<Calendar size={18} />} title="공사 일정">
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                연월까지만, 연월일까지, 또는 안 넣기 중 선택
              </p>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {([
                  { v: "date",  l: "연월일" },
                  { v: "month", l: "연월" },
                  { v: "none",  l: "없음" },
                ] as { v: typeof schedulePrecision; l: string }[]).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setSchedulePrecision(opt.v)}
                    className={`pressable rounded-xl py-2.5 text-xs font-semibold border ${
                      schedulePrecision === opt.v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border/60"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
              {schedulePrecision === "month" && (
                <Input
                  type="month"
                  value={constructionMonth}
                  onChange={(e) => setConstructionMonth(e.target.value)}
                  className="h-12 rounded-xl text-base tabular-nums"
                />
              )}
              {schedulePrecision === "date" && (
                <Input
                  type="date"
                  value={constructionDate}
                  onChange={(e) => setConstructionDate(e.target.value)}
                  className="h-12 rounded-xl text-base tabular-nums"
                />
              )}
            </Section>

            {/* Pricing overrides — at the very end. Collapsed by default. */}
            <PricingOverridesSection
              overrides={pricingOverrides}
              onChange={setPricingOverrides}
              settings={settings}
            />
          </>
        )}
      </div>

      <StickySubmit
        onClick={handleCreate}
        disabled={saving}
        label={
          saving
            ? (isEditing ? "저장 중..." : "계산 중...")
            : (isEditing ? "수정 저장" : "견적 계산하기")
        }
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

/**
 * Collapsible section listing all overridable price fields, grouped by
 * concern (자재 / 하지·스틸방수 / 인건·체류 / 장비·운송). Each field's
 * placeholder shows the current settings default. Filling it in records
 * an override for this estimate only.
 */
function PricingOverridesSection({
  overrides, onChange, settings,
}: {
  overrides: PricingOverrides;
  onChange: (o: PricingOverrides) => void;
  settings: PricingSettings;
}) {
  const [open, setOpen] = useState(false);
  const overrideCount = Object.values(overrides).filter((v) => v !== undefined && v !== null && !Number.isNaN(v)).length;

  function setField<K extends keyof PricingOverrides>(key: K, raw: string, pct?: boolean) {
    const next = { ...overrides };
    if (raw === "") {
      delete next[key];
    } else {
      const num = pct ? parseFloat(raw) / 100 : parseFloat(raw);
      if (Number.isFinite(num)) next[key] = num;
      else delete next[key];
    }
    onChange(next);
  }

  function clearAll() {
    onChange({});
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 pressable"
      >
        <span className="text-primary"><Coins size={18} /></span>
        <div className="flex-1 text-left">
          <div className="text-sm font-semibold text-foreground">단가 임시 조정</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">이 견적에만 적용 · 단가 설정은 안 바뀜</div>
        </div>
        {overrideCount > 0 && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 tabular-nums">
            {overrideCount}개 변경됨
          </span>
        )}
        {open ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border/40 pt-3 space-y-4">
          {overrideCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] text-muted-foreground underline pressable"
            >
              모두 초기화 (단가 설정 기본값 사용)
            </button>
          )}
          {PRICING_OVERRIDE_GROUPS.map((g) => (
            <div key={g.group}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-base">{g.icon}</span>
                <span className="text-xs font-semibold text-muted-foreground">{g.group}</span>
              </div>
              <div className="space-y-2">
                {g.fields.map((f) => {
                  const overrideVal = overrides[f.key];
                  const settingsVal = settings[f.key as keyof PricingSettings] as number;
                  const displayDefault = f.pct
                    ? `${Math.round(settingsVal * 100)}`
                    : settingsVal.toLocaleString("ko-KR");
                  const displayValue = overrideVal !== undefined && overrideVal !== null
                    ? (f.pct ? String(Math.round(overrideVal * 100)) : String(overrideVal))
                    : "";
                  const isOverridden = displayValue !== "";
                  return (
                    <div key={f.key} className="flex items-center gap-2">
                      <Label className="flex-1 text-xs text-muted-foreground">{f.label}</Label>
                      <div className="relative w-32 shrink-0">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={displayValue}
                          onChange={(e) => setField(f.key, e.target.value, f.pct)}
                          placeholder={`기본 ${displayDefault}`}
                          className={`h-10 pr-9 text-right text-sm tabular-nums rounded-lg ${
                            isOverridden ? "border-amber-300 bg-amber-50/40" : ""
                          }`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{f.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
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
