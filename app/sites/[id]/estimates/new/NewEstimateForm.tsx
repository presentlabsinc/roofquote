"use client";
/**
 * 새 견적 폼.
 *
 * ─── 타이포그래피 표준 (유지 부탁 — 일관된 시인성 위해) ────────────────────
 * - 섹션 제목 (Section h2):           text-sm font-semibold text-foreground
 * - 강조 필드 라벨 (입력 위 중요):    text-sm font-semibold text-foreground mb-1.5 block
 *                                    예: "건물 둘레", "처마 돌출"
 * - 소형 필드 라벨 (입력 위 보조):    text-xs font-medium text-muted-foreground mb-1.5 block
 *                                    예: "시공 면적"
 * - 섹션 설명 (제목 바로 아래 회색):  text-[11px] text-muted-foreground -mt-1 mb-2
 * - 입력 아래 도움말 (한 줄 안내):    text-[10px] text-muted-foreground mt-1.5
 * - 칩 버튼 라벨 (선택용):            text-sm font-semibold
 * - 칩 안의 보조 설명 (icon+label):   text-[10px] text-muted-foreground
 * - 큰 숫자 입력 (UnitInput):         text-xl font-bold tabular-nums
 * - 일반 숫자 입력 (NumberStepper):   text-lg font-bold tabular-nums
 *
 * 색상: 본문 = text-foreground, 보조/회색 = text-muted-foreground, 강조 = text-primary.
 * ─────────────────────────────────────────────────────────────────────
 */
import { memo, useEffect, useRef, useState, useMemo } from "react";
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
  type InsulationType,
  INSULATION_TYPES,
  INSULATION_PRICE_KEY,
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
  type FinishingMember,
  type FinishingMethod,
  type FinishingMethods,
  resolveFinishingMethod,
} from "@/lib/types";
import { applyOverrides, estimateBasePerimeter, pyeongToSqm, sqmToPyeong } from "@/lib/calculations";
import { CatalogPicker } from "@/components/CatalogPicker";
import type { CatalogSelection, GroupModesMap } from "@/lib/catalog";
import { StickySubmit } from "@/app/sites/new/NewSiteForm";
import { Ruler, ListChecks, Users, Hammer, Palette, Layers, Wrench, Building2, Plus, X, Receipt, Percent, Package, Pickaxe, Trash2, Calendar, Coins, ChevronDown, ChevronUp, CloudRain, Waves } from "lucide-react";

interface Props {
  siteId: string;
  settings: PricingSettings;
  existing?: Estimate;
}

// 물받이 면별 길이 가중치 (장단비 1.5 가정 → 앞/뒤 30%, 좌/우 20%). 모듈 스코프 = 재렌더링마다 재생성 안 함.
const GUTTER_SIDE_WEIGHTS: Record<GutterSide, number> = {
  front: 0.30, back: 0.30, left: 0.20, right: 0.20,
};

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
  // 처마 돌출 cm — 지붕공사/옥상지붕에서 외벽 둘레 → 처마 외곽 둘레 보정.
  // 한옥 같으면 100, 일반 50, 평지붕은 0.
  const [eaveOverhangInput, setEaveOverhangInput] = useState(
    (existing as unknown as { eaveOverhangCm?: number } | undefined)?.eaveOverhangCm != null
      ? String((existing as unknown as { eaveOverhangCm?: number }).eaveOverhangCm)
      : "50",
  );

  // 스틸방수 — 난간/옥탑 구조물 둘레 직접 입력 (자동 추정 X).
  const [railPerimeterInput, setRailPerimeterInput] = useState(
    (existing as unknown as { railPerimeterM?: number } | undefined)?.railPerimeterM != null
      ? String((existing as unknown as { railPerimeterM?: number }).railPerimeterM)
      : "0",
  );
  const [rooftopPerimeterInput, setRooftopPerimeterInput] = useState(
    (existing as unknown as { rooftopStructurePerimeterM?: number } | undefined)?.rooftopStructurePerimeterM != null
      ? String((existing as unknown as { rooftopStructurePerimeterM?: number }).rooftopStructurePerimeterM)
      : "0",
  );

  // 홈통 (downspout) 개수 — 스테인리스 배수로와 함께
  const [downspoutCount, setDownspoutCount] = useState(
    (existing as unknown as { downspoutCount?: number } | undefined)?.downspoutCount != null
      ? String((existing as unknown as { downspoutCount?: number }).downspoutCount)
      : "0",
  );

  // 옥탑 구조물 — 높이 / 문 / 창문 (rooftopStructure scope row 아래에 표시)
  const [rooftopHeightInput, setRooftopHeightInput] = useState(
    (existing as unknown as { rooftopStructureHeightCm?: number } | undefined)?.rooftopStructureHeightCm != null
      ? String((existing as unknown as { rooftopStructureHeightCm?: number }).rooftopStructureHeightCm)
      : "250",
  );
  const [rooftopDoorCount, setRooftopDoorCount] = useState(
    (existing as unknown as { rooftopDoorCount?: number } | undefined)?.rooftopDoorCount != null
      ? String((existing as unknown as { rooftopDoorCount?: number }).rooftopDoorCount)
      : "1",
  );
  const [rooftopWindowCount, setRooftopWindowCount] = useState(
    (existing as unknown as { rooftopWindowCount?: number } | undefined)?.rooftopWindowCount != null
      ? String((existing as unknown as { rooftopWindowCount?: number }).rooftopWindowCount)
      : "0",
  );
  // 단열재 multi-select. 기존 견적의 insulationTypes 가 있으면 우선, 없는데 hasInsulation=true 면 ["other"] 로 시드.
  const [insulationTypes, setInsulationTypes] = useState<InsulationType[]>(() => {
    const stored = (existing as unknown as { insulationTypes?: unknown })?.insulationTypes;
    if (Array.isArray(stored) && stored.length > 0) return stored as InsulationType[];
    return existing?.hasInsulation ? ["other"] : [];
  });

  function toggleInsulationType(t: InsulationType) {
    setInsulationTypes((arr) => arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]);
  }
  // 단열재 노트 (기타 선택 시) + 섹션 펼침 상태
  const [insulationNote, setInsulationNote] = useState(
    (existing as unknown as { insulationNote?: string } | undefined)?.insulationNote ?? "",
  );
  const [showInsulation, setShowInsulation] = useState(
    (Array.isArray((existing as unknown as { insulationTypes?: unknown })?.insulationTypes) &&
      ((existing as unknown as { insulationTypes?: unknown[] }).insulationTypes?.length ?? 0) > 0) ||
    !!existing?.hasInsulation,
  );

  // PE폼 부착 — 강판 결로/소음 방지. 강판 면적과 동일 비율로 추가 단가.
  // 기본 true (대부분 시공에 PE폼 들어감 — 사용자 요청).
  const [hasPeFoam, setHasPeFoam] = useState(
    (existing as unknown as { hasPeFoam?: boolean } | undefined)?.hasPeFoam ?? true,
  );

  // 지붕 형태 — 옵션이라 접힘 기본. 기타 선택 시 노트 입력 가능.
  // 용마루 수는 UI 에서 빠짐 — 항상 1 로 가정. 2동 건물은 사용자가 라인 직접 수정.
  const [roofShapeNote, setRoofShapeNote] = useState(
    (existing as unknown as { roofShapeNote?: string } | undefined)?.roofShapeNote ?? "",
  );
  const [showRoofDetails, setShowRoofDetails] = useState(!!existing?.roofShape);

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
  // 차양 물받이 (스틸방수 옵션) — 거의 안 써서 기본 접힘. 기존값 있으면 펼침.
  const [showAwningGutter, setShowAwningGutter] = useState(
    !!(existing && existing.constructionType === "steelWaterproof" && existing.gutterLengthM),
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
  // 처마/덴조 건수 (eave 시공)
  const [denjoCount, setDenjoCount] = useState(
    (existing as unknown as { denjoCount?: number } | undefined)?.denjoCount ? String((existing as unknown as { denjoCount?: number }).denjoCount) : "1",
  );

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
  const [catalogModes, setCatalogModes] = useState<GroupModesMap>(
    (existing?.catalogModes as unknown as GroupModesMap) ?? {},
  );

  // Step 9: 기타 비용 — not stored separately on Estimate; only relevant for new creation.
  // On edit, we don't preserve these (they were already turned into line items at create time).
  const [extraCosts, setExtraCosts] = useState<ExtraCost[]>([]);

  // Pricing overrides — per-estimate price replacements (settings stay unchanged)
  const [pricingOverrides, setPricingOverrides] = useState<PricingOverrides>(
    (existing?.pricingOverrides as unknown as PricingOverrides) ?? {},
  );

  // 부재별 마감 방식 (절곡/기성품) — 키 없으면 자재 타입 default (기와형 → 기성품).
  // 사용자가 명시적으로 고른 부재만 저장 → 자재를 바꾸면 안 고른 부재는 default 따라감.
  const [finishingMethods, setFinishingMethods] = useState<FinishingMethods>(
    (existing?.finishingMethods as unknown as FinishingMethods) ?? {},
  );
  function setFinishingMethod(member: FinishingMember, method: FinishingMethod) {
    setFinishingMethods((prev) => ({ ...prev, [member]: method }));
  }

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
    // 스틸방수 + 난간/두겁 활성: 난간 둘레 필수 (예전 capLength 가 아니라 railPerimeter)
    if (constructionType === "steelWaterproof" && (scope.handrail || scope.cap)) {
      const rail = parseFloat(railPerimeterInput) || 0;
      if (rail <= 0) { toast.error("난간 둘레를 입력해 주세요"); return; }
    }
    // 스틸방수 + 스테인리스 배수로 0: 확인 다이얼로그로 넘어가게 (실수 방지)
    if (constructionType === "steelWaterproof") {
      const drainLen = parseFloat(stainlessDrainLength) || 0;
      if (drainLen <= 0) {
        const ok = window.confirm("스테인리스 배수로 길이가 0입니다.\n정말 시공 안 하시나요? (예 = 계속 진행)");
        if (!ok) return;
      }
    }

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
      // 물받이 — 지붕/옥상지붕은 면 선택 기반, 스틸방수는 차양 물받이(접힘 옵션, gutterLength 재사용).
      gutterMode: constructionType === "steelWaterproof"
        ? (showAwningGutter && (parseFloat(gutterLength) || 0) > 0 ? "full" : null)
        : (gutterSides.size === 0 ? null : serializeGutterSides(gutterSides)),
      gutterLengthM: constructionType === "steelWaterproof"
        ? (showAwningGutter ? (parseFloat(gutterLength) || 0) : 0)
        : (gutterSides.size === 0 ? 0 : parseFloat(gutterLength) || 0),
      stainlessDrainLengthM: constructionType === "steelWaterproof"
        ? parseFloat(stainlessDrainLength) || 0
        : 0,
      capLengthM: (scope.cap || scope.handrail) ? parseFloat(capLength) || 0 : 0,
      drainHoleCount: scope.drainHole ? Math.max(1, parseInt(drainHoles) || 1) : 0,
      endCapCount: scope.endCap ? Math.max(1, parseInt(endCaps) || 1) : 0,
      denjoCount: scope.eave ? Math.max(1, parseInt(denjoCount) || 1) : 0,
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
      finishingMethods,
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
      // 처마 돌출은 지붕공사(roof)만. 옥상지붕은 시공면적에 포함, 스틸방수는 평지붕.
      eaveOverhangCm: constructionType === "roof"
        ? (parseInt(eaveOverhangInput) || 0)
        : 0,
      // 스틸방수 전용 — 난간/옥탑 둘레 직접 입력 + 홈통 개수
      railPerimeterM: constructionType === "steelWaterproof"
        ? (parseFloat(railPerimeterInput) || 0)
        : null,
      rooftopStructurePerimeterM: constructionType === "steelWaterproof" && scope.rooftopStructure
        ? (parseFloat(rooftopPerimeterInput) || 0)
        : null,
      rooftopStructureHeightCm: constructionType === "steelWaterproof" && scope.rooftopStructure
        ? (parseInt(rooftopHeightInput) || 0)
        : null,
      rooftopDoorCount: constructionType === "steelWaterproof" && scope.rooftopStructure
        ? (parseInt(rooftopDoorCount) || 0)
        : 0,
      rooftopWindowCount: constructionType === "steelWaterproof" && scope.rooftopStructure
        ? (parseInt(rooftopWindowCount) || 0)
        : 0,
      downspoutCount: constructionType === "steelWaterproof"
        ? (parseInt(downspoutCount) || 0)
        : 0,
      hasInsulation: insulationTypes.length > 0,
      insulationTypes,
      insulationNote: insulationTypes.includes("other") ? insulationNote : null,
      roofShapeNote: roofShape === "other" ? roofShapeNote : null,
      hasPeFoam,
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

  // 건물 둘레 자동 채움:
  //   - 건물형태(ㅁ/ㄱ/ㄷ)가 바뀌면 → 추정 둘레로 항상 덮어씀 (사용자가 적어 넣었어도 OK)
  //   - 면적만 바뀌고 형태 그대로면 → 둘레가 비어 있을 때만 채움 (수동 입력 보존)
  const prevShapeRef = useRef<BuildingShape | null>(buildingShape);
  useEffect(() => {
    if (!buildingShape) return;
    const sqm = parseFloat(sqmInput) || 0;
    if (sqm <= 0) return;
    const bSqm = showBuildingArea && buildingSqmInput ? parseFloat(buildingSqmInput) || 0 : 0;
    const est = constructionType
      ? Math.round(estimateBasePerimeter(constructionType, sqm, buildingShape, bSqm > 0 ? bSqm : null))
      : 0;
    if (est <= 0) return;

    const shapeChanged = prevShapeRef.current !== buildingShape;
    prevShapeRef.current = buildingShape;

    if (shapeChanged || !perimeterInput) {
      setPerimeterInput(String(est));
    }
  }, [buildingShape, sqmInput, buildingSqmInput, showBuildingArea, perimeterInput, constructionType]);

  // 물받이 총 길이 자동 계산 (장단비 1.5 가정 → 앞/뒤 30%, 좌/우 20%):
  //   - 면 선택 (gutterSides) 이 바뀔 때마다 다시 계산 (사용자가 직접 입력했어도 덮어씀)
  //   - 둘레/처마 돌출만 바뀌면 면이 1개 이상 선택돼 있을 때만 갱신 (수동 입력 보존)
  //   - 스틸방수는 물받이 없음 → 적용 안 함
  const prevGutterSerializedRef = useRef<string>("");
  useEffect(() => {
    if (constructionType === "steelWaterproof") return;
    const sqm = parseFloat(sqmInput) || 0;
    // 처마 돌출은 지붕공사(roof)만 둘레에 더함. 옥상지붕은 시공면적에 포함.
    const overhangCm = constructionType === "roof" ? (parseInt(eaveOverhangInput) || 0) : 0;
    const inputPerim = parseFloat(perimeterInput) || 0;
    if (sqm <= 0 || !buildingShape || inputPerim <= 0) return;
    // 처마 외곽 둘레 사용 (물받이는 처마 끝에 달림)
    const eavePerim = inputPerim + 8 * (overhangCm / 100);
    const weight = Array.from(gutterSides).reduce((sum, s) => sum + GUTTER_SIDE_WEIGHTS[s], 0);
    // m 단위 정수 반올림 (둘레와 동일한 정밀도)
    const estLen = Math.round(eavePerim * weight);

    const serialized = Array.from(gutterSides).sort().join(",");
    const sidesChanged = prevGutterSerializedRef.current !== serialized;
    prevGutterSerializedRef.current = serialized;

    // 면이 0개면 아무 값도 세팅 안 함 (gutterLength 그대로 둠 — UI 가 어차피 안 보임)
    if (gutterSides.size === 0) return;
    if (sidesChanged || !gutterLength) {
      setGutterLength(String(estLen));
    }
  }, [gutterSides, perimeterInput, eaveOverhangInput, sqmInput, buildingShape, constructionType, gutterLength]);

  // Effective prices for inline display — settings with overrides merged on top.
  // useMemo 로 메모이즈 — pricingOverrides 가 안 바뀌면 재계산 안 함 (폼 다른 필드 입력 시).
  const eff = useMemo(
    () => applyOverrides(settings, pricingOverrides),
    [settings, pricingOverrides],
  );

  return (
    <>
      <div className="space-y-3 pb-32">
        {/* STEP 1: Construction type — 영업 대화 순서대로 유형부터 */}
        <Section icon={<Building2 size={18} />} title="공사 유형" step={1}>
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

        {/* STEP 2: Area */}
        <Section icon={<Ruler size={18} />} title="면적" step={2}>
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
            건물 면적 (옵션)
          </button>

          {showBuildingArea && (
            <div className="mt-3 pt-3 border-t border-border/40">
              <div className="grid grid-cols-2 gap-2.5">
                <UnitInput label="평" unit="평" value={buildingPyeongInput} onChange={handleBuildingPyeongChange} />
                <UnitInput label="㎡" unit="㎡" value={buildingSqmInput} onChange={handleBuildingSqmChange} />
              </div>
            </div>
          )}
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
                    className={`pressable rounded-2xl py-3 px-2 border-2 flex flex-col items-center gap-0.5 ${
                      buildingShape === s.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border/60 bg-card text-foreground"
                    }`}
                  >
                    <span className="text-sm font-semibold">{s.label}</span>
                    <span className="text-[10px] text-muted-foreground">{s.desc}</span>
                  </button>
                ))}
              </div>
              {/* 건물 둘레/처마 돌출은 지붕공사/옥상지붕만 — 스틸방수는 난간 둘레 직접 입력으로 대체 */}
              {buildingShape && constructionType !== "steelWaterproof" && (
                <div className="mt-4 pt-4 border-t border-border/40 space-y-4">
                  {(() => {
                    const sqm = parseFloat(sqmInput) || 0;
                    const bSqm = showBuildingArea && buildingSqmInput
                      ? parseFloat(buildingSqmInput) || 0
                      : 0;
                    const isRoof = constructionType === "roof";
                    const estPerim = (sqm > 0 && constructionType)
                      ? Math.round(estimateBasePerimeter(constructionType, sqm, buildingShape, bSqm > 0 ? bSqm : null))
                      : 0;
                    // 옥상지붕은 시공면적 자체가 지붕 footprint
                    const source = isRoof
                      ? (bSqm > 0 ? "건물면적" : "시공면적÷1.4")
                      : "시공면적 기준";
                    const overhangCm = isRoof ? (parseInt(eaveOverhangInput) || 0) : 0;
                    const currentPerim = parseFloat(perimeterInput) || estPerim;
                    const eavePerim = currentPerim > 0
                      ? Math.round(currentPerim + 8 * (overhangCm / 100))
                      : currentPerim;
                    return (
                      <>
                        <div>
                          <Label className="text-sm font-semibold text-foreground mb-1.5 block">
                            {isRoof ? "건물 둘레" : "지붕 둘레"}
                          </Label>
                          {estPerim > 0 && (
                            <p className="text-[11px] text-muted-foreground mb-2 tabular-nums">
                              추정 {estPerim}m ({source}) · 버튼으로 1m 씩 조정 또는 직접 입력
                            </p>
                          )}
                          <NumberStepper
                            value={perimeterInput}
                            onChange={setPerimeterInput}
                            min={5} max={999} step={1}
                            unit="m"
                          />
                        </div>
                        {/* 처마 돌출 — 지붕공사(roof)만. 옥상지붕은 시공면적에 이미 돌출 포함. */}
                        {isRoof && (
                        <div>
                          <Label className="text-sm font-semibold text-foreground mb-1.5 block">
                            처마 돌출 (사방)
                          </Label>
                          <p className="text-[11px] text-muted-foreground mb-2">
                            0 = 평지붕 · 50 = 일반 · 100 = 한옥 — 버튼으로 10cm 씩
                          </p>
                          <NumberStepper
                            value={eaveOverhangInput}
                            onChange={setEaveOverhangInput}
                            min={0} max={300} step={10}
                            unit="cm"
                          />
                          {currentPerim > 0 && overhangCm > 0 && (
                            <p className="text-[11px] text-muted-foreground mt-2 tabular-nums">
                              → 처마 외곽 둘레 <b>{eavePerim}m</b> (= {currentPerim} + 8 × {(overhangCm / 100).toFixed(2)})
                            </p>
                          )}
                        </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
              {/* 스틸방수: 건물 형태만 코너 수 (플래싱 계산)용으로 활용. 둘레/처마 입력 없음 */}
              {buildingShape && constructionType === "steelWaterproof" && (
                <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border/40">
                  스틸방수는 건물 형태만 플래싱 코너 계산에 사용. 둘레는 공사 범위 → 난간/두겁에서 직접 입력.
                </p>
              )}
            </Section>

            {/* STEP 2.7: 지붕 형태 — 지붕/옥상지붕 전용.
                스틸방수는 파라펫/난간 정보를 공사 범위 → 난간/두겁 row 아래에서 받음 */}
            {constructionType !== "steelWaterproof" && (
              <Section
                icon={<Layers size={18} />}
                title="지붕 형태 (옵션)"
                headerRight={
                  <CollapseToggle
                    open={showRoofDetails}
                    onToggle={() => {
                      if (showRoofDetails) {
                        setShowRoofDetails(false);
                        setRoofShape(null);
                        setRoofShapeNote("");
                      } else {
                        setShowRoofDetails(true);
                      }
                    }}
                  />
                }
              >
                <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                  용마루·처마 길이 + 강판 로스율 자동 계산
                  {roofShape && !showRoofDetails && (
                    <> · 선택됨: <b>{ROOF_SHAPES.find((s) => s.value === roofShape)?.label ?? roofShape}</b></>
                  )}
                </p>
                {showRoofDetails && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {ROOF_SHAPES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setRoofShape(roofShape === s.value ? null : s.value)}
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
                    {roofShape === "other" && (
                      <div className="mt-3 pt-3 border-t border-border/40">
                        <Label className="text-[10px] text-muted-foreground mb-1 block">
                          메모 — 어떤 형태인지 간략히
                        </Label>
                        <Input
                          value={roofShapeNote}
                          onChange={(e) => setRoofShapeNote(e.target.value)}
                          placeholder="예: 박공 + 한쪽 외쪽, ㄷ자 일부만 모임"
                          className="h-11 rounded-xl text-sm"
                        />
                      </div>
                    )}
                  </>
                )}
              </Section>
            )}

            {/* 공사 범위 — 건물 정보 다음, 메인 자재 입력 전에 받기 */}
            <Section icon={<ListChecks size={18} />} title="공사 범위">
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
                      {/* 용마루 마감 방식 칩은 여기 안 둠 — 자재 선택(3번)보다 앞이라
                          자재 기반 기본값이 의미를 잃고, 위쪽에서 몰래 바뀌는 문제
                          (2026-06-12 사용자 피드백). 5번 추가 자재 맨 위로 이동. */}
                      {/* 난간 / 두겁 활성 시 — 파라펫 높이 + 난간 둘레 */}
                      {key === "handrail" && scope.handrail && (
                        <div className="mt-3 ml-3 space-y-3 pt-3 border-t border-border/40">
                          <div>
                            <Label className="text-sm font-semibold text-foreground mb-1.5 block">
                              파라펫 높이
                            </Label>
                            <NumberStepper
                              value={parapetHeightInput}
                              onChange={setParapetHeightInput}
                              min={0} max={300} step={10}
                              unit="cm"
                            />
                          </div>
                          <div>
                            <Label className="text-sm font-semibold text-foreground mb-1.5 block">
                              난간 둘레
                            </Label>
                            <p className="text-[11px] text-muted-foreground mb-2">
                              외벽 + 계단 등 실제 난간 길이 (줄자로 측정)
                            </p>
                            <NumberStepper
                              value={railPerimeterInput}
                              onChange={setRailPerimeterInput}
                              min={0} max={999} step={1}
                              unit="m"
                            />
                          </div>
                          {/* 미시 마감 방식 칩은 안 둠 — 스틸방수에서 기성품 미시는 거의 안 씀
                              (사용자 확인 2026-06-12). 엔진은 finishingMethods.mishi 를 지원하므로
                              필요해지면 칩만 복원하면 됨. */}
                        </div>
                      )}
                      {/* 옥탑 구조물 활성 시 — 둘레 + 높이 + 문 + 창문 */}
                      {key === "rooftopStructure" && scope.rooftopStructure && (
                        <div className="mt-3 ml-3 space-y-3 pt-3 border-t border-border/40">
                          <div>
                            <Label className="text-sm font-semibold text-foreground mb-1.5 block">
                              옥탑 구조물 둘레
                            </Label>
                            <p className="text-[11px] text-muted-foreground mb-2">
                              계단실 / 창고 등 외벽 둘레 (줄자로 측정)
                            </p>
                            <NumberStepper
                              value={rooftopPerimeterInput}
                              onChange={setRooftopPerimeterInput}
                              min={0} max={999} step={1}
                              unit="m"
                            />
                          </div>
                          <div>
                            <Label className="text-sm font-semibold text-foreground mb-1.5 block">
                              옥탑 구조물 높이
                            </Label>
                            <p className="text-[11px] text-muted-foreground mb-2">
                              일반 옥탑방 ~250cm, 낮은 창고 ~150cm — 외벽 강판 면적 계산
                            </p>
                            <NumberStepper
                              value={rooftopHeightInput}
                              onChange={setRooftopHeightInput}
                              min={0} max={500} step={10}
                              unit="cm"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-sm font-semibold text-foreground mb-1.5 block">
                                출입문
                              </Label>
                              <p className="text-[10px] text-muted-foreground mb-2">
                                트림 절곡 (문당 ~6m)
                              </p>
                              <NumberStepper
                                value={rooftopDoorCount}
                                onChange={setRooftopDoorCount}
                                min={0} max={10} step={1}
                                unit="개"
                              />
                            </div>
                            <div>
                              <Label className="text-sm font-semibold text-foreground mb-1.5 block">
                                창문
                              </Label>
                              <p className="text-[10px] text-muted-foreground mb-2">
                                트림 절곡 (창당 ~4m)
                              </p>
                              <NumberStepper
                                value={rooftopWindowCount}
                                onChange={setRooftopWindowCount}
                                min={0} max={20} step={1}
                                unit="개"
                              />
                            </div>
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
                      {/* 처마/덴조 건수 — 건당 시공 */}
                      {key === "eave" && scope.eave && (
                        <div className="mt-2 ml-3">
                          <Label className="text-[10px] text-muted-foreground mb-1 block">
                            건수 ({(eff as unknown as { denjoPricePerUnit?: number }).denjoPricePerUnit?.toLocaleString("ko-KR") ?? "—"}원/건)
                          </Label>
                          <NumberStepper
                            value={denjoCount}
                            onChange={setDenjoCount}
                            min={1} max={20} step={1}
                            unit="건"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* ── 물받이 / 배수로 — 시공 범위의 일부라 공사 범위 바로 뒤에 배치 ──
                (물받이 부속 자재는 추가 자재 카탈로그 'gutter' 카테고리에 별도로 있음) */}
            {constructionType !== "steelWaterproof" ? (
              <Section icon={<CloudRain size={18} />} title="물받이">
                <Label className="text-[11px] text-muted-foreground mb-2 block">
                  설치 면 (전부 = 4면, 0개 = 안함)
                </Label>
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
                  <div className="mt-3">
                    <Label className="text-[11px] text-muted-foreground mb-1 block">
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
            ) : (
              <Section icon={<Waves size={18} />} title="배수로 / 물받이">
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-semibold text-foreground mb-1.5 block">
                      스테인리스 배수로 길이
                    </Label>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      옥상 바닥 배수로 · {eff.stainlessDrainPricePerM.toLocaleString("ko-KR")}원/m · 0 = 안함
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={stainlessDrainLength}
                        onChange={(e) => setStainlessDrainLength(e.target.value)}
                        placeholder="0"
                        className="h-11 rounded-xl tabular-nums flex-1"
                      />
                      <span className="text-sm text-muted-foreground font-medium w-6">m</span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border/40">
                    <Label className="text-sm font-semibold text-foreground mb-1.5 block">
                      홈통 개수
                    </Label>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      배수로에서 아래로 내려오는 홈통 · {eff.downspoutUnitPrice.toLocaleString("ko-KR")}원/개
                    </p>
                    <NumberStepper
                      value={downspoutCount}
                      onChange={setDownspoutCount}
                      min={0} max={30} step={1}
                      unit="개"
                    />
                  </div>
                  {/* 차양 물받이 (옵션) — 거의 안 써서 건물 면적처럼 접어둠 */}
                  <div className="pt-3 border-t border-border/40">
                    <button
                      type="button"
                      onClick={() => setShowAwningGutter((v) => !v)}
                      className="flex items-center gap-2 text-xs font-medium text-primary pressable"
                    >
                      <span className="w-5 h-5 rounded-md border border-primary/40 flex items-center justify-center text-[11px]">
                        {showAwningGutter ? "−" : "+"}
                      </span>
                      차양 물받이 (옵션)
                    </button>
                    {showAwningGutter && (
                      <div className="mt-3">
                        <p className="text-[11px] text-muted-foreground mb-2">
                          차양이 따로 있는 경우만 · {eff.gutterPricePerM.toLocaleString("ko-KR")}원/m · 0 = 안함
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={gutterLength}
                            onChange={(e) => setGutterLength(e.target.value)}
                            placeholder="0"
                            className="h-11 rounded-xl tabular-nums flex-1"
                          />
                          <span className="text-sm text-muted-foreground font-medium w-6">m</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {/* STEP 3: Steel sheet type */}
            <Section icon={<Hammer size={18} />} title="지붕재 (칼라강판) — 종류" step={3}>
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
              {/* PE폼 부착 — 공사 범위 체크박스 (ScopeRow) 스타일로 통일 */}
              <div className="mt-3 pt-3 border-t border-border/40">
                <ScopeRow
                  active={hasPeFoam}
                  label="PE폼 부착"
                  hint={`+${eff.peFoamPricePerSqm.toLocaleString("ko-KR")}원/㎡`}
                  onToggle={() => setHasPeFoam((v) => !v)}
                />
              </div>
            </Section>

            {/* STEP 4: Thickness */}
            <Section icon={<Layers size={18} />} title="강판 두께">
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">기본 0.45t</p>
              <div className="grid grid-cols-4 gap-2">
                {THICKNESSES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setThickness(t)}
                    className={`pressable rounded-xl px-2 py-2.5 text-sm font-semibold border ${
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
            <Section icon={<Palette size={18} />} title="색상 / 텍스처">
              <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">텍스처</Label>
              <div className="grid grid-cols-5 gap-1.5 mb-3">
                {TEXTURE_PRESETS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTextureChoice(t)}
                    className={`pressable rounded-xl px-2 py-2.5 text-sm font-semibold border ${
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
                  className={`pressable rounded-xl px-2 py-2.5 text-sm font-semibold border ${
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
                    className={`pressable rounded-xl px-2 py-2.5 text-sm font-semibold border ${
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
                  className={`pressable rounded-xl px-2 py-2.5 text-sm font-semibold border ${
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
                  className="mt-2.5 h-11 rounded-xl text-sm"
                />
              )}
            </Section>

            {/* 하지작업 (Substructure) */}
            <Section icon={<Pickaxe size={18} />} title="하지 작업" step={4}>
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
                강판 + 하지 자재에 적용 (자투리/낭비분). 부자재·소모품은 미포함 — 보통 10~15%
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

            {/* ── 부자재 영역 ── */}
            {/* STEP 5: Catalog — 추가 자재가 부자재 중 제일 중요 */}
            <Section icon={<Package size={18} />} title="추가 자재 / 부속" step={5}>
              {/* 용마루 마감 방식 — 자재 선택(3번) 뒤 + 마감재 카드 바로 위.
                  자재가 기본값을 정하고(징크250 등→절곡, 기와형→기성품),
                  사용자가 직접 탭한 선택은 자재를 바꿔도 절대 안 바뀜. */}
              {constructionType !== "steelWaterproof" && scope.ridge && (
                <div className="mb-3">
                  <Label className="text-sm font-semibold text-foreground mb-1.5 block">용마루 마감 방식</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([["bending", "절곡 제작"], ["ready", "기성품"]] as [FinishingMethod, string][]).map(([v, label]) => {
                      const active = resolveFinishingMethod("ridge", finishingMethods, materialType) === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setFinishingMethod("ridge", v)}
                          className={`pressable rounded-xl py-2.5 text-sm font-semibold border ${
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card text-foreground border-border/60"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {resolveFinishingMethod("ridge", finishingMethods, materialType) === "ready" && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      용마루 길이 ÷ 3m 규격 → 개수로 자동 환산
                    </p>
                  )}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                각 카테고리는 <b>심플</b>(한 줄 자동 계산) 또는 <b>상세</b>(항목별) 모드 토글.
                심플 = 빠름, 상세 = 정확. 단가는 모두 인라인 수정 가능.
              </p>
              <CatalogPicker
                selections={catalogSelections}
                onChange={setCatalogSelections}
                modes={catalogModes}
                onModesChange={setCatalogModes}
                defaults={(settings.catalogDefaults as GroupModesMap | null) ?? undefined}
                areaM2={parseFloat(sqmInput) || 0}
                gutterLengthM={gutterSides.size > 0 ? (parseFloat(gutterLength) || 0) : 0}
                materialTotalEstimate={Math.round((parseFloat(sqmInput) || 0) * eff.materialPricePerSqm)}
                categoryLabels={constructionType === "steelWaterproof" ? { gutter: "배수로 / 물받이 부속" } : undefined}
                finishingAutoHint={constructionType === "steelWaterproof"
                  ? ((scope.handrail || scope.cap)
                    ? "두겁·미시·프래싱 절곡은 난간/두겁 입력에서 자동 계산 중 — 여기서는 추가 마감재만 선택하세요."
                    : undefined)
                  : (scope.ridge
                    ? (resolveFinishingMethod("ridge", finishingMethods, materialType) === "ready"
                      ? "용마루 기성품은 위 '용마루 마감 방식'에서 자동 계산 중 — 여기서 용마루를 직접 고르면 자동 라인 대신 적용됩니다."
                      : "용마루 절곡은 위 '용마루 마감 방식'에서 자동 계산 중 — 여기서는 추가 기성품·추가 절곡만 선택하세요.")
                    : undefined)}
              />
            </Section>


            {/* ── 단열재 (옵션, 마지막) — 펼침/접기 + 기타 노트 ── */}
            <Section
              icon={<Package size={18} />}
              title="단열재 (옵션)"
              headerRight={
                <CollapseToggle
                  open={showInsulation}
                  onToggle={() => {
                    if (showInsulation) {
                      setShowInsulation(false);
                      setInsulationTypes([]);
                      setInsulationNote("");
                    } else {
                      setShowInsulation(true);
                    }
                  }}
                />
              }
            >
              <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                복수 선택 · 종류별 단가
                {insulationTypes.length > 0 && !showInsulation && (
                  <> · 선택됨: <b>{insulationTypes.length}종</b></>
                )}
              </p>
              {showInsulation && (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    {INSULATION_TYPES.map((t) => {
                      const active = insulationTypes.includes(t.value);
                      const priceKey = INSULATION_PRICE_KEY[t.value];
                      const price = (eff as unknown as Record<string, number>)[priceKey] || 0;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => toggleInsulationType(t.value)}
                          className={`pressable rounded-xl px-2 py-2 border flex flex-col items-center gap-0.5 ${
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card text-foreground border-border/60"
                          }`}
                        >
                          <span className="text-sm font-semibold">{t.label}</span>
                          {t.value !== "other" && price > 0 && (
                            <span className={`text-[10px] tabular-nums ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                              ㎡당 {price.toLocaleString("ko-KR")}원
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {insulationTypes.includes("other") && (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <Label className="text-[10px] text-muted-foreground mb-1 block">
                        기타 단열재 — 종류/규격 간략히
                      </Label>
                      <Input
                        value={insulationNote}
                        onChange={(e) => setInsulationNote(e.target.value)}
                        placeholder="예: 글라스울 50T"
                        className="h-11 rounded-xl text-sm"
                      />
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* STEP 7: Equipment — steppers */}
            <Section icon={<Wrench size={18} />} title="장비대" step={6}>
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

            {/* STEP 7: 노무비 — 작업 일수 × 인원 */}
            <Section icon={<Users size={18} />} title="노무비" step={7}>
              <div className="space-y-3">
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
            <Section icon={<Receipt size={18} />} title="기타 비용" step={8}>
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

function Section({ icon, title, step, headerRight, children }: {
  icon?: React.ReactNode;
  title: string;
  step?: number;
  /** Optional right-aligned action in the section header (e.g. 펼치기/접기 토글). */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        {step !== undefined && (
          <span className="w-7 h-7 rounded-full bg-primary text-white text-[13px] font-bold flex items-center justify-center shrink-0">
            {step}
          </span>
        )}
        {icon && <span className="text-primary">{icon}</span>}
        <h2 className="font-semibold text-foreground text-sm flex-1">{title}</h2>
        {headerRight}
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
 *
 * memo — props(overrides state / 안정 setter / settings)가 안정적이라
 * pricingOverrides 안 바뀌면 폼 다른 입력 시 재렌더링 스킵 (가격 필드 多 → 효과 큼).
 */
const PricingOverridesSection = memo(function PricingOverridesSection({
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
});

function UnitInput({ unit, value, onChange }: { label?: string; unit: string; value: string; onChange: (v: string) => void }) {
  // 단위는 input 안 우측에 표시되므로 위쪽 라벨은 제거 (중복 제거 — 사용자 요청).
  return (
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
  );
}

/**
 * 섹션 헤더 우측 토글 — 펼치기/접기 둘 다 같은 위치에 놔서 누르기 편하게.
 * Section 의 headerRight 슬롯에 넣어 사용.
 */
function CollapseToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-[11px] font-medium text-muted-foreground hover:text-foreground pressable flex items-center gap-0.5 shrink-0"
    >
      {open ? <><ChevronUp size={14} />접기</> : <>펼치기<ChevronDown size={14} /></>}
    </button>
  );
}

// memo — 강판 종류 등 chip 리스트에서 다른 칩 클릭 시 재렌더링 방지.
const ChipBtn = memo(function ChipBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable rounded-xl px-2 py-2.5 text-sm font-semibold border ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border/60"
      }`}
    >
      {label}
    </button>
  );
});

const ScopeRow = memo(function ScopeRow({ active, label, hint, onToggle }: { active: boolean; label: string; hint?: string; onToggle: () => void }) {
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
});

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
