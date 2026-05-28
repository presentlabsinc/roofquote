/**
 * 자재 카탈로그 — 사전 정의된 부자재 / 마감재 / 물받이 부속 / 절곡 항목 리스트.
 *
 * 견적 작성 시 사용자가 카탈로그에서 항목을 선택하고 수량을 입력하면
 * EstimateLineItem 으로 변환되어 견적에 포함됨. 각 항목의 단가는 견적 작성
 * 시점에 스냅샷되어 저장됨 (단가 변경이 기존 견적에 영향 주지 않음).
 *
 * 사용자는 단가를 새 견적 폼에서 인라인으로 override 할 수 있고,
 * 카탈로그에 없는 항목은 "+ 직접 추가" 로 자유 입력 가능.
 *
 * 단가는 한국 지붕공사 시장의 평균 추정치 — 업체별로 실제 단가는 다를 수 있음.
 */

export type CatalogCategory = "finishing" | "gutter" | "accessory" | "bending";

export const CATALOG_CATEGORIES: { value: CatalogCategory; label: string; icon: string; lineItemCategory: string }[] = [
  { value: "finishing", label: "마감재",      icon: "📐", lineItemCategory: "material" },
  { value: "gutter",    label: "물받이 부속", icon: "🌧️", lineItemCategory: "material" },
  { value: "accessory", label: "부자재",      icon: "🔩", lineItemCategory: "material" },
  // 절곡은 자재 카테고리 — 견적서 PDF 의 "자재공사" 그룹에 묶이도록 material 로 매핑.
  { value: "bending",   label: "절곡",        icon: "📏", lineItemCategory: "material" },
];

export interface CatalogItem {
  key: string;                 // 고유 식별자
  category: CatalogCategory;
  label: string;               // 표시 이름
  unit: string;                // "m", "개", "kg" 등
  price: number;               // 기본 단가 (원)
  sortOrder: number;
}

export interface CatalogSelection {
  category: CatalogCategory;
  key: string;                 // catalog item key (or custom-prefixed for user-added)
  label: string;               // snapshot
  unit: string;                // snapshot
  quantity: number;
  unitPrice: number;           // snapshot (may be overridden by user)
}

/** How a category's cost is summarized in 심플 모드. */
export type SimpleType = "percent" | "perSqm" | "perM" | "total";

/** Per-category mode configuration. */
export interface CategoryMode {
  /** When false, the category contributes nothing to the estimate. Defaults true.
   *  (Currently no UI exposes this — kept in schema in case we want it back.) */
  enabled?: boolean;
  mode: "simple" | "detailed";
  /** Used when mode === "simple" — the unit price or %  */
  simpleType?: SimpleType;
  simpleValue?: number;
  /** Used when mode === "simple" with perSqm/perM — the quantity (m or ㎡).
   *  When unset, falls back to the estimate's areaM2 (perSqm) or gutterLengthM (perM). */
  simpleQty?: number;
}

export type CategoryModesMap = Partial<Record<CatalogCategory, CategoryMode>>;

/**
 * Industry-typical defaults. New estimates start in 심플 모드 so the user
 * gets a sensible auto-calculated cost without picking individual items.
 * Switching to 상세 모드 reveals the catalog picker for that category.
 *
 * - finishing (마감재): per-㎡ of construction area (~5,000원/㎡ rough avg)
 * - gutter (물받이 부속): per-m of gutter length (~3,000원/m)
 * - accessory (부자재): percent of main material cost (~15%)
 * - bending (절곡): 총금액 lump sum (user enters when needed)
 *
 * Each can be overridden via PricingSettings.catalogDefaults (JSON), and
 * a specific estimate can override any category via Estimate.catalogModes.
 */
export const DEFAULT_CATEGORY_MODES: Record<CatalogCategory, CategoryMode> = {
  // finishing default is now total 0 (perSqm chip hidden from UI per user req).
  // User enters the total amount, or switches to 상세 to itemize.
  finishing: { enabled: true, mode: "simple", simpleType: "total",   simpleValue: 0 },
  gutter:    { enabled: true, mode: "simple", simpleType: "perM",    simpleValue: 2000 },
  accessory: { enabled: true, mode: "simple", simpleType: "percent", simpleValue: 0.03 },
  bending:   { enabled: true, mode: "simple", simpleType: "total",   simpleValue: 0 },
};

/** Merge user-defined defaults (from PricingSettings.catalogDefaults) over the built-in defaults. */
export function resolveCategoryDefaults(savedDefaults: CategoryModesMap | null | undefined): Record<CatalogCategory, CategoryMode> {
  const saved = savedDefaults ?? {};
  return {
    finishing: { ...DEFAULT_CATEGORY_MODES.finishing, ...saved.finishing },
    gutter:    { ...DEFAULT_CATEGORY_MODES.gutter,    ...saved.gutter },
    accessory: { ...DEFAULT_CATEGORY_MODES.accessory, ...saved.accessory },
    bending:   { ...DEFAULT_CATEGORY_MODES.bending,   ...saved.bending },
  };
}

export const SIMPLE_TYPE_LABELS: Record<SimpleType, { label: string; suffix: string }> = {
  percent: { label: "자재비 %",  suffix: "%" },
  perSqm:  { label: "㎡당",      suffix: "원/㎡" },
  perM:    { label: "m당",       suffix: "원/m" },
  total:   { label: "총금액",    suffix: "원" },
};

export const DEFAULT_CATALOG: CatalogItem[] = [
  // ─── 마감재 (finishing) ──────────────────────────────────────────────
  { key: "ridge",        category: "finishing", label: "용마루",     unit: "m", price: 25000, sortOrder: 10 },
  { key: "eave",         category: "finishing", label: "처마",       unit: "m", price: 20000, sortOrder: 20 },
  { key: "mishi",        category: "finishing", label: "미시",       unit: "m", price: 18000, sortOrder: 30 },
  { key: "haumakki",     category: "finishing", label: "하우마끼",   unit: "m", price: 18000, sortOrder: 40 },
  { key: "endCap",       category: "finishing", label: "엔드캡",     unit: "개", price: 12000, sortOrder: 50 },
  { key: "crosha",       category: "finishing", label: "크로샤",     unit: "m", price: 15000, sortOrder: 60 },
  { key: "flashing",     category: "finishing", label: "프래싱",     unit: "m", price: 18000, sortOrder: 70 },
  { key: "snowGuard",    category: "finishing", label: "눈방지턱",   unit: "m", price: 22000, sortOrder: 80 },
  { key: "valley",       category: "finishing", label: "회침",       unit: "m", price: 20000, sortOrder: 90 },
  { key: "valleyCover",  category: "finishing", label: "회침커버",   unit: "m", price: 12000, sortOrder: 100 },
  { key: "ridgeLarge",   category: "finishing", label: "대봉",       unit: "m", price: 28000, sortOrder: 110 },
  { key: "ridgeSmall",   category: "finishing", label: "소봉",       unit: "m", price: 18000, sortOrder: 120 },

  // ─── 물받이 부속 (gutter) ─────────────────────────────────────────────
  { key: "gutter",       category: "gutter", label: "물받이",      unit: "m", price: 30000, sortOrder: 10 },
  { key: "gutterHook",   category: "gutter", label: "물받이 걸쇠", unit: "개", price: 3500,  sortOrder: 20 },
  { key: "outerCorner",  category: "gutter", label: "바깥코너",    unit: "개", price: 18000, sortOrder: 30 },
  { key: "innerCorner",  category: "gutter", label: "안코너",      unit: "개", price: 18000, sortOrder: 40 },
  { key: "gutterEndCap", category: "gutter", label: "마감캡",      unit: "개", price: 8000,  sortOrder: 50 },
  { key: "collector",    category: "gutter", label: "물모음통",    unit: "개", price: 35000, sortOrder: 60 },
  { key: "downspout",    category: "gutter", label: "홈통",        unit: "m", price: 25000, sortOrder: 70 },
  { key: "elbow",        category: "gutter", label: "엘보",        unit: "개", price: 8000,  sortOrder: 80 },

  // ─── 부자재 (accessory) ──────────────────────────────────────────────
  { key: "silicone",     category: "accessory", label: "실리콘",        unit: "개", price: 5000,  sortOrder: 10 },
  { key: "screwLarge",   category: "accessory", label: "스크류 (대)",   unit: "개", price: 300,   sortOrder: 20 },
  { key: "screwSmall",   category: "accessory", label: "스크류 (소)",   unit: "개", price: 100,   sortOrder: 30 },
  { key: "fastener",     category: "accessory", label: "Fastener",      unit: "개", price: 800,   sortOrder: 40 },
  { key: "anchorBolt",   category: "accessory", label: "앵커볼트",      unit: "개", price: 1500,  sortOrder: 50 },

  // ─── 절곡 (bending) ───────────────────────────────────────────────────
  { key: "bend1",        category: "bending", label: "1회 절곡",     unit: "m", price: 3000,  sortOrder: 10 },
  { key: "bend2",        category: "bending", label: "2회 절곡",     unit: "m", price: 5000,  sortOrder: 20 },
  { key: "bend3",        category: "bending", label: "3회 절곡",     unit: "m", price: 7000,  sortOrder: 30 },
  { key: "customBend",   category: "bending", label: "커스텀 절곡",  unit: "m", price: 10000, sortOrder: 40 },
];

/** Group a catalog list by category, preserving sortOrder within each. */
export function groupCatalog(items: CatalogItem[]): Record<CatalogCategory, CatalogItem[]> {
  const result: Record<CatalogCategory, CatalogItem[]> = {
    finishing: [], gutter: [], accessory: [], bending: [],
  };
  for (const it of items) {
    result[it.category].push(it);
  }
  for (const k of Object.keys(result) as CatalogCategory[]) {
    result[k].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return result;
}

export function categoryToLineItemCategory(cat: CatalogCategory): string {
  return CATALOG_CATEGORIES.find((c) => c.value === cat)?.lineItemCategory ?? "other";
}
