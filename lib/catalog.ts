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

// 8 카테고리 — 천보칼라강판 도매 단가표 기준으로 재설계 (PRICING_AND_CATALOG_OVERHAUL.md).
// accessory → fastener 로 대체, roofingExtras/substructure/translucent/sealing 신규.
export type CatalogCategory =
  | "finishing"      // 마감재 — 용마루/처마/미시/엔드캡/하우막기/몰딩
  | "roofingExtras"  // 한옥/기와 전용 — 대봉/중봉/소봉/한옥캡/회침
  | "gutter"         // 물받이/홈통/엘보 부속
  | "fastener"       // 피스/못/볼트/타정기못
  | "substructure"   // 목재/판재 — 각목/사선판/평판/파이프
  | "translucent"    // 채광판 — PC 라이트
  | "sealing"        // 실링 — F30/ST64 (실리콘은 자동 계산)
  | "bending";       // 절곡

export const CATALOG_CATEGORIES: { value: CatalogCategory; label: string; icon: string; lineItemCategory: string }[] = [
  { value: "finishing",     label: "마감재",      icon: "📐", lineItemCategory: "material" },
  { value: "roofingExtras", label: "한옥/기와",   icon: "🏯", lineItemCategory: "material" },
  { value: "gutter",        label: "물받이 부속", icon: "🌧️", lineItemCategory: "material" },
  { value: "fastener",      label: "피스/못",     icon: "🔩", lineItemCategory: "material" },
  { value: "substructure",  label: "목재/판재",   icon: "🪵", lineItemCategory: "material" },
  { value: "translucent",   label: "채광판",      icon: "💡", lineItemCategory: "material" },
  { value: "sealing",       label: "실링",        icon: "🧴", lineItemCategory: "material" },
  { value: "bending",       label: "절곡",        icon: "📏", lineItemCategory: "material" },
];

export interface CatalogItem {
  key: string;                 // 고유 식별자
  category: CatalogCategory;
  label: string;               // 표시 이름
  unit: string;                // "m", "개", "kg" 등
  price: number;               // 기본 단가 (원) — unit 1개당
  /** 한 개(또는 한 장)의 길이 mm. 있으면 "= X원 (m당 Y원)" 환산 표시.
   *  예: 용마루 3,000mm → 14,300원/개 = m당 4,767원. 단가성(갑/kg/box)은 미지정. */
  lengthMm?: number;
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
  finishing:     { enabled: false, mode: "simple", simpleType: "total",   simpleValue: 0 },  // 기성품 마감재 쓸 때만 (용마루 기성품은 finishingMethods 자동 라인)
  roofingExtras: { enabled: false, mode: "simple", simpleType: "total",   simpleValue: 0 },  // 한옥/기와 공사만
  gutter:        { enabled: true,  mode: "simple", simpleType: "perM",    simpleValue: 2000 },
  fastener:      { enabled: true,  mode: "simple", simpleType: "percent", simpleValue: 0.03 },
  substructure:  { enabled: false, mode: "simple", simpleType: "total",   simpleValue: 0 },  // 필요할 때만
  translucent:   { enabled: false, mode: "simple", simpleType: "total",   simpleValue: 0 },  // 채광판 있을 때만
  sealing:       { enabled: false, mode: "simple", simpleType: "perSqm",  simpleValue: 500 },  // 자동 실리콘과 중복 방지 — 기본 off
  bending:       { enabled: false, mode: "simple", simpleType: "total",   simpleValue: 0 },  // 자동 절곡 라인(용마루/두겁 등) 외 추가 절곡 있을 때만
};

/** [LEGACY] 카테고리 단위 defaults 병합 — 그룹 체계(resolveGroupDefaults)로 대체됨. */
export function resolveCategoryDefaults(savedDefaults: CategoryModesMap | null | undefined): Record<CatalogCategory, CategoryMode> {
  const saved = savedDefaults ?? {};
  const out = {} as Record<CatalogCategory, CategoryMode>;
  for (const cat of CATALOG_CATEGORIES) {
    out[cat.value] = { ...DEFAULT_CATEGORY_MODES[cat.value], ...saved[cat.value] };
  }
  return out;
}

// ─── 카드 그룹 (3분류 UI) ────────────────────────────────────────────
// 2026-06-12 사용자 피드백: 8분류 카드는 도매상 단가표 구조지 현장 멘탈 모델이 아님.
// UI/심플모드는 3그룹으로 묶고, 8분류는 상세 모드 안의 소제목으로만 유지.
// 마감재 상세에서 기성품(용마루 등)과 절곡을 한 화면에서 같이 담을 수 있음.
export type CatalogGroup = "finishing" | "accessory" | "gutter" | "bending";

export const CATALOG_GROUPS: { value: CatalogGroup; label: string; icon: string; categories: CatalogCategory[] }[] = [
  { value: "finishing", label: "마감재 (기성품)",       icon: "🏠", categories: ["finishing", "roofingExtras"] },
  // 절곡 = 기성품 제품 고르기가 아니라 치수 계산. 마감재 바로 아래 배치 (성격상 마감 관련).
  // 상세 모드는 총 넓이(mm) 입력 → 넓이 × 절곡단가. 모든 절곡 3m 본 단위(더 긴 건 이어붙임)라
  // 길이는 단가(원/mm·3m)에 이미 포함, 넓이만 입력.
  { value: "bending",   label: "절곡",                 icon: "📏", categories: ["bending"] },
  { value: "accessory", label: "부자재 (피스·실링 등)", icon: "🔩", categories: ["fastener", "sealing", "substructure", "translucent"] },
  { value: "gutter",    label: "물받이 부속",           icon: "🌧️", categories: ["gutter"] },
];

export type GroupModesMap = Partial<Record<CatalogGroup, CategoryMode>>;

/**
 * 그룹별 기본 모드.
 * - finishing: 켜짐 + 추가 금액 0 — 주요 마감(용마루 절곡/기성품)은 폼의 '마감 방식'이
 *   자동 계산하고, 카드는 "자동 계산 중" 상태를 표시 (꺼진 모양이면 마감재가 빠진 걸로
 *   오해 — 2026-06-12 사용자 피드백). 여기 입력값은 자동 계산 외 추가분.
 * - accessory: 자재비 3% 자동 (피스/실링 등 소모품 일괄).
 * - gutter: 물받이 길이 × 2,000원/m 자동 (길이 0이면 라인 없음).
 *
 * 주의: Estimate.catalogModes / PricingSettings.catalogDefaults JSON 키가 그룹 키로 바뀜.
 * 구 8분류 키 중 "finishing"/"gutter" 는 그룹 키와 이름이 같아 자연 호환, 나머지는 무시됨.
 */
export const DEFAULT_GROUP_MODES: Record<CatalogGroup, CategoryMode> = {
  finishing: { enabled: true,  mode: "simple", simpleType: "total",   simpleValue: 0 },
  // 부자재(피스·실링) 자재비 대비 % — 포스코 샘플 체결부속+실리콘이 재료비의 7~10%였음 (3%는 과소).
  accessory: { enabled: true,  mode: "simple", simpleType: "percent", simpleValue: 0.08 },
  gutter:    { enabled: true,  mode: "simple", simpleType: "perM",    simpleValue: 2000 },
  // 절곡: 심플=총금액 lump(기본 0), 상세=총 넓이(mm) 입력 → 넓이 × 절곡단가. 넓이는 simpleQty 에 저장.
  bending:   { enabled: true,  mode: "simple", simpleType: "total",   simpleValue: 0 },
};

/** Merge user-defined group defaults (PricingSettings.catalogDefaults) over built-ins. */
export function resolveGroupDefaults(savedDefaults: GroupModesMap | null | undefined): Record<CatalogGroup, CategoryMode> {
  const saved = savedDefaults ?? {};
  const out = {} as Record<CatalogGroup, CategoryMode>;
  for (const g of CATALOG_GROUPS) {
    out[g.value] = { ...DEFAULT_GROUP_MODES[g.value], ...saved[g.value] };
  }
  return out;
}

export const SIMPLE_TYPE_LABELS: Record<SimpleType, { label: string; suffix: string }> = {
  percent: { label: "자재비 %",  suffix: "%" },
  perSqm:  { label: "㎡당",      suffix: "원/㎡" },
  perM:    { label: "m당",       suffix: "원/m" },
  total:   { label: "총금액",    suffix: "원" },
};

// 천보칼라강판 도매가 × 1.1 (VAT 포함) + 100원 올림. 업체별 실거래가는 설정에서 수정.
export const DEFAULT_CATALOG: CatalogItem[] = [
  // ─── 마감재 (finishing) ──────────────────────────────────────────────
  { key: "ridgeClassic",       category: "finishing", label: "용마루 (고전)",   unit: "개", price: 14300, lengthMm: 3000, sortOrder: 10 },
  { key: "ridgeStraight",      category: "finishing", label: "용마루 (일자)",   unit: "개", price: 12100, lengthMm: 3000, sortOrder: 20 },
  { key: "ridgeStraightLarge", category: "finishing", label: "일자용마루 대",   unit: "개", price: 26400, lengthMm: 3000, sortOrder: 30 },
  { key: "multiRidge",         category: "finishing", label: "멀티용마루",      unit: "개", price: 13200, lengthMm: 3000, sortOrder: 40 },
  { key: "ridgeCap",           category: "finishing", label: "용마루캡",        unit: "개", price: 5500,  sortOrder: 50 },
  { key: "houCap",             category: "finishing", label: "하우캡",          unit: "개", price: 4400,  sortOrder: 60 },
  { key: "houMakkiNormal",     category: "finishing", label: "하우막기 (일반)", unit: "개", price: 12100, lengthMm: 3000, sortOrder: 70 },
  { key: "houMakkiWood",       category: "finishing", label: "하우막기 (우드)", unit: "개", price: 22000, lengthMm: 3000, sortOrder: 80 },
  { key: "mishi",              category: "finishing", label: "미시",            unit: "개", price: 8800,  lengthMm: 3000, sortOrder: 90 },
  { key: "endCap",             category: "finishing", label: "엔드캡",          unit: "개", price: 3000,  sortOrder: 100 },
  { key: "fascia",             category: "finishing", label: "페이샤 / 후레싱", unit: "개", price: 11000, lengthMm: 3000, sortOrder: 105 },  // 기성품 3m, 추정가
  { key: "molding",            category: "finishing", label: "몰딩",            unit: "개", price: 3900,  lengthMm: 3000, sortOrder: 110 },
  { key: "moldingD",           category: "finishing", label: "ㄷ몰딩",          unit: "개", price: 6100,  lengthMm: 3000, sortOrder: 120 },

  // ─── 한옥/기와 전용 (roofingExtras) ──────────────────────────────────
  { key: "bongLarge",          category: "roofingExtras", label: "대봉 (고전)",     unit: "개", price: 29700, sortOrder: 10 },
  { key: "bongMid",            category: "roofingExtras", label: "중봉 (고전)",     unit: "개", price: 24200, sortOrder: 20 },
  { key: "bongSmallDouble",    category: "roofingExtras", label: "양면소봉 (고전)", unit: "개", price: 9900,  sortOrder: 30 },
  { key: "bongSmall",          category: "roofingExtras", label: "소봉 (고전)",     unit: "개", price: 7700,  sortOrder: 40 },
  { key: "hanokCap",           category: "roofingExtras", label: "한옥캡",          unit: "개", price: 3300,  sortOrder: 50 },
  { key: "hanokChakgo",        category: "roofingExtras", label: "한옥착고",        unit: "개", price: 2800,  sortOrder: 60 },
  { key: "hoechim",            category: "roofingExtras", label: "회침",            unit: "개", price: 12100, lengthMm: 3000, sortOrder: 70 },
  { key: "hoechimCover",       category: "roofingExtras", label: "회침카바",        unit: "개", price: 9900,  lengthMm: 3000, sortOrder: 80 },

  // ─── 물받이 부속 (gutter) ────────────────────────────────────────────
  { key: "gutterCopper",       category: "gutter", label: "물받이 (동색)",   unit: "개", price: 16500, lengthMm: 5000, sortOrder: 10 },
  { key: "gutterOther",        category: "gutter", label: "물받이 (동색외)", unit: "개", price: 16500, lengthMm: 5000, sortOrder: 20 },
  { key: "gutterHook",         category: "gutter", label: "물받이쇠",        unit: "개", price: 1100,  sortOrder: 30 },
  { key: "collectorLarge",     category: "gutter", label: "물모임통 (대)",   unit: "개", price: 6100,  sortOrder: 40 },
  { key: "collectorSmall",     category: "gutter", label: "물모임통 (소)",   unit: "개", price: 5000,  sortOrder: 50 },
  { key: "downspoutLarge",     category: "gutter", label: "원형홈통 (대)",   unit: "개", price: 5000,  lengthMm: 900, sortOrder: 60 },
  { key: "downspoutSmall",     category: "gutter", label: "원형홈통 (소)",   unit: "개", price: 3100,  lengthMm: 900, sortOrder: 70 },
  { key: "elbowLarge",         category: "gutter", label: "원형엘보 (대)",   unit: "개", price: 2800,  sortOrder: 80 },
  { key: "elbowSmall",         category: "gutter", label: "원형엘보 (소)",   unit: "개", price: 2000,  sortOrder: 90 },
  { key: "squareMas",          category: "gutter", label: "사각마스",        unit: "개", price: 5500,  sortOrder: 100 },
  { key: "squareDownspout",    category: "gutter", label: "사각홈통",        unit: "개", price: 9400,  sortOrder: 110 },
  { key: "squareElbow",        category: "gutter", label: "사각엘보",        unit: "개", price: 3100,  sortOrder: 120 },
  { key: "squareWallMount",    category: "gutter", label: "사각벽고정",      unit: "개", price: 8800,  sortOrder: 130 },

  // ─── 피스/못 (fastener) ──────────────────────────────────────────────
  { key: "screw",              category: "fastener", label: "피스 (외)",            unit: "봉",      price: 13200, sortOrder: 10 },
  { key: "colorBolt55",        category: "fastener", label: "칼라볼트 55mm",        unit: "봉",      price: 11000, sortOrder: 20 },
  { key: "colorBolt75",        category: "fastener", label: "칼라볼트 75mm",        unit: "봉",      price: 13200, sortOrder: 30 },
  { key: "plateNail55",        category: "fastener", label: "판못 55mm",            unit: "봉(2kg)", price: 8800,  sortOrder: 40 },
  { key: "plateNail75",        category: "fastener", label: "판못 75mm",            unit: "봉(2kg)", price: 8800,  sortOrder: 50 },
  { key: "plateNailBlack55",   category: "fastener", label: "판못 (검) 55mm",       unit: "kg",      price: 4400,  sortOrder: 60 },
  { key: "plateNailBlack75",   category: "fastener", label: "판못 (검) 75mm",       unit: "kg",      price: 4400,  sortOrder: 70 },
  { key: "shotNail",           category: "fastener", label: "타정기못",             unit: "box",     price: 30800, sortOrder: 80 },
  { key: "rollNail",           category: "fastener", label: "타정롤못",             unit: "box",     price: 55000, sortOrder: 90 },
  { key: "packingNail",        category: "fastener", label: "빠킹못 (55/75mm)",     unit: "kg",      price: 8800,  sortOrder: 100 },
  { key: "doubleSidedScrew",   category: "fastener", label: "양날피스 (매그니/차콜)", unit: "개",    price: 17600, sortOrder: 110 },

  // ─── 목재/판재 (substructure) ────────────────────────────────────────
  { key: "lumberBundle",       category: "substructure", label: "각목",           unit: "단", price: 22000, sortOrder: 10 },
  { key: "sasunWood",          category: "substructure", label: "사선판 (목무늬)", unit: "m",  price: 9900,  sortOrder: 20 },   // 폭 1219
  { key: "sasunCharcoal",      category: "substructure", label: "사선판 (차콜)",   unit: "m",  price: 9900,  sortOrder: 30 },   // 폭 1219
  { key: "flatPanel",          category: "substructure", label: "평판",           unit: "m",  price: 9900,  sortOrder: 40 },
  { key: "pipe3m",             category: "substructure", label: "파이프",         unit: "개", price: 16500, lengthMm: 3000, sortOrder: 50 },

  // ─── 채광판 (translucent) ────────────────────────────────────────────
  { key: "pcLite1800",         category: "translucent", label: "PC 라이트 1,800mm", unit: "장", price: 19800, lengthMm: 1800, sortOrder: 10 },  // 폭 1m
  { key: "pcLite2100",         category: "translucent", label: "PC 라이트 2,100mm", unit: "장", price: 23100, lengthMm: 2100, sortOrder: 20 },
  { key: "pcLite2400",         category: "translucent", label: "PC 라이트 2,400mm", unit: "장", price: 26400, lengthMm: 2400, sortOrder: 30 },
  { key: "pcLite3000",         category: "translucent", label: "PC 라이트 3,000mm", unit: "장", price: 33000, lengthMm: 3000, sortOrder: 40 },

  // ─── 실링 (sealing) ──────────────────────────────────────────────────
  { key: "f30",                category: "sealing", label: "F30",  unit: "갑", price: 4400, sortOrder: 10 },
  { key: "st64",               category: "sealing", label: "ST64", unit: "갑", price: 8800, sortOrder: 20 },

  // ─── 절곡 (bending) ──────────────────────────────────────────────────
  // 횟수별(1회/2회/3회) 항목 제거 (2026-06-16) — 절곡은 총 넓이(mm) × 절곡단가로 계산.
  // 절곡 그룹 상세 모드는 아이템 목록이 아니라 "총 넓이" 입력 (CatalogPicker 특수 처리).
];

/** Group a catalog list by category, preserving sortOrder within each. */
export function groupCatalog(items: CatalogItem[]): Record<CatalogCategory, CatalogItem[]> {
  const result = {} as Record<CatalogCategory, CatalogItem[]>;
  for (const cat of CATALOG_CATEGORIES) result[cat.value] = [];
  for (const it of items) {
    (result[it.category] ??= []).push(it);
  }
  for (const k of Object.keys(result) as CatalogCategory[]) {
    result[k].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return result;
}

export function categoryToLineItemCategory(cat: CatalogCategory): string {
  return CATALOG_CATEGORIES.find((c) => c.value === cat)?.lineItemCategory ?? "other";
}
