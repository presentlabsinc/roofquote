"use client";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { Estimate, EstimateLineItem, Site } from "@prisma/client";
import type { ScopeFlags, ConstructionType } from "@/lib/types";
import { MATERIAL_TYPES, SCOPE_LABELS } from "@/lib/types";

Font.register({
  family: "Noto Sans KR",
  src: "https://fonts.gstatic.com/s/notosanskr/v36/PbykFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLTq8H4hfeE.woff2",
});

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
  page: { fontFamily: "Noto Sans KR", fontSize: 10, padding: 0, color: C.text, backgroundColor: "#ffffff" },
  body: { padding: 24, paddingTop: 0 },

  // — Header (dark navy)
  header: { backgroundColor: C.ink, padding: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  companyName: { color: C.textOnDark, fontSize: 15, fontWeight: "bold", letterSpacing: 0.4 },
  headerMeta: { color: C.metaOnDark, fontSize: 9, lineHeight: 1.5, marginTop: 4 },
  headerRight: { alignItems: "flex-end" },
  headerRightLine: { color: C.metaOnDark, fontSize: 9, marginBottom: 2 },

  // — Customer + site row (two columns)
  topRow: { flexDirection: "row", justifyContent: "space-between", borderBottom: `0.5pt solid ${C.border}`, padding: 16 },
  topCol: { flex: 1 },
  topColRight: { flex: 1, alignItems: "flex-end" },
  labelTiny: { fontSize: 9, color: C.muted, marginBottom: 2 },
  labelTinyTop: { fontSize: 9, color: C.muted, marginTop: 8, marginBottom: 2 },
  valueLarge: { fontSize: 12, fontWeight: "bold", color: C.text },
  valueRegular: { fontSize: 10, color: C.text },

  // — Section: scope + pills
  scopeSection: { padding: 16, borderBottom: `0.5pt solid ${C.border}` },
  sectionLabel: { fontSize: 9, color: C.muted, letterSpacing: 0.5, marginBottom: 6 },
  scopeText: { fontSize: 10.5, color: C.text, lineHeight: 1.5, marginBottom: 8 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  pill: { fontSize: 9, color: C.pillText, backgroundColor: C.pillBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },

  // — Simple view
  simpleSection: { padding: 16, borderBottom: `0.5pt solid ${C.border}` },
  simpleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  simpleLabel: { fontSize: 11, color: C.text },
  simpleValue: { fontSize: 11, fontWeight: "bold", color: C.text },

  // — Detailed table
  detailSection: { padding: 16, borderBottom: `0.5pt solid ${C.border}` },
  tableHeaderRow: { flexDirection: "row", borderBottom: `0.5pt solid ${C.border}`, paddingBottom: 4, marginBottom: 4 },
  tableGroupHeader: { fontSize: 9.5, color: C.muted, paddingTop: 6, paddingBottom: 4 },
  tableRow: { flexDirection: "row", paddingVertical: 2.5 },
  cellName: { flex: 3.5, fontSize: 10, color: C.text },
  cellSpec: { flex: 1.7, fontSize: 10, color: C.muted, textAlign: "right" },
  cellQty:  { flex: 1.2, fontSize: 10, color: C.muted, textAlign: "right" },
  cellAmount: { flex: 1.8, fontSize: 10, color: C.text, textAlign: "right" },
  subtotalRow: { flexDirection: "row", marginTop: 6, paddingTop: 6, borderTop: `0.5pt solid ${C.border}` },
  subtotalLabel: { flex: 1, fontSize: 10.5, color: C.muted },
  subtotalAmount: { fontSize: 10.5, color: C.muted, textAlign: "right" },

  // — Final total (filled card)
  totalRow: { backgroundColor: C.totalBg, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottom: `0.5pt solid ${C.border}` },
  totalLeft: { flexDirection: "row", alignItems: "baseline" },
  totalLabel: { fontSize: 12, fontWeight: "bold", color: C.ink },
  totalVatNote: { fontSize: 9, color: C.mutedLight, marginLeft: 6 },
  totalAmount: { fontSize: 17, fontWeight: "bold", color: C.ink },

  // — Payment (two cards)
  payment: { padding: 16, borderBottom: `0.5pt solid ${C.border}` },
  paymentCards: { flexDirection: "row", gap: 8, marginBottom: 10 },
  paymentCard: { flex: 1, padding: 10, border: `0.5pt solid ${C.border}`, borderRadius: 6, alignItems: "center" },
  paymentLabel: { fontSize: 8.5, color: C.muted, marginBottom: 4 },
  paymentAmount: { fontSize: 12, fontWeight: "bold", color: C.text, marginBottom: 2 },
  paymentPercent: { fontSize: 8.5, color: C.muted },
  paymentText: { fontSize: 10, color: C.text, marginBottom: 6, fontWeight: "bold" },
  paymentBank: { fontSize: 9.5, color: C.muted },

  // — Notice + signature
  notice: { padding: 16 },
  noticeText: { fontSize: 9.5, color: C.muted, lineHeight: 1.6, marginBottom: 12 },
  signatureRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 4 },
  signatureLeft: { fontSize: 9.5, color: C.muted },
  signatureRight: { alignItems: "center" },
  companyAbove: { fontSize: 9.5, color: C.muted, marginBottom: 6 },
  sealCircle: { width: 48, height: 48, borderRadius: 24, borderWidth: 0.7, borderColor: C.sealBorder, alignItems: "center", justifyContent: "center" },
  sealPlaceholder: { fontSize: 9, color: C.sealText },
  sealImage: { width: 48, height: 48, borderRadius: 24 },
});

function materialLabel(type: string | null): string {
  if (!type) return "칼라강판";
  return MATERIAL_TYPES.find((m) => m.value === type)?.label ?? "칼라강판";
}

function constructionTypeLabel(t: string): string {
  if (t === "steelWaterproof") return "옥상 스틸방수 (바닥형)";
  if (t === "rooftopRoof") return "옥상지붕 (지붕형)";
  return "지붕공사";
}

function buildWorkTitle(estimate: Estimate, scope: ScopeFlags): string {
  const mat = materialLabel(estimate.materialType ?? null);
  if (estimate.constructionType === "steelWaterproof") return `${mat} 옥상 스틸방수`;
  if (estimate.constructionType === "rooftopRoof") return `${mat} 옥상지붕 시공`;
  if (scope.removal) return `${mat} 지붕공사 (기존 지붕 철거)`;
  if (scope.overlay) return `${mat} 지붕공사 (기존 지붕 덧씌우기)`;
  return `${mat} 지붕공사`;
}

function scopeOneLine(estimate: Estimate, scope: ScopeFlags): string {
  // Builds one comma-joined sentence like the v4 mockup, including the work title.
  const parts: string[] = [];
  parts.push(buildWorkTitle(estimate, scope));

  const ct = estimate.constructionType as ConstructionType;
  const keys: (keyof ScopeFlags)[] = (() => {
    if (ct === "roof") return ["ridge", "eave", "waste"];
    if (ct === "rooftopRoof") return ["frameReinforcement", "ridge", "eave", "warehouse", "stairwell", "rooftopRoom", "waste"];
    return ["handrail", "cap", "drainHole", "warehouse", "stairwell", "rooftopRoom", "waste"];
  })();
  // Combine ridge+eave nicely if both
  if (scope.ridge && scope.eave) parts.push("용마루 및 처마 마감");
  else if (scope.ridge) parts.push("용마루 마감");
  else if (scope.eave) parts.push("처마 마감");
  // Gutter — from mode
  if (estimate.gutterMode && estimate.gutterMode !== "none") {
    parts.push("물받이 교체");
  }
  for (const k of keys) {
    if (k === "ridge" || k === "eave") continue; // already handled
    if (scope[k]) parts.push(SCOPE_LABELS[k]);
  }
  // Always include waste/safety blurbs as in mockup
  if (scope.skylift || scope.ladderTruck || scope.scaffold) parts.push("장비 및 안전 작업");

  // dedupe + join
  return Array.from(new Set(parts)).join(" · ");
}

function formatMonth(yyyymm: string | null): string | null {
  if (!yyyymm) return null;
  const [y, m] = yyyymm.split("-");
  if (!y || !m) return null;
  return `${y}년 ${parseInt(m)}월 중`;
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

// ─── Cost grouping ─────────────────────────────────────────────────────
interface SimpleLine { name: string; amount: number; }
interface DetailedLine { group: string; name: string; spec: string; qty: string; amount: number; }

function groupForSimple(items: EstimateLineItem[]): SimpleLine[] {
  const buckets = {
    material: 0,   // 자재 + 마감재 + 부자재 + 하지
    construction: 0, // 인건 + 식비 + 숙박비
    equipment: 0,  // 장비 + 운송
    waste: 0,      // 폐기 + 철거
    other: 0,      // 기타
  };
  for (const i of items) {
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
  if (buckets.other) lines.push({ name: "기타 비용", amount: buckets.other });
  return lines;
}

/**
 * Detail view groups by 자재공사 / 노무비 / 기타경비 (Korean industry-standard).
 * Material items are shown individually. Labor/meals/lodging are rolled up into
 * one "인건비 (기공·조공)" line under 노무비 (no per-worker breakdown for customer).
 * Everything else (equipment, transport, waste, removal, other) goes under 기타경비.
 */
function groupForDetailed(items: EstimateLineItem[]): DetailedLine[] {
  const out: DetailedLine[] = [];
  const laborItems: EstimateLineItem[] = [];
  for (const item of items) {
    if (item.category === "labor" || item.category === "meals" || item.category === "lodging") {
      laborItems.push(item);
      continue;
    }
    const group = item.category === "material" ? "자재공사" : "기타경비";
    const qty = `${item.quantity}${item.unit ?? ""}`;
    // Spec column: derive a brief spec from unit or unit price
    const spec = item.unitPrice > 0 && item.unit && item.unit !== "%" && item.unit !== "식"
      ? `${fmt(item.unitPrice)}/${item.unit}`
      : "—";
    out.push({ group, name: item.name, spec, qty, amount: item.total });
  }
  // Roll up labor into one line under 노무비
  if (laborItems.length) {
    const laborTotal = laborItems.reduce((s, i) => s + i.total, 0);
    // Try to find a "person·day" type quantity
    const laborQty = laborItems
      .filter((i) => i.category === "labor")
      .reduce((s, i) => s + i.quantity, 0);
    const qty = laborQty > 0 ? `${laborQty}인일` : "1식";
    out.push({ group: "노무비", name: "인건비 (기공·조공)", spec: "—", qty, amount: laborTotal });
  }
  // Sort by group order: 자재공사 → 노무비 → 기타경비
  const order = { "자재공사": 1, "노무비": 2, "기타경비": 3 } as Record<string, number>;
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
  return stages;
}

// ─── PDF Doc ───────────────────────────────────────────────────────────
interface Props {
  estimate: Estimate & { lineItems: EstimateLineItem[]; site: Site };
  scopeFlags: ScopeFlags;
  detailLevel?: "simple" | "detailed";
}

export function EstimatePDFDoc({ estimate, scopeFlags, detailLevel = "simple" }: Props) {
  const vatNote = estimate.vatIncluded ? "부가세 포함" : "부가세 별도";
  const createdStr = new Date(estimate.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\.$/, "");
  const constructionMonthStr = formatMonth(estimate.constructionMonth ?? null);
  const pyeong = Math.round(estimate.areaM2 / 3.3058);

  // Material spec pills
  const pills: string[] = [];
  if (estimate.materialType) pills.push(materialLabel(estimate.materialType));
  if (estimate.materialThickness) pills.push(`${estimate.materialThickness}T`);
  if (estimate.materialTexture) pills.push(estimate.materialTexture);
  if (estimate.materialColor) pills.push(estimate.materialColor);

  // Cost lines
  const simpleLines = groupForSimple(estimate.lineItems);
  const detailedLines = groupForDetailed(estimate.lineItems);
  const detailedSubtotal = detailedLines.reduce((s, l) => s + l.amount, 0);

  // Payment stages
  const paymentStages = parsePaymentStages(estimate.paymentTerms ?? "", estimate.finalPrice);

  // Notice lines (split by newline, strip leading numbers since we add them ourselves)
  const noticeLines = (estimate.noticeTextSnapshot ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);

  return (
    <Document title={`견적서 - ${estimate.site.customerName}`}>
      <Page size="A4" style={styles.page}>
        {/* ─── Header (dark navy) ─── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{estimate.companyNameSnapshot}</Text>
            <Text style={styles.headerMeta}>
              {estimate.businessRegistrationNumberSnapshot && `사업자등록번호: ${estimate.businessRegistrationNumberSnapshot}`}
              {estimate.businessRegistrationNumberSnapshot && "\n"}
              {estimate.companyPhoneSnapshot}
              {estimate.companyAddressSnapshot && ` · ${estimate.companyAddressSnapshot}`}
            </Text>
          </View>
          <View style={styles.headerRight}>
            {estimate.estimateNumber && <Text style={styles.headerRightLine}>No. {estimate.estimateNumber}</Text>}
            <Text style={styles.headerRightLine}>{createdStr} 발행</Text>
            <Text style={styles.headerRightLine}>{estimate.validityDays}일간 유효</Text>
          </View>
        </View>

        {/* ─── Customer + Site (two columns) ─── */}
        <View style={styles.topRow}>
          <View style={styles.topCol}>
            <Text style={styles.labelTiny}>고객명</Text>
            <Text style={styles.valueLarge}>{estimate.site.customerName} 님</Text>
            <Text style={styles.labelTinyTop}>공사위치</Text>
            <Text style={styles.valueRegular}>{estimate.site.siteAddress}</Text>
          </View>
          <View style={styles.topColRight}>
            <Text style={styles.labelTiny}>시공면적</Text>
            <Text style={styles.valueLarge}>{estimate.areaM2}㎡ (약 {pyeong}평)</Text>
            {estimate.buildingAreaM2 && (
              <>
                <Text style={styles.labelTinyTop}>건물면적</Text>
                <Text style={styles.valueRegular}>{estimate.buildingAreaM2}㎡ (약 {Math.round(estimate.buildingAreaM2 / 3.3058)}평)</Text>
              </>
            )}
            {constructionMonthStr && (
              <>
                <Text style={styles.labelTinyTop}>공사일정</Text>
                <Text style={styles.valueRegular}>{constructionMonthStr}</Text>
              </>
            )}
          </View>
        </View>

        {/* ─── Scope + pills ─── */}
        <View style={styles.scopeSection}>
          <Text style={styles.sectionLabel}>공사 범위</Text>
          <Text style={styles.scopeText}>{scopeOneLine(estimate, scopeFlags)}</Text>
          {pills.length > 0 && (
            <View style={styles.pillRow}>
              {pills.map((p, i) => (<Text key={i} style={styles.pill}>{p}</Text>))}
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
          </View>
        ) : (
          <View style={styles.detailSection}>
            <Text style={styles.sectionLabel}>상세 내역</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={styles.cellName}><Text style={{ color: C.muted, fontSize: 9 }}>품명</Text></Text>
              <Text style={styles.cellSpec}><Text style={{ color: C.muted, fontSize: 9 }}>규격</Text></Text>
              <Text style={styles.cellQty}><Text style={{ color: C.muted, fontSize: 9 }}>수량</Text></Text>
              <Text style={styles.cellAmount}><Text style={{ color: C.muted, fontSize: 9 }}>금액</Text></Text>
            </View>
            {(() => {
              const blocks: React.ReactElement[] = [];
              let currentGroup = "";
              detailedLines.forEach((line, i) => {
                if (line.group !== currentGroup) {
                  currentGroup = line.group;
                  blocks.push(
                    <Text key={`g-${i}`} style={styles.tableGroupHeader}>{line.group}</Text>
                  );
                }
                blocks.push(
                  <View key={`r-${i}`} style={styles.tableRow}>
                    <Text style={styles.cellName}>{line.name}</Text>
                    <Text style={styles.cellSpec}>{line.spec}</Text>
                    <Text style={styles.cellQty}>{line.qty}</Text>
                    <Text style={styles.cellAmount}>{fmt(line.amount)}</Text>
                  </View>
                );
              });
              return blocks;
            })()}
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>소계 ({vatNote})</Text>
              <Text style={styles.subtotalAmount}>{fmt(detailedSubtotal)}</Text>
            </View>
          </View>
        )}

        {/* ─── Final total ─── */}
        <View style={styles.totalRow}>
          <View style={styles.totalLeft}>
            <Text style={styles.totalLabel}>최종 견적 금액</Text>
            <Text style={styles.totalVatNote}>{vatNote}</Text>
          </View>
          <Text style={styles.totalAmount}>{fmt(estimate.finalPrice)}원</Text>
        </View>

        {/* ─── Payment ─── */}
        <View style={styles.payment}>
          {paymentStages && paymentStages.length > 1 ? (
            <View style={styles.paymentCards}>
              {paymentStages.map((s, i) => (
                <View key={i} style={styles.paymentCard}>
                  <Text style={styles.paymentLabel}>{s.label}</Text>
                  <Text style={styles.paymentAmount}>{fmt(s.amount)}원</Text>
                  <Text style={styles.paymentPercent}>{Math.round(s.percent * 100)}%</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.paymentText}>{estimate.paymentTerms}</Text>
          )}
          {estimate.bankAccountSnapshot && (
            <Text style={styles.paymentBank}>입금계좌: {estimate.bankAccountSnapshot}</Text>
          )}
        </View>

        {/* ─── Notice + Signature ─── */}
        <View style={styles.notice}>
          {noticeLines.length > 0 ? (
            <View style={styles.noticeText}>
              {noticeLines.map((l, i) => (
                <Text key={i}>{i + 1}. {l}</Text>
              ))}
            </View>
          ) : (
            <Text style={styles.noticeText}>
              본 견적은 현장 조건 및 추가 요청 사항에 따라 변경될 수 있습니다.
            </Text>
          )}
          <View style={styles.signatureRow}>
            <Text style={styles.signatureLeft}>위와 같이 견적합니다.</Text>
            <View style={styles.signatureRight}>
              <Text style={styles.companyAbove}>{estimate.companyNameSnapshot}</Text>
              <View style={styles.sealCircle}>
                {estimate.sealImageUrlSnapshot ? (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image src={estimate.sealImageUrlSnapshot} style={styles.sealImage} />
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
