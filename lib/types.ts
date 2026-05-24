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
  { value: "realZinc", label: "리얼징크 (Standing Seam)" },
  { value: "other", label: "기타" },
];

export type Thickness = "0.4" | "0.45" | "0.5" | "0.6";

export const THICKNESSES: Thickness[] = ["0.4", "0.45", "0.5", "0.6"];

export type SubstructureType = "wood" | "steel";

export const SUBSTRUCTURE_OPTIONS: { value: SubstructureType | "none"; label: string; icon: string }[] = [
  { value: "none",  label: "없음",  icon: "—" },
  { value: "wood",  label: "목재",  icon: "🪵" },
  { value: "steel", label: "철재",  icon: "🔩" },
];

export type GutterMode = "none" | "full" | "front" | "back";

export const GUTTER_MODE_OPTIONS: { value: GutterMode; label: string }[] = [
  { value: "none",  label: "안함" },
  { value: "full",  label: "전체" },
  { value: "front", label: "앞만" },
  { value: "back",  label: "뒤만" },
];

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
  existingWaterproofRemoval?: boolean; // [DEPRECATED] 기존 방수재 철거 — 사용자가 빼달라고 함
  drainage?: boolean;            // 배수구 처리

  // — Rooftop "included in 시공면적" annotations —
  // These are just notes that say "the user-entered 시공면적 already covers this".
  // No multipliers, no separate area calculation.
  warehouse?: boolean;     // 창고 포함
  stairwell?: boolean;     // 계단실 포함
  rooftopRoom?: boolean;   // 옥탑방 포함

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
  eave: "처마 마감",
  gutter: "물받이 교체",
  frameReinforcement: "골조 보강",
  handrailAndCap: "난간 및 두겁 포함",
  handrail: "난간 포함",
  cap: "두겁 (절곡)",
  drainHole: "새 배수구 타공",
  existingWaterproofRemoval: "기존 방수재 철거",
  drainage: "배수구 처리",
  warehouse: "창고 포함",
  stairwell: "계단실 포함",
  rooftopRoom: "옥탑방 포함",
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
  handrail: "시공면적에 포함하여 입력하세요 (난간 시공 시 두겁 자동 추가)",
  cap: "절곡 길이 × m당 단가로 별도 계산",
  warehouse: "시공면적에 포함하여 입력하세요",
  stairwell: "시공면적에 포함하여 입력하세요",
  rooftopRoom: "시공면적에 포함하여 입력하세요",
  drainHole: "1개당 단가 × 개수",
};

/** Which scope items are shown for each construction type, in display order.
 *  Note: 물받이 was moved out of scope flags into its own GutterMode picker (안함/전체/앞만/뒤만). */
export const SCOPE_BY_TYPE: Record<ConstructionType, (keyof ScopeFlags)[]> = {
  roof: ["overlay", "removal", "ridge", "eave", "waste"],
  rooftopRoof: ["frameReinforcement", "ridge", "eave", "warehouse", "stairwell", "rooftopRoom", "waste"],
  steelWaterproof: ["handrail", "cap", "drainHole", "drainage", "warehouse", "stairwell", "rooftopRoom", "waste"],
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
