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
  handrailAndCap?: boolean;      // 난간 및 두겁
  existingWaterproofRemoval?: boolean; // 기존 방수재 철거
  drainage?: boolean;            // 배수구 처리

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
  handrailAndCap: "난간 및 두겁",
  existingWaterproofRemoval: "기존 방수재 철거",
  drainage: "배수구 처리",
  waste: "폐기물 처리",
  skylift: "스카이차",
  ladderTruck: "사다리차",
  scaffold: "비계",
};

/** Which scope items are shown for each construction type, in display order. */
export const SCOPE_BY_TYPE: Record<ConstructionType, (keyof ScopeFlags)[]> = {
  roof: ["overlay", "removal", "ridge", "eave", "gutter", "waste"],
  rooftopRoof: ["frameReinforcement", "ridge", "eave", "gutter", "waste"],
  steelWaterproof: ["handrailAndCap", "existingWaterproofRemoval", "drainage", "waste"],
};

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
