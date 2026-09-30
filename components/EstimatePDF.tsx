// NOTE: do NOT add "use client" here. This component is rendered ONLY by
// the server-side PDF route via react-pdf's reconciler. Marking it as a
// client component causes Next.js to replace it with a client reference
// stub in server contexts, so when the API route imports it, the
// reconciler sees a wrapper that never produces the Document host node —
// leading to react-pdf's "Cannot read properties of null (reading 'props')"
// crash because container.document stays null.
import type { ReactElement } from "react";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from "@react-pdf/renderer";
import type { Estimate, EstimateLineItem, Site } from "@prisma/client";
import type { ScopeFlags, ConstructionType } from "@/lib/types";
import { INSULATION_LABEL, MATERIAL_TYPES, SCOPE_LABELS, type InsulationType } from "@/lib/types";
import { distributeMarginForDisplay, type DisplayLineItem, type MarginDistributionRatios } from "@/lib/calculations";

// ⚠️ Font sourcing — DO NOT use Google Fonts /s/ CSS-chunk URLs here.
// Those URLs are dynamically subsetted woff2 files that only cover a
// fraction of the Hangul block per file. When react-pdf v4 lays out a
// Text node containing a character outside the subset, the glyph lookup
// returns null and the renderer surfaces it as
// "Cannot read properties of null (reading 'props')" deep inside its
// children processor. Use a full-coverage TTF/OTF from a stable CDN.
//
// Pretendard covers the full Hangul block + Latin and is what the app
// already uses on the web side, so the PDF visually matches the UI.
//
// 2026-09-30: 폰트 파일을 저장소에 포함 (assets/fonts, SIL OFL 1.1). 이전엔 콜드스타트마다
// jsdelivr 에서 받아서 CDN 이 멈추면 PDF 가 500 이었다. Vercel 함수에 파일이 실리도록
// next.config.ts outputFileTracingIncludes 에 PDF 라우트를 등록해 둠. 파일이 없으면(추적 누락 등)
// 같은 버전의 CDN 주소로 폴백 — PDF 가 아예 안 나오는 것보다 낫다.
const PRETENDARD_CDN = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static";
function pretendardSrc(file: "Pretendard-Regular.otf" | "Pretendard-Bold.otf"): string {
  const local = path.join(process.cwd(), "assets", "fonts", file);
  if (existsSync(local)) return local;
  console.error(`[PDF] bundled font missing (${local}) — falling back to CDN`);
  return `${PRETENDARD_CDN}/${file}`;
}
try {
  Font.register({
    family: "Pretendard",
    fonts: [
      // NOTE: .otf (not .ttf) — the upstream repo does not ship .ttf static files.
      { src: pretendardSrc("Pretendard-Regular.otf"), fontWeight: "normal" },
      { src: pretendardSrc("Pretendard-Bold.otf"), fontWeight: "bold" },
    ],
  });
} catch (e) {
  // Font registration failure should not block the entire PDF. Falls
  // back to react-pdf's bundled Helvetica (no Korean coverage — boxes).
  console.error("[PDF] Font.register failed", e);
}

// Disable hyphenation — react-pdf's default hyphenation callback can
// also return null for characters it doesn't know, contributing to
// the "null props" crash class.
Font.registerHyphenationCallback((word) => [word]);

// v4 color palette (matches the kickoff mockup)
const C = {
  ink: "#1e2530",        // dark navy header + total
  text: "#1a1a1a",
  textOnDark: "#ffffff",
  metaOnDark: "#8a9bb0",  // light grey-blue for header meta
  muted: "#666",
  mutedLight: "#888",
  border: "#e5e7eb",
  pillBg: "#e8ecf0",
  pillText: "#3a4a5c",
  totalBg: "#f5f7fa",
  notice: "#888",
  sealBorder: "#c5d0de",
  sealText: "#8a9bb0",
};

const styles = StyleSheet.create({
  page: { fontFamily: "Pretendard", fontSize: 10, padding: 0, color: C.text, backgroundColor: "#ffffff" },
  body: { padding: 24, paddingTop: 0 },

  // — Header (dark navy)
  // Section paddings reduced from 16→11 (header 20→14, totalRow 16→12) to
  // keep typical 상세 견적서 on a single A4 page. Type sizes & visual hierarchy
  // unchanged. If we ever overflow again, the seal circle + bank line are
  // the next things to compress.
  header: { backgroundColor: C.ink, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  companyName: { color: C.textOnDark, fontSize: 15, fontWeight: "bold", letterSpacing: 0.4 },
  headerMeta: { color: C.metaOnDark, fontSize: 9, lineHeight: 1.4, marginTop: 3 },
  headerRight: { alignItems: "flex-end" },
  headerRightLine: { color: C.metaOnDark, fontSize: 9, marginBottom: 2 },

  // — Customer + site row (two columns)
  topRow: { flexDirection: "row", justifyContent: "space-between", borderBottom: `0.5pt solid ${C.border}`, padding: 11 },
  topCol: { flex: 1 },
  topColRight: { flex: 1, alignItems: "flex-end" },
  labelTiny: { fontSize: 9, color: C.muted, marginBottom: 2 },
  labelTinyTop: { fontSize: 9, color: C.muted, marginTop: 6, marginBottom: 2 },
  valueLarge: { fontSize: 12, fontWeight: "bold", color: C.text },
  valueRegular: { fontSize: 10, color: C.text },

  // — Section: scope + pills
  scopeSection: { padding: 11, borderBottom: `0.5pt solid ${C.border}` },
  sectionLabel: { fontSize: 9, color: C.muted, letterSpacing: 0.5, marginBottom: 5 },
  scopeText: { fontSize: 10.5, color: C.text, lineHeight: 1.4, marginBottom: 6 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  pill: { fontSize: 9, color: C.pillText, backgroundColor: C.pillBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },

  // — Simple view
  simpleSection: { padding: 11, borderBottom: `0.5pt solid ${C.border}` },
  simpleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  simpleLabel: { fontSize: 11, color: C.text },
  simpleValue: { fontSize: 11, fontWeight: "bold", color: C.text },

  // — Detailed table
  detailSection: { padding: 11, borderBottom: `0.5pt solid ${C.border}` },
  tableHeaderRow: { flexDirection: "row", borderBottom: `0.5pt solid ${C.border}`, paddingBottom: 3, marginBottom: 3 },
  tableGroupHeader: { fontSize: 9.5, color: C.muted, paddingTop: 4, paddingBottom: 3 },
  tableRow: { flexDirection: "row", paddingVertical: 2 },
  cellName: { flex: 3.5, fontSize: 10, color: C.text },
  cellSpec: { flex: 1.7, fontSize: 10, color: C.muted, textAlign: "right" },
  cellQty:  { flex: 1.2, fontSize: 10, color: C.muted, textAlign: "right" },
  cellAmount: { flex: 1.8, fontSize: 10, color: C.text, textAlign: "right" },
  subtotalRow: { flexDirection: "row", marginTop: 5, paddingTop: 5, borderTop: `0.5pt solid ${C.border}` },
  subtotalLabel: { flex: 1, fontSize: 10.5, color: C.muted },
  subtotalAmount: { fontSize: 10.5, color: C.muted, textAlign: "right" },
  vatRow: { flexDirection: "row", marginTop: 2 },

  // — Final total (filled card)
  totalRow: { backgroundColor: C.totalBg, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottom: `0.5pt solid ${C.border}` },
  totalLeft: { flexDirection: "row", alignItems: "baseline" },
  totalLabel: { fontSize: 12, fontWeight: "bold", color: C.ink },
  totalVatNote: { fontSize: 9, color: C.mutedLight, marginLeft: 6 },
  totalAmount: { fontSize: 17, fontWeight: "bold", color: C.ink },

  // — Payment (two cards)
  payment: { padding: 11, borderBottom: `0.5pt solid ${C.border}` },
  paymentCards: { flexDirection: "row", gap: 6, marginBottom: 6 },
  paymentCard: { flex: 1, padding: 7, border: `0.5pt solid ${C.border}`, borderRadius: 5, alignItems: "center" },
  paymentLabel: { fontSize: 8.5, color: C.muted, marginBottom: 3 },
  paymentAmount: { fontSize: 11.5, fontWeight: "bold", color: C.text, marginBottom: 1 },
  paymentPercent: { fontSize: 8.5, color: C.muted },
  paymentText: { fontSize: 10, color: C.text, marginBottom: 5, fontWeight: "bold" },
  paymentBank: { fontSize: 9.5, color: C.muted },

  // — Notice + signature
  notice: { padding: 11 },
  noticeText: { fontSize: 9.5, color: C.muted, lineHeight: 1.45, marginBottom: 4 },
  signatureRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6 },
  signatureLeft: { fontSize: 9.5, color: C.muted },
  signatureRight: { alignItems: "center" },
  companyAbove: { fontSize: 9.5, color: C.muted, marginBottom: 4 },
  sealCircle: { width: 42, height: 42, borderRadius: 21, borderWidth: 0.7, borderColor: C.sealBorder, alignItems: "center", justifyContent: "center" },
  sealPlaceholder: { fontSize: 9, color: C.sealText },
  sealImage: { width: 42, height: 42, borderRadius: 21 },
});

function materialLabel(type: string | null): string {
  if (!type) return "칼라강판";
  return MATERIAL_TYPES.find((m) => m.value === type)?.label ?? "칼라강판";
}

function buildWorkTitle(estimate: Estimate, scope: ScopeFlags | null | undefined): string {
  const s = (scope ?? {}) as ScopeFlags;
  const mat = materialLabel(estimate.materialType ?? null);
  if (estimate.constructionType === "steelWaterproof") return `${mat} 옥상 스틸방수`;
  if (estimate.constructionType === "rooftopRoof") return `${mat} 옥상지붕 시공`;
  if (s.removal) return `${mat} 지붕공사 (기존 지붕 철거)`;
  if (s.overlay) return `${mat} 지붕공사 (기존 지붕 덧씌우기)`;
  return `${mat} 지붕공사`;
}

function scopeOneLine(estimate: Estimate, scope: ScopeFlags | null | undefined): string {
  // Builds one comma-joined sentence like the v4 mockup, including the work title.
  const s = (scope ?? {}) as ScopeFlags;
  const parts: string[] = [];
  parts.push(buildWorkTitle(estimate, s));

  const ct = estimate.constructionType as ConstructionType;
  const keys: (keyof ScopeFlags)[] = (() => {
    if (ct === "roof") return ["ridge", "eave", "endCap", "waste"];
    if (ct === "rooftopRoof") return ["ridge", "eave", "endCap", "waste"];
    // 신규 스킴: 난간/두겁 합쳐서 handrail 한 줄, 창고/계단실/옥탑방은 rooftopStructure 한 줄.
    // 구 데이터(warehouse/stairwell/rooftopRoom/cap) 호환을 위해 keys 에 같이 포함 — 어차피 false 면 SCOPE_LABELS 로 안 잡힘.
    return ["handrail", "drainHole", "rooftopStructure", "warehouse", "stairwell", "rooftopRoom", "waste"];
  })();
  // Combine ridge+eave nicely if both
  if (s.ridge && s.eave) parts.push("용마루 및 처마 마감");
  else if (s.ridge) parts.push("용마루 마감");
  else if (s.eave) parts.push("처마 마감");
  // Gutter / 스테인리스 배수로 — 공사 유형에 따라 다름.
  if (ct === "steelWaterproof") {
    if ((estimate.stainlessDrainLengthM ?? 0) > 0) {
      parts.push("스테인리스 배수로 시공");
    }
    if ((estimate.gutterLengthM ?? 0) > 0 && estimate.gutterMode && estimate.gutterMode !== "none") parts.push("차양 물받이 시공");
    if ((estimate.downspoutCount ?? 0) > 0) parts.push("선홈통 설치");
  } else if (estimate.gutterMode && estimate.gutterMode !== "none") {
    // 옥상지붕은 새로 짓는 지붕이라 '교체'가 아니라 '설치'.
    parts.push(ct === "rooftopRoof" ? "물받이 설치" : "물받이 교체");
  }
  // 하지·단열재 — 금액이 큰 공정인데 간단 견적서에 안 보이던 것 (2026-09-28).
  if (estimate.substructureType === "wood") parts.push("목재 하지 작업");
  else if (estimate.substructureType === "steel") parts.push("철재 하지 작업");
  const insulation = Array.isArray(estimate.insulationTypes)
    ? (estimate.insulationTypes as unknown[]).filter((t): t is InsulationType => typeof t === "string" && t in INSULATION_LABEL)
    : [];
  if (insulation.length > 0) {
    const names = insulation.map((t) => (t === "other" && estimate.insulationNote ? estimate.insulationNote : INSULATION_LABEL[t]));
    parts.push(`단열재 시공 (${names.join(", ")})`);
  }
  for (const k of keys) {
    if (k === "ridge" || k === "eave") continue; // already handled
    if (s[k]) parts.push(SCOPE_LABELS[k] ?? "");
  }
  // Always include waste/safety blurbs as in mockup
  if (s.skylift || s.ladderTruck || s.scaffold) parts.push("장비 및 안전 작업");

  // dedupe + join (filter empty strings just in case)
  return Array.from(new Set(parts.filter(Boolean))).join(" · ");
}

function formatMonth(v: string | null): string | null {
  if (!v) return null;
  const parts = v.split("-");
  if (parts.length < 2) return null;
  const [y, m, d] = parts;
  if (!y || !m) return null;
  if (d) return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
  return `${y}년 ${parseInt(m)}월 중`;
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 한국 시간 기준 날짜 (서버는 UTC — 00~09시 KST 발행분이 전날로 찍히던 문제). */
function formatDateKST(d: Date): string {
  return new Date(d).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\.$/, "");
}

/** 고객 PDF 용 품명 — 내부 표기('(심플)', '(로스율 N% 포함)')를 뺀다. */
function customerName(name: string): string {
  return name
    .replace(/\s*\(심플\)/g, "")
    .replace(/\s*\(로스율 \d+(\.\d+)?% 포함\)/g, "")
    .trim();
}

// ─── Cost grouping ─────────────────────────────────────────────────────
interface SimpleLine { name: string; amount: number; }
interface DetailedLine { group: string; name: string; spec: string; qty: string; amount: number; }

/**
 * Presentation-only: merge PE폼 부착 라인을 메인 강판 라인에 흡수.
 * 내부 EstimateLineItem 은 그대로 (snapshot 규칙 — 영업자가 in-app 에서는 분리해서 봄).
 * 고객 PDF 에서는 "강판" 한 줄로 보임 — 단가도 합산해서 ㎡당으로 재계산.
 */
function mergePeFoamIntoMaterial<T extends EstimateLineItem>(items: T[]): T[] {
  const peFoamIdx = items.findIndex((i) => i.name?.includes("PE폼"));
  if (peFoamIdx < 0) return items;
  // 메인 강판 라인 = 첫 material/㎡ 라인 중 PE폼 자신이 아닌 것
  const mainIdx = items.findIndex((i, idx) =>
    idx !== peFoamIdx && i.category === "material" && i.unit === "㎡"
  );
  if (mainIdx < 0) return items; // 강판 라인이 없으면 PE폼 그대로 둠
  const peFoam = items[peFoamIdx];
  const main = items[mainIdx];
  const mergedTotal = main.total + peFoam.total;
  const mergedUnitPrice = main.quantity > 0
    ? Math.round(mergedTotal / main.quantity)
    : main.unitPrice;
  return items
    .filter((_, idx) => idx !== peFoamIdx)
    .map((i, idx) => {
      // 인덱스 재매핑 — peFoam 빠진 후 mainIdx 위치 보정
      const adjustedMainIdx = mainIdx > peFoamIdx ? mainIdx - 1 : mainIdx;
      return idx === adjustedMainIdx
        ? { ...i, total: mergedTotal, unitPrice: mergedUnitPrice }
        : i;
    });
}

/**
 * 5-bucket summary for 간단 내역.
 * 이윤(synthetic line)은 심플에선 별도 표시하지 않고 **시공비에 녹인다** — 5줄짜리
 * 요약에서 "이윤" 줄이 튀면 고객 거부감이 생기기 때문 (2026-06-16 사용자 결정).
 * 상세 견적서(groupForDetailed)에서는 표준품셈 형식으로 이윤 줄을 유지한다.
 */
function groupForSimple(items: DisplayLineItem[]): SimpleLine[] {
  const buckets = {
    material: 0,   // 자재 + 마감재 + 부자재 + 하지
    construction: 0, // 인건 + 식비 + 숙박비 + 이윤(녹임)
    equipment: 0,  // 장비 + 운송
    waste: 0,      // 폐기 + 철거
    other: 0,      // 현장 경비 (제경비·팀경비 등)
  };
  for (const i of items) {
    if (i.synthetic && i.name === "이윤") { buckets.construction += i.total; continue; }
    // 팀 경비(잡비)는 고객에 노출 안 함 — 시공비에 녹임 (숙박비는 category lodging 으로 이미 녹음).
    if (i.name === "팀 경비") { buckets.construction += i.total; continue; }
    if (i.category === "material") buckets.material += i.total;
    else if (i.category === "labor" || i.category === "meals" || i.category === "lodging") buckets.construction += i.total;
    else if (i.category === "equipment" || i.category === "transport") buckets.equipment += i.total;
    else if (i.category === "waste" || i.category === "removal") buckets.waste += i.total;
    else buckets.other += i.total;
  }
  const lines: SimpleLine[] = [];
  if (buckets.material) lines.push({ name: "자재 및 마감 일체", amount: buckets.material });
  if (buckets.construction) lines.push({ name: "시공비 (현장 관리 포함)", amount: buckets.construction });
  if (buckets.equipment) lines.push({ name: "장비 및 운송", amount: buckets.equipment });
  if (buckets.waste) lines.push({ name: "철거 및 폐기물 처리", amount: buckets.waste });
  if (buckets.other) lines.push({ name: "현장 경비", amount: buckets.other });
  return lines;
}

/**
 * Detail view groups by 자재공사 / 노무비 / 기타경비 (Korean industry-standard).
 * Material items are shown individually. Labor/meals/lodging are rolled up into
 * one "인건비 (기공·조공)" line under 노무비 (no per-worker breakdown for customer).
 * Everything else (equipment, transport, waste, removal, other) goes under 기타경비.
 */
function groupForDetailed(items: DisplayLineItem[]): DetailedLine[] {
  const out: DetailedLine[] = [];
  const laborItems: DisplayLineItem[] = [];
  let profitTotal = 0;
  for (const item of items) {
    if (item.synthetic && item.name === "이윤") { profitTotal += item.total; continue; }
    // 팀 경비(잡비)·숙박은 고객 상세에 별도 노출 안 함 — 인건비에 녹임.
    if (item.name === "팀 경비" || item.category === "labor" || item.category === "meals" || item.category === "lodging") {
      laborItems.push(item);
      continue;
    }
    const group = item.category === "material" ? "자재공사" : "기타경비";
    const qty = `${item.quantity}${item.unit ?? ""}`;
    // Spec column: 단가/단위. 직접 금액을 고친 라인처럼 단가×수량이 금액과 안 맞으면 단가는 숨긴다
    // (고객이 계산해 보고 안 맞으면 신뢰 문제).
    const consistent = Math.abs(item.unitPrice * item.quantity - item.total) <= Math.max(1, item.total * 0.01);
    const spec = consistent && item.unitPrice > 0 && item.unit && item.unit !== "%" && item.unit !== "식"
      ? `${fmt(item.unitPrice)}/${item.unit}`
      : "—";
    out.push({ group, name: customerName(item.name), spec, qty, amount: item.total });
  }
  // Roll up labor into one line under 노무비 (already includes labor's share
  // of margin because distributeMarginForDisplay scaled it before us).
  if (laborItems.length) {
    const laborTotal = laborItems.reduce((s, i) => s + i.total, 0);
    // 인일 수량만 합산 (처마/덴조 '건' 같은 다른 단위를 섞지 않게).
    const laborQty = laborItems
      .filter((i) => i.category === "labor" && (i.unit ?? "").includes("일"))
      .reduce((s, i) => s + i.quantity, 0);
    const qty = laborQty > 0 ? `${laborQty}인일` : "1식";
    out.push({ group: "노무비", name: "인건비 (기공·조공)", spec: "—", qty, amount: laborTotal });
  }
  // 이윤 as its own group at the bottom — mirrors 표준품셈 형식 where 이윤
  // sits as its own row between 순공사원가 and 부가세.
  if (profitTotal > 0) {
    out.push({ group: "이윤", name: "이윤", spec: "—", qty: "1식", amount: profitTotal });
  }
  // Sort by group order: 자재공사 → 노무비 → 기타경비 → 이윤
  const order = { "자재공사": 1, "노무비": 2, "기타경비": 3, "이윤": 4 } as Record<string, number>;
  out.sort((a, b) => (order[a.group] ?? 99) - (order[b.group] ?? 99));
  return out;
}

// ─── Payment parsing ───────────────────────────────────────────────────
interface PaymentStage { label: string; percent: number; amount: number; }

/**
 * Parse the paymentTerms string into structured stages. Supports patterns like:
 *   "계약금 30% / 잔금 70%"
 *   "계약금 30% · 계약 시 / 잔금 70% · 완공 시"
 *   "계약금 30% / 중도금 40% / 잔금 30%"
 * Returns null if parsing fails or no percentages found.
 */
function parsePaymentStages(terms: string, finalPrice: number): PaymentStage[] | null {
  if (!terms) return null;
  const parts = terms.split(/\s*\/\s*/);
  const stages: PaymentStage[] = [];
  for (const part of parts) {
    const match = part.match(/^(.+?)\s+(\d+)\s*%\s*(.*)$/);
    if (!match) return null;
    const baseLabel = match[1].trim();
    const percent = parseInt(match[2]);
    const timing = match[3].trim().replace(/^[·\-\s]+/, "").trim();
    const label = timing ? `${baseLabel} · ${timing}` : baseLabel;
    stages.push({
      label,
      percent: percent / 100,
      amount: Math.round(finalPrice * percent / 100),
    });
  }
  if (stages.length === 0) return null;
  // 단계별 반올림 오차는 마지막 단계가 흡수 — 계약금+잔금이 최종 금액과 원 단위까지 일치.
  const allocated = stages.slice(0, -1).reduce((s, x) => s + x.amount, 0);
  stages[stages.length - 1].amount = finalPrice - allocated;
  return stages;
}

// ─── PDF Doc ───────────────────────────────────────────────────────────
interface Props {
  estimate: Estimate & { lineItems: EstimateLineItem[]; site: Site };
  scopeFlags: ScopeFlags;
  detailLevel?: "simple" | "detailed";
  /** How to split the margin into material / labor / 이윤 display portions.
   *  Read from PricingSettings by the PDF route. Defaults to 50/25/25 if
   *  not provided (legacy callers). */
  marginRatios?: MarginDistributionRatios;
  /** 직인 이미지 — PDF 라우트가 미리 받아 검증한 버퍼 (없으면 '(인)' 표시). URL 을 직접 넘기지
   *  않는 이유: react-pdf 가 렌더 중 원격 fetch 에 실패하면 PDF 전체가 깨졌다. */
  sealImage?: { data: Buffer; format: "png" | "jpg" } | null;
}

export function EstimatePDFDoc({
  estimate,
  scopeFlags,
  detailLevel = "simple",
  marginRatios = { material: 0.5, labor: 0.25, profit: 0.25 },
  sealImage = null,
}: Props) {
  const vatNote = estimate.vatIncluded ? "부가세 포함" : "부가세 별도";
  // 발행일 = 생성 또는 마지막 재발행(전체 수정) 시점. 구 견적은 생성일.
  const issuedStr = formatDateKST(estimate.issuedAt ?? estimate.createdAt);
  // 고객명·주소는 견적 시점 스냅샷 (현장 정보를 나중에 고쳐도 발송한 견적서는 그대로). 구 견적은 라이브 폴백.
  const customer = estimate.customerNameSnapshot ?? estimate.site.customerName ?? "";
  const address = estimate.siteAddressSnapshot ?? estimate.site.siteAddress ?? "";
  const constructionMonthStr = formatMonth(estimate.constructionMonth ?? null);
  const pyeong = Math.round(estimate.areaM2 / 3.3058);

  // Material spec pills
  const pills: string[] = [];
  if (estimate.materialType) pills.push(materialLabel(estimate.materialType));
  if (estimate.materialThickness) pills.push(`${estimate.materialThickness}T`);
  if (estimate.materialTexture) pills.push(estimate.materialTexture);
  if (estimate.materialColor) pills.push(estimate.materialColor);

  // Cost lines
  // Merge PE폼 부착 into the main steel sheet line (presentation-only — internal
  // EstimateLineItem rows stay separate so the salesperson can see the breakdown
  // in-app). Customer sees one combined "강판 + PE폼" amount.
  const mergedLineItems = mergePeFoamIntoMaterial(estimate.lineItems);

  // Apply margin distribution BEFORE grouping. Internal estimate.lineItems
  // is cost only (snapshot rule); displayLines has the margin baked in plus
  // a synthetic 이윤 row. Subtotal of displayLines == cost + margin == 공급가액.
  const displayLines = distributeMarginForDisplay(
    mergedLineItems,
    estimate.marginAmount,
    marginRatios,
  );
  const simpleLines = groupForSimple(displayLines);
  const detailedLines = groupForDetailed(displayLines);
  // 공급가액 = 표시 라인 합계(원가 + 마진). 부가세 포함이면 부가세 = 최종가 − 공급가액 으로 맞춰
  // '공급가액 + 부가세 = 최종 견적 금액'이 원 단위까지 정확히 떨어지게 한다.
  // (이전엔 '소계 (부가세 포함)' 에 공급가가 찍혀 최종 금액과 10% 어긋났다.)
  const supplyShown = displayLines.reduce((s, l) => s + l.total, 0);
  const vatShown = estimate.vatIncluded ? estimate.finalPrice - supplyShown : 0;
  const sumRows = [
    { label: "공급가액", amount: supplyShown },
    ...(estimate.vatIncluded ? [{ label: "부가세 (10%)", amount: vatShown }] : []),
  ];

  // Payment stages
  const paymentStages = parsePaymentStages(estimate.paymentTerms ?? "", estimate.finalPrice);

  // Notice lines (split by newline, strip leading numbers since we add them ourselves)
  const noticeLines = (estimate.noticeTextSnapshot ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);

  return (
    <Document title={`견적서 - ${customer}`}>
      <Page size="A4" style={styles.page}>
        {/* ─── Header (dark navy) ─── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{estimate.companyNameSnapshot || ""}</Text>
            {[
              estimate.businessRegistrationNumberSnapshot
                ? `사업자등록번호: ${estimate.businessRegistrationNumberSnapshot}`
                : null,
              [estimate.companyPhoneSnapshot, estimate.companyAddressSnapshot].filter(Boolean).join(" · ") || null,
            ]
              .filter((s): s is string => Boolean(s))
              .map((s, i) => (
                <Text key={`hm-${i}`} style={styles.headerMeta}>{s}</Text>
              ))}
          </View>
          <View style={styles.headerRight}>
            {[
              estimate.estimateNumber ? `No. ${estimate.estimateNumber}` : null,
              `${issuedStr} 발행`,
              `${estimate.validityDays}일간 유효`,
            ]
              .filter((s): s is string => Boolean(s))
              .map((s, i) => (
                <Text key={`hr-${i}`} style={styles.headerRightLine}>{s}</Text>
              ))}
          </View>
        </View>

        {/* ─── Customer + Site (two columns) ─── */}
        <View style={styles.topRow}>
          <View style={styles.topCol}>
            <Text style={styles.labelTiny}>고객명</Text>
            <Text style={styles.valueLarge}>{`${customer} 님`}</Text>
            <Text style={styles.labelTinyTop}>공사위치</Text>
            <Text style={styles.valueRegular}>{address}</Text>
          </View>
          <View style={styles.topColRight}>
            {/* Always-on rows + optional rows expressed as flat label/value pairs. */}
            {(() => {
              const rows: Array<{ label: string; value: string; top?: boolean }> = [
                { label: "시공면적", value: `${estimate.areaM2 ?? 0}㎡ (약 ${pyeong}평)` },
              ];
              if (estimate.buildingAreaM2) {
                rows.push({
                  label: "건물면적",
                  value: `${estimate.buildingAreaM2}㎡ (약 ${Math.round(estimate.buildingAreaM2 / 3.3058)}평)`,
                  top: true,
                });
              }
              if (constructionMonthStr) {
                rows.push({ label: "공사일정", value: constructionMonthStr, top: true });
              }
              if (estimate.workDays > 0) {
                rows.push({ label: "예상 공사기간", value: `약 ${Math.ceil(estimate.workDays)}일`, top: true });
              }
              return rows.flatMap((r, i) => [
                <Text key={`tr-l-${i}`} style={r.top ? styles.labelTinyTop : styles.labelTiny}>{r.label}</Text>,
                <Text key={`tr-v-${i}`} style={r.label === "시공면적" ? styles.valueLarge : styles.valueRegular}>{r.value}</Text>,
              ]);
            })()}
          </View>
        </View>

        {/* ─── Scope + pills ─── */}
        <View style={styles.scopeSection}>
          <Text style={styles.sectionLabel}>공사 범위</Text>
          <Text style={styles.scopeText}>{scopeOneLine(estimate, scopeFlags) || ""}</Text>
          {pills.length > 0 && (
            <View style={styles.pillRow}>
              {pills
                .filter((p): p is string => Boolean(p))
                .map((p, i) => (
                  <Text key={`p-${i}`} style={styles.pill}>{p}</Text>
                ))}
            </View>
          )}
        </View>

        {/* ─── Cost: simple or detailed ─── */}
        {detailLevel === "simple" ? (
          <View style={styles.simpleSection}>
            <Text style={styles.sectionLabel}>견적 내역</Text>
            {simpleLines.map((line, i) => (
              <View key={i} style={styles.simpleRow}>
                <Text style={styles.simpleLabel}>{line.name}</Text>
                <Text style={styles.simpleValue}>{fmt(line.amount)}</Text>
              </View>
            ))}
            {sumRows.map((r, i) => (
              <View key={`sum-${i}`} style={i === 0 ? styles.subtotalRow : styles.vatRow}>
                <Text style={styles.subtotalLabel}>{r.label}</Text>
                <Text style={styles.subtotalAmount}>{fmt(r.amount)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.detailSection}>
            <Text style={styles.sectionLabel}>상세 내역</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.cellName,   { color: C.muted, fontSize: 9 }]}>품명</Text>
              <Text style={[styles.cellSpec,   { color: C.muted, fontSize: 9 }]}>규격</Text>
              <Text style={[styles.cellQty,    { color: C.muted, fontSize: 9 }]}>수량</Text>
              <Text style={[styles.cellAmount, { color: C.muted, fontSize: 9 }]}>금액</Text>
            </View>
            {/* Flatten group headers + rows into a flat element list — avoids
                nested Views with conditional null children, which has been a
                source of react-pdf "null props" crashes. */}
            {detailedLines.flatMap((line, i) => {
              const showGroupHeader = i === 0 || line.group !== detailedLines[i - 1].group;
              const els: ReactElement[] = [];
              if (showGroupHeader) {
                els.push(
                  <Text key={`grp-${i}`} style={styles.tableGroupHeader}>{line.group || ""}</Text>,
                );
              }
              els.push(
                <View key={`row-${i}`} style={styles.tableRow}>
                  <Text style={styles.cellName}>{line.name || ""}</Text>
                  <Text style={styles.cellSpec}>{line.spec || ""}</Text>
                  <Text style={styles.cellQty}>{line.qty || ""}</Text>
                  <Text style={styles.cellAmount}>{fmt(line.amount)}</Text>
                </View>,
              );
              return els;
            })}
            {sumRows.map((r, i) => (
              <View key={`dsum-${i}`} style={i === 0 ? styles.subtotalRow : styles.vatRow}>
                <Text style={styles.subtotalLabel}>{r.label}</Text>
                <Text style={styles.subtotalAmount}>{fmt(r.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ─── Final total ─── */}
        <View style={styles.totalRow}>
          <View style={styles.totalLeft}>
            <Text style={styles.totalLabel}>최종 견적 금액</Text>
            <Text style={styles.totalVatNote}>{vatNote}</Text>
          </View>
          <Text style={styles.totalAmount}>{`${fmt(estimate.finalPrice)}원`}</Text>
        </View>

        {/* ─── Payment ─── */}
        <View style={styles.payment}>
          {paymentStages && paymentStages.length > 1 ? (
            <View style={styles.paymentCards}>
              {paymentStages.map((s, i) => (
                <View key={`pay-${i}`} style={styles.paymentCard}>
                  <Text style={styles.paymentLabel}>{s.label || ""}</Text>
                  <Text style={styles.paymentAmount}>{`${fmt(s.amount)}원`}</Text>
                  <Text style={styles.paymentPercent}>{`${Math.round(s.percent * 100)}%`}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.paymentText}>{estimate.paymentTerms || ""}</Text>
          )}
          {estimate.bankAccountSnapshot && (
            <Text style={styles.paymentBank}>{`입금계좌: ${estimate.bankAccountSnapshot}`}</Text>
          )}
        </View>

        {/* ─── Notice + Signature ─── */}
        {/* 안내 목록은 페이지를 넘어갈 수 있고, 서명 행만 쪼개지지 않게 + 마지막 안내 줄이 서명과
            같은 페이지에 오도록(minPresenceAhead) — 서명·직인만 다음 페이지에 고립되지 않게. */}
        <View style={styles.notice}>
          {noticeLines.length > 0 ? (
            <View>
              {noticeLines.map((l, i) => (
                <Text key={`n-${i}`} style={styles.noticeText} minPresenceAhead={i === noticeLines.length - 1 ? 60 : 0}>{`${i + 1}. ${l}`}</Text>
              ))}
            </View>
          ) : (
            <Text style={styles.noticeText}>
              본 견적은 현장 조건 및 추가 요청 사항에 따라 변경될 수 있습니다.
            </Text>
          )}
          <View style={styles.signatureRow} wrap={false}>
            <Text style={styles.signatureLeft}>위와 같이 견적합니다.</Text>
            <View style={styles.signatureRight}>
              <Text style={styles.companyAbove}>{estimate.companyNameSnapshot || ""}</Text>
              <View style={styles.sealCircle}>
                {/* 직인: 라우트가 미리 받아 검증한 버퍼만 렌더 (원격 URL 직접 fetch 금지 — 실패 시
                    PDF 전체가 깨지던 원인). 없거나 실패하면 (인). */}
                {sealImage ? (
                  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image (PDF 요소, HTML img 아님 — alt 속성 없음)
                  <Image src={sealImage} style={styles.sealImage} />
                ) : (
                  <Text style={styles.sealPlaceholder}>(인)</Text>
                )}
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
