export type ConstructionType = "roof" | "steelWaterproof" | "rooftopRoof";

export const CONSTRUCTION_TYPES: { value: ConstructionType; label: string; desc: string; icon: string }[] = [
  { value: "roof", label: "지붕공사", desc: "칼라강판 지붕 시공", icon: "🏠" },
  { value: "steelWaterproof", label: "옥상방수 (바닥형)", desc: "옥상 바닥 스틸방수 시공", icon: "🟦" },
  { value: "rooftopRoof", label: "옥상지붕 (지붕형)", desc: "옥상에 새 지붕을 만들기", icon: "🏢" },
];

export type MaterialType =
  | "slate"            // 슬레이트골
  | "v250"             // V250
  | "zinc250"          // 징크250
  | "generalTile"      // 일반기와형
  | "traditionalTile"  // 전통기와형
  | "realZinc"         // 리얼징크 (standing seam)
  | "other";

export const MATERIAL_TYPES: { value: MaterialType; label: string }[] = [
  { value: "slate", label: "슬레이트골" },
  { value: "v250", label: "V250" },
  { value: "zinc250", label: "징크250" },
  { value: "generalTile", label: "일반기와형" },
  { value: "traditionalTile", label: "전통기와형" },
  { value: "realZinc", label: "리얼징크" },
  { value: "other", label: "기타" },
];

export type Thickness = "0.4" | "0.45" | "0.5" | "0.6";

export const THICKNESSES: Thickness[] = ["0.4", "0.45", "0.5", "0.6"];

/**
 * 건물 평면 형태 — 자재 자동 추정에 사용.
 * 둘레 추정 + 코너/꺾임 카운트로 프래싱 길이 산정에 영향.
 */
export type BuildingShape = "rectangle" | "lshape" | "ushape";

export const BUILDING_SHAPES: { value: BuildingShape; label: string; icon: string; desc: string }[] = [
  { value: "rectangle", label: "ㅁ자",  icon: "ㅁ", desc: "사각 / 직사각" },
  { value: "lshape",    label: "ㄱ자",  icon: "ㄱ", desc: "L자 꺾임" },
  { value: "ushape",    label: "ㄷ자",  icon: "ㄷ", desc: "U자 꺾임" },
];

/**
 * 지붕 형태 — 자재 자동 추정에 사용 (지붕공사 / 옥상지붕만, 스틸방수는 없음).
 * 용마루/처마 길이 비율 + 강판 로스율에 영향.
 *
 * "complex" 는 구버전 enum — 신규 폼에는 노출 안 함. 기존 견적 호환용으로만 유지.
 */
export type RoofShape = "gable" | "hip" | "halfHip" | "shed" | "mansard" | "complex";

export const ROOF_SHAPES: { value: RoofShape; label: string; desc: string }[] = [
  { value: "gable",   label: "박공",   desc: "△ 양면 경사" },
  { value: "hip",     label: "모임",   desc: "사방 경사" },
  { value: "halfHip", label: "팔작",   desc: "박공 + 모임" },
  { value: "shed",    label: "외쪽",   desc: "한쪽만 경사" },
  { value: "mansard", label: "멘사드", desc: "2단 꺾임" },
];

/**
 * 베이스라인 매트릭스 한 칸 — 실제 시공 데이터 (포스코지붕공사 등) 기반.
 * 모두 optional — 사용자가 채운 칸만 우선 사용, 빈 칸은 기하학적 추정 fallback.
 */
export interface BaselineEntry {
  bendingTotalM?: number;        // 총 절곡 m수 (참고용)
  ridgeBendingM?: number;        // 용마루 절곡 m
  eaveBendingM?: number;         // 처마 절곡 m
  capBendingM?: number;          // 두겁 절곡 m (스틸방수)
  mishiBendingM?: number;        // 미시 절곡 m (스틸방수)
  flashingBendingM?: number;     // 프래싱 m
  materialLossRate?: number;     // 강판 로스율 (0.07 = 7%)
  parapetAreaM2?: number;        // 파라펫 강판 면적 (스틸방수)
  screwLarge?: number;
  screwSmall?: number;
  siliconeUnits?: number;
}

/**
 * PricingSettings.baselineData 의 JSON shape.
 * 평수 → 건물형태 → 지붕형태 (또는 스틸방수는 평수 → 건물형태) 트리.
 */
export interface BaselineData {
  roof?: Partial<Record<string, Partial<Record<BuildingShape, Partial<Record<RoofShape, BaselineEntry>>>>>>;
  rooftopRoof?: Partial<Record<string, Partial<Record<BuildingShape, Partial<Record<RoofShape, BaselineEntry>>>>>>;
  steelWaterproof?: Partial<Record<string, Partial<Record<BuildingShape, BaselineEntry>>>>;
}

/** 베이스라인 매트릭스 기준 평수 — 30/50/80/150 */
export const BASELINE_AREAS = [30, 50, 80, 150] as const;

export type SubstructureType = "wood" | "steel";

export const SUBSTRUCTURE_OPTIONS: { value: SubstructureType | "none"; label: string; icon: string }[] = [
  { value: "wood",  label: "목재",  icon: "🪵" },
  { value: "steel", label: "철재",  icon: "🔩" },
  { value: "none",  label: "없음",  icon: "—" },
];

/**
 * Gutter sides — multi-select. Stored as a comma-separated string on
 * Estimate.gutterMode for back-compat with the old single-value enum.
 *   "none" or null → no gutter
 *   "full"          → all 4 sides (legacy alias, kept for old data)
 *   "front,back,left,right" or any subset → just those sides
 */
export type GutterSide = "front" | "back" | "left" | "right";

export const GUTTER_SIDES: GutterSide[] = ["front", "back", "left", "right"];

export const GUTTER_SIDE_LABELS: Record<GutterSide, string> = {
  front: "앞",
  back: "뒤",
  left: "좌",
  right: "우",
};

/** Parse a stored gutterMode value into the set of selected sides. */
export function parseGutterSides(stored: string | null | undefined): Set<GutterSide> {
  if (!stored || stored === "none") return new Set();
  if (stored === "full") return new Set(GUTTER_SIDES);
  const parts = stored.split(",").map((s) => s.trim()).filter(Boolean);
  return new Set(parts.filter((p): p is GutterSide => GUTTER_SIDES.includes(p as GutterSide)));
}

/** Serialize a side set back into a stored gutterMode string. */
export function serializeGutterSides(sides: Set<GutterSide> | GutterSide[]): string {
  const arr = Array.from(sides);
  if (arr.length === 0) return "none";
  if (arr.length === GUTTER_SIDES.length) return "full";
  // Preserve canonical order so PDF labels are stable
  return GUTTER_SIDES.filter((s) => arr.includes(s)).join(",");
}

/** Human-readable label for a side set — used on the customer PDF. */
export function gutterSidesLabel(sides: Set<GutterSide>): string {
  if (sides.size === 0) return "안함";
  if (sides.size === GUTTER_SIDES.length) return "전체";
  return GUTTER_SIDES.filter((s) => sides.has(s)).map((s) => GUTTER_SIDE_LABELS[s]).join(", ");
}

/** @deprecated kept so existing imports still type-check; use GutterSide instead */
export type GutterMode = string;

/** Standard texture presets. Order = display order; first item is the
 *  new-estimate default (스톤 is what the user picks most often). */
export const TEXTURE_PRESETS = [
  "스톤",
  "유광",
  "무광",
] as const;

/** Standard color presets for color steel. The user picks one or "기타" for free input. */
export const COLOR_PRESETS = [
  "진밤색",   // 기본 (= 다크브라운)
  "밤색",
  "차콜",
  "진회색",
  "은회색",
  "적갈색",
  "녹색",
  "청색",
  "백색",
] as const;

export const DEFAULT_COLOR = "진밤색";

/** Free-form misc line item added by the user (기타 비용). */
export interface ExtraCost {
  name: string;
  amount: number;
  note?: string;
}

/**
 * Per-estimate price overrides — these temporarily replace fields from
 * PricingSettings for one estimate only. Settings itself is never modified.
 * Only price fields are overridable; non-price config (companyName, etc.)
 * is not in this shape.
 */
export interface PricingOverrides {
  materialPricePerSqm?: number;
  accessoryRate?: number;
  ridgePricePerM?: number;
  eavePricePerM?: number;
  gutterPricePerM?: number;
  removalPricePerSqm?: number;
  wasteDisposalCost?: number;
  dailyWage?: number;
  skyliftDailyCost?: number;
  ladderTruckDailyCost?: number;
  scaffoldDailyCost?: number;
  scaffoldPricePerSqmDay?: number;
  baseTransportCost?: number;
  mealCostPerPersonMeal?: number;
  lodgingCostPerPersonNight?: number;
  substructureWoodPricePerSqm?: number;
  substructureSteelPricePerSqm?: number;
  drainHolePrice?: number;
  capBendingPricePerM?: number;
  stainlessDrainPricePerM?: number;
}

/** Field definitions for the override UI — grouped by concern. */
export const PRICING_OVERRIDE_GROUPS: { group: string; icon: string; fields: { key: keyof PricingOverrides; label: string; unit: string; pct?: boolean }[] }[] = [
  {
    group: "자재 단가",
    icon: "🧱",
    fields: [
      { key: "materialPricePerSqm", label: "칼라강판 ㎡당 (0.45t 기준)", unit: "원" },
      { key: "accessoryRate", label: "부자재 비율", unit: "%", pct: true },
      { key: "ridgePricePerM", label: "용마루 m당", unit: "원" },
      { key: "eavePricePerM", label: "처마 마감 m당", unit: "원" },
      { key: "gutterPricePerM", label: "물받이 m당", unit: "원" },
      { key: "removalPricePerSqm", label: "철거 ㎡당", unit: "원" },
      { key: "wasteDisposalCost", label: "폐기물 트럭 1차당", unit: "원" },
    ],
  },
  {
    group: "하지 / 스틸방수",
    icon: "🪵",
    fields: [
      { key: "substructureWoodPricePerSqm", label: "목재 하지 ㎡당", unit: "원" },
      { key: "substructureSteelPricePerSqm", label: "철재 하지 ㎡당", unit: "원" },
      { key: "drainHolePrice", label: "새 배수구 타공 (개당)", unit: "원" },
      { key: "capBendingPricePerM", label: "두겁 절곡 m당", unit: "원" },
      { key: "stainlessDrainPricePerM", label: "스테인리스 배수로 m당", unit: "원" },
    ],
  },
  {
    group: "인건 / 체류",
    icon: "👷",
    fields: [
      { key: "dailyWage", label: "1인 1일 인건비", unit: "원" },
      { key: "mealCostPerPersonMeal", label: "1인 1식 식비", unit: "원" },
      { key: "lodgingCostPerPersonNight", label: "1인 1박 숙박비", unit: "원" },
    ],
  },
  {
    group: "장비 / 운송",
    icon: "🏗️",
    fields: [
      { key: "skyliftDailyCost", label: "스카이차 1일", unit: "원" },
      { key: "ladderTruckDailyCost", label: "사다리차 1일", unit: "원" },
      { key: "scaffoldPricePerSqmDay", label: "비계 ㎡·일당", unit: "원" },
      { key: "baseTransportCost", label: "기본 운송비", unit: "원" },
    ],
  },
];

/**
 * Wide ScopeFlags union — fields are nullable; only the ones relevant
 * to the chosen ConstructionType are shown in the form and used in
 * line-item calculation.
 */
export interface ScopeFlags {
  // — Roof (지붕공사) & RooftopRoof (옥상지붕) shared —
  overlay?: boolean;             // 기존 지붕 덧씌우기 (roof only)
  removal?: boolean;             // 기존 지붕 철거 (roof only)
  ridge?: boolean;               // 용마루 마감
  eave?: boolean;                // 처마 마감
  gutter?: boolean;              // 물받이 교체 (with length)
  frameReinforcement?: boolean;  // 골조 보강 (rooftopRoof only)

  // — Steel Waterproof (옥상방수 바닥형) —
  handrailAndCap?: boolean;      // [DEPRECATED] legacy combined flag — kept for back-compat
  handrail?: boolean;            // 난간 (시공면적에 포함된 것으로 가정)
  cap?: boolean;                 // 두겁 (절곡 — m당 별도 단가)
  drainHole?: boolean;           // 새 배수구 타공 (개당 단가 × 개수)
  endCap?: boolean;              // 엔드캡 (개당 단가 × 개수) — roof / rooftopRoof
  existingWaterproofRemoval?: boolean; // [DEPRECATED] 기존 방수재 철거 — 사용자가 빼달라고 함
  drainage?: boolean;            // 배수구 처리

  // — Rooftop "included in 시공면적" annotations —
  // These are just notes that say "the user-entered 시공면적 already covers this".
  // No multipliers, no separate area calculation.
  // [DEPRECATED] warehouse / stairwell / rooftopRoom — kept for back-compat with
  // old estimates. New estimates use rooftopStructure (옥탑 구조물) as a unified flag.
  warehouse?: boolean;
  stairwell?: boolean;
  rooftopRoom?: boolean;
  /** 옥탑 구조물 포함 (창고 / 계단실 / 옥탑방 등 통칭) — 시공면적에 포함된 것으로 가정 */
  rooftopStructure?: boolean;

  // — Common —
  waste?: boolean;               // 폐기물 처리

  // — Equipment usage flags (days are stored on Estimate directly) —
  skylift?: boolean;
  ladderTruck?: boolean;
  scaffold?: boolean;
}

export const SCOPE_LABELS: Record<keyof ScopeFlags, string> = {
  overlay: "기존 지붕 덧씌우기",
  removal: "기존 지붕 철거",
  ridge: "용마루 마감",
  eave: "처마 / 덴조 마감",
  endCap: "엔드캡",
  gutter: "물받이 교체",
  frameReinforcement: "골조 보강",
  handrailAndCap: "난간 및 두겁 포함",
  handrail: "난간 / 두겁 (절곡)",
  cap: "두겁 (절곡)",
  drainHole: "새 배수구 타공",
  existingWaterproofRemoval: "기존 방수재 철거",
  drainage: "배수구 처리",
  warehouse: "창고 포함",
  stairwell: "계단실 포함",
  rooftopRoom: "옥탑방 포함",
  rooftopStructure: "옥탑 구조물 포함",
  waste: "폐기물 처리",
  skylift: "스카이차",
  ladderTruck: "사다리차",
  scaffold: "비계",
};

/**
 * Hint text for scope items that are "이 면적은 시공면적에 포함됨" annotations.
 * Shown under the label so the user knows these don't add to the calculation —
 * they're notes that flow into the work scope description on the PDF.
 */
export const SCOPE_HINTS: Partial<Record<keyof ScopeFlags, string>> = {
  handrail: "두겁 절곡 자동 포함 (절곡 길이 × m당 단가)",
  cap: "절곡 길이 × m당 단가로 별도 계산",
  warehouse: "시공면적에 포함하여 입력하세요",
  stairwell: "시공면적에 포함하여 입력하세요",
  rooftopRoom: "시공면적에 포함하여 입력하세요",
  rooftopStructure: "창고 / 계단실 / 옥탑방 등 — 시공면적에 포함하여 입력",
  drainHole: "1개당 단가 × 개수",
  endCap: "1개당 단가 × 개수",
};

/** Which scope items are shown for each construction type, in display order.
 *  Note: 물받이 was moved out of scope flags into its own GutterMode picker. */
export const SCOPE_BY_TYPE: Record<ConstructionType, (keyof ScopeFlags)[]> = {
  roof: ["overlay", "removal", "ridge", "eave", "endCap", "waste"],
  rooftopRoof: ["ridge", "eave", "endCap", "waste"],
  // 난간 토글 시 두겁(cap)이 SCOPE_FORCES 로 자동 켜지므로 cap 은 별도 표시 안 함.
  // 창고/계단실/옥탑방은 rooftopStructure 로 통합.
  steelWaterproof: ["handrail", "drainHole", "rooftopStructure", "waste"],
};

/** Mutually exclusive scope item pairs — checking one auto-unchecks the other.
 *  e.g. 덧씌우기 and 철거 — you do one or the other, never both. */
export const SCOPE_MUTEX: Partial<Record<keyof ScopeFlags, keyof ScopeFlags>> = {
  overlay: "removal",
  removal: "overlay",
};

/** Forced dependencies — checking the key auto-checks the value.
 *  e.g. 난간 공사하면 두겁이 필수 (water leaks otherwise). */
export const SCOPE_FORCES: Partial<Record<keyof ScopeFlags, keyof ScopeFlags>> = {
  handrail: "cap",
};

/** Scope items that need an inline numeric input. (None right now — 물받이 was
 *  moved to its own picker. Kept for future use.) */
export const SCOPE_WITH_INPUT: Partial<Record<keyof ScopeFlags, { unit: string; placeholder: string }>> = {};

export interface PhotoItem {
  url: string;
  memo?: string;
}

export type MarginMode = "percent" | "amount" | "finalPrice";

export type LineItemCategory =
  | "material"
  | "labor"
  | "equipment"
  | "transport"
  | "meals"
  | "lodging"
  | "waste"
  | "removal"
  | "other";
