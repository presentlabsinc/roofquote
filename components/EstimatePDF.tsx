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

const C = {
  primary: "#1a56db",
  text: "#1a1a1a",
  muted: "#666",
  border: "#e5e7eb",
  bg: "#ffffff",
  pillBg: "#eef2ff",
  pillText: "#1e40af",
  rowAlt: "#f9fafb",
};

const styles = StyleSheet.create({
  page: { fontFamily: "Noto Sans KR", fontSize: 10, padding: 36, color: C.text, backgroundColor: C.bg },

  // Header
  header: { marginBottom: 18, borderBottom: `1.5pt solid ${C.primary}`, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  headerLeft: { flex: 1 },
  companyName: { fontSize: 17, fontWeight: "bold", color: C.primary, marginBottom: 4 },
  companyMeta: { fontSize: 8.5, color: C.muted, lineHeight: 1.4 },
  bizNo: { fontSize: 8, color: C.muted, fontWeight: "bold" },
  headerRight: { alignItems: "flex-end" },
  docDate: { fontSize: 8.5, color: C.muted },

  // Title
  title: { fontSize: 16, fontWeight: "bold", textAlign: "center", marginVertical: 14, color: C.text, letterSpacing: 6 },

  // Sections
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 10.5, fontWeight: "bold", marginBottom: 6, color: C.primary, paddingBottom: 3, borderBottom: `0.5pt solid ${C.border}` },
  row: { flexDirection: "row", marginBottom: 3.5 },
  label: { width: 80, fontSize: 9, color: C.muted },
  value: { flex: 1, fontSize: 9.5 },
  scopeItem: { fontSize: 9.5, marginBottom: 2, paddingLeft: 6 },

  // Pills for material spec
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  pill: { backgroundColor: C.pillBg, color: C.pillText, fontSize: 8.5, fontWeight: "bold", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10 },

  // Simple total
  simpleTotalBox: { backgroundColor: "#f0f4ff", padding: 14, borderRadius: 6, marginVertical: 6, alignItems: "center", borderLeft: `3pt solid ${C.primary}` },
  simpleTotalLabel: { fontSize: 10, color: C.muted, marginBottom: 4 },
  simpleTotalValue: { fontSize: 22, fontWeight: "bold", color: C.primary },
  simpleTotalNote: { fontSize: 8.5, color: C.muted, marginTop: 4 },

  // Detailed table
  tableHeader: { flexDirection: "row", backgroundColor: C.primary, paddingVertical: 5, paddingHorizontal: 6, marginTop: 4 },
  tableHeaderCell: { color: "#fff", fontSize: 9, fontWeight: "bold" },
  tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottom: `0.5pt solid ${C.border}` },
  tableRowAlt: { backgroundColor: C.rowAlt },
  tableCell: { fontSize: 9 },
  cellName: { flex: 3 },
  cellSpec: { flex: 2 },
  cellQty: { width: 50, textAlign: "right" },
  cellAmount: { width: 75, textAlign: "right" },
  tableTotalRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderTop: `1pt solid ${C.primary}`, marginTop: 2 },
  tableTotalLabel: { flex: 1, fontSize: 10, fontWeight: "bold", color: C.text },
  tableTotalValue: { width: 75, fontSize: 10, fontWeight: "bold", color: C.primary, textAlign: "right" },

  // Notice
  notice: { fontSize: 8.5, color: C.muted, backgroundColor: "#fffbf0", padding: 8, borderRadius: 4, marginTop: 10 },

  // Seal area
  sealRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 30, paddingTop: 16 },
  sealStatement: { fontSize: 11, fontWeight: "bold", marginRight: 20, color: C.text },
  sealCircle: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: "#9ca3af", borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  sealCirclePlaceholder: { fontSize: 9, color: "#9ca3af" },
  sealImage: { width: 58, height: 58, borderRadius: 29 },

  footer: { fontSize: 7.5, color: "#a3a3a3", marginTop: 14, textAlign: "center" },
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
  const thick = estimate.materialThickness ? ` ${estimate.materialThickness}t` : "";
  if (estimate.constructionType === "steelWaterproof") return `${mat}${thick} 옥상 스틸방수`;
  if (estimate.constructionType === "rooftopRoof") return `${mat}${thick} 옥상지붕 시공`;
  if (scope.removal) return `기존 지붕 철거 후 ${mat}${thick} 지붕공사`;
  if (scope.overlay) return `${mat}${thick} 지붕 덧씌우기 공사`;
  return `${mat}${thick} 지붕공사`;
}

function scopeLabel(estimate: Estimate, scope: ScopeFlags): string[] {
  const lines: string[] = [];
  const showKeys: (keyof ScopeFlags)[] = (() => {
    const ct = estimate.constructionType as ConstructionType;
    if (ct === "roof") return ["overlay", "removal", "ridge", "eave", "waste"];
    if (ct === "rooftopRoof") return ["frameReinforcement", "ridge", "eave", "warehouse", "stairwell", "rooftopRoom", "waste"];
    return ["handrail", "cap", "drainHole", "warehouse", "stairwell", "rooftopRoom", "waste"];
  })();

  for (const key of showKeys) {
    if (scope[key]) lines.push(`• ${SCOPE_LABELS[key]}`);
  }
  if (scope.skylift || scope.ladderTruck || scope.scaffold) lines.push("• 장비 및 안전 작업");
  if (lines.length === 0) lines.push("• 관련 작업 일체");
  return lines;
}

function formatMonth(yyyymm: string | null): string | null {
  if (!yyyymm) return null;
  const [y, m] = yyyymm.split("-");
  if (!y || !m) return null;
  return `${y}년 ${parseInt(m)}월 중`;
}

function fmtKrw(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

/**
 * Group line items for customer view. Internal categories (labor / meals / lodging)
 * get rolled up into "시공비" so the customer sees a clean line without per-worker detail.
 * Material items stay individually visible.
 */
interface CustomerLine {
  name: string;
  spec: string;
  qty: string;
  amount: number;
}

function groupForSimpleCustomerView(items: EstimateLineItem[]): CustomerLine[] {
  // 4-5 buckets covering scope items, per spec
  const buckets = {
    materialMain: 0,        // 강판 + 부자재 + 마감재 + 하지 → "자재 및 마감"
    construction: 0,        // 인건비 + 식비 + 숙박비 → "시공비"
    equipment: 0,           // 장비 + 운송 → "장비 및 운송"
    waste: 0,               // 폐기 + 철거 → "철거 및 폐기물 처리"
    other: 0,               // 기타
  };
  for (const i of items) {
    if (i.category === "material") buckets.materialMain += i.total;
    else if (i.category === "labor" || i.category === "meals" || i.category === "lodging") buckets.construction += i.total;
    else if (i.category === "equipment" || i.category === "transport") buckets.equipment += i.total;
    else if (i.category === "waste" || i.category === "removal") buckets.waste += i.total;
    else buckets.other += i.total;
  }
  const lines: CustomerLine[] = [];
  if (buckets.materialMain) lines.push({ name: "자재 및 마감", spec: "강판·부자재·마감재 일체", qty: "1식", amount: buckets.materialMain });
  if (buckets.construction) lines.push({ name: "시공비", spec: "인력·현장 관리 일체", qty: "1식", amount: buckets.construction });
  if (buckets.equipment) lines.push({ name: "장비 및 운송", spec: "장비 사용·자재 운송", qty: "1식", amount: buckets.equipment });
  if (buckets.waste) lines.push({ name: "철거 및 폐기물 처리", spec: "기존 자재 철거·폐기물 처리", qty: "1식", amount: buckets.waste });
  if (buckets.other) lines.push({ name: "기타", spec: "추가 작업·잡비", qty: "1식", amount: buckets.other });
  return lines;
}

/**
 * Detailed customer view: show material lines individually (with their names + units),
 * but roll up labor/meals/lodging into a single "시공비" line — these are internal costs
 * the customer shouldn't see itemized.
 */
function groupForDetailedCustomerView(items: EstimateLineItem[]): CustomerLine[] {
  const result: CustomerLine[] = [];
  let constructionBucket = 0;

  for (const item of items) {
    if (item.category === "labor" || item.category === "meals" || item.category === "lodging") {
      // Hide individually; roll into 시공비
      constructionBucket += item.total;
      continue;
    }
    // For visible items: spec = "수량 × 단가" hint; qty = "{qty}{unit}"
    const qty = `${item.quantity}${item.unit ?? ""}`;
    const spec = item.unitPrice > 0 ? `${item.unitPrice.toLocaleString("ko-KR")}원/${item.unit ?? "식"}` : "";
    result.push({ name: item.name, spec, qty, amount: item.total });
  }
  if (constructionBucket > 0) {
    result.push({ name: "시공비", spec: "인력·현장 관리 일체", qty: "1식", amount: constructionBucket });
  }
  return result;
}

interface Props {
  estimate: Estimate & { lineItems: EstimateLineItem[]; site: Site };
  scopeFlags: ScopeFlags;
  /** "simple" = 4~5 grouped lines; "detailed" = per-item table (internal items still grouped) */
  detailLevel?: "simple" | "detailed";
}

export function EstimatePDFDoc({ estimate, scopeFlags, detailLevel = "simple" }: Props) {
  const workTitle = buildWorkTitle(estimate, scopeFlags);
  const finalPriceFormatted = fmtKrw(estimate.finalPrice);
  const vatNote = estimate.vatIncluded ? "(부가세 포함)" : "(부가세 별도)";
  const validUntil = new Date(estimate.createdAt);
  validUntil.setDate(validUntil.getDate() + estimate.validityDays);
  const validUntilStr = validUntil.toLocaleDateString("ko-KR");
  const createdStr = new Date(estimate.createdAt).toLocaleDateString("ko-KR");
  const constructionMonthStr = formatMonth(estimate.constructionMonth ?? null);

  const customerLines = detailLevel === "detailed"
    ? groupForDetailedCustomerView(estimate.lineItems)
    : groupForSimpleCustomerView(estimate.lineItems);

  // Material spec pills
  const pills: string[] = [];
  if (estimate.materialType) pills.push(materialLabel(estimate.materialType));
  if (estimate.materialThickness) pills.push(`${estimate.materialThickness}t`);
  if (estimate.materialTexture) pills.push(estimate.materialTexture);
  if (estimate.materialColor) pills.push(estimate.materialColor);

  return (
    <Document title={`견적서 - ${estimate.site.customerName}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>{estimate.companyNameSnapshot}</Text>
            {estimate.businessRegistrationNumberSnapshot && (
              <Text style={styles.bizNo}>사업자등록번호 {estimate.businessRegistrationNumberSnapshot}</Text>
            )}
            {estimate.companyPhoneSnapshot && (
              <Text style={styles.companyMeta}>연락처 {estimate.companyPhoneSnapshot}</Text>
            )}
            {estimate.companyAddressSnapshot && (
              <Text style={styles.companyMeta}>{estimate.companyAddressSnapshot}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docDate}>견적일 {createdStr}</Text>
            <Text style={styles.docDate}>유효기간 {validUntilStr}까지</Text>
          </View>
        </View>

        <Text style={styles.title}>견 적 서</Text>

        {/* Customer Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>고객 정보</Text>
          <View style={styles.row}>
            <Text style={styles.label}>고객명</Text>
            <Text style={styles.value}>{estimate.site.customerName} 귀하</Text>
          </View>
          {estimate.site.customerPhone && (
            <View style={styles.row}>
              <Text style={styles.label}>연락처</Text>
              <Text style={styles.value}>{estimate.site.customerPhone}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>현장 주소</Text>
            <Text style={styles.value}>{estimate.site.siteAddress}</Text>
          </View>
        </View>

        {/* Work Scope */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>공사 내용</Text>
          <View style={styles.row}>
            <Text style={styles.label}>공사명</Text>
            <Text style={styles.value}>{workTitle}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>공사 유형</Text>
            <Text style={styles.value}>{constructionTypeLabel(estimate.constructionType)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>시공 면적</Text>
            <Text style={styles.value}>
              {estimate.areaM2}㎡ ({Math.round(estimate.areaM2 / 3.3058 * 10) / 10}평)
            </Text>
          </View>
          {estimate.buildingAreaM2 && (
            <View style={styles.row}>
              <Text style={styles.label}>건물 면적</Text>
              <Text style={styles.value}>
                {estimate.buildingAreaM2}㎡ ({Math.round(estimate.buildingAreaM2 / 3.3058 * 10) / 10}평)
              </Text>
            </View>
          )}
          {constructionMonthStr && (
            <View style={styles.row}>
              <Text style={styles.label}>공사 일정</Text>
              <Text style={styles.value}>{constructionMonthStr}</Text>
            </View>
          )}
          <View style={[styles.row, { marginTop: 4 }]}>
            <Text style={styles.label}>공사 범위</Text>
            <View style={{ flex: 1 }}>
              {scopeLabel(estimate, scopeFlags).map((line, i) => (
                <Text key={i} style={styles.scopeItem}>{line}</Text>
              ))}
            </View>
          </View>
          {pills.length > 0 && (
            <View style={[styles.row, { marginTop: 6 }]}>
              <Text style={styles.label}>사용 자재</Text>
              <View style={[styles.pillRow, { flex: 1 }]}>
                {pills.map((p, i) => (<Text key={i} style={styles.pill}>{p}</Text>))}
              </View>
            </View>
          )}
        </View>

        {/* Cost — detailed table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>견적 내역</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.cellName]}>품명</Text>
            <Text style={[styles.tableHeaderCell, styles.cellSpec]}>규격</Text>
            <Text style={[styles.tableHeaderCell, styles.cellQty]}>수량</Text>
            <Text style={[styles.tableHeaderCell, styles.cellAmount]}>금액</Text>
          </View>
          {customerLines.map((line, i) => (
            <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={[styles.tableCell, styles.cellName]}>{line.name}</Text>
              <Text style={[styles.tableCell, styles.cellSpec, { color: C.muted }]}>{line.spec}</Text>
              <Text style={[styles.tableCell, styles.cellQty, { color: C.muted }]}>{line.qty}</Text>
              <Text style={[styles.tableCell, styles.cellAmount]}>{line.amount.toLocaleString("ko-KR")}</Text>
            </View>
          ))}
          <View style={styles.tableTotalRow}>
            <Text style={styles.tableTotalLabel}>합계 {vatNote}</Text>
            <Text style={styles.tableTotalValue}>{finalPriceFormatted}</Text>
          </View>
        </View>

        {/* Payment Terms */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>결제 조건</Text>
          <View style={styles.row}>
            <Text style={styles.label}>결제 방식</Text>
            <Text style={styles.value}>{estimate.paymentTerms}</Text>
          </View>
        </View>

        {/* Notice */}
        <View style={styles.notice}>
          <Text>• 본 견적은 현장 조건 및 추가 요청 사항에 따라 변경될 수 있습니다.</Text>
          <Text>• 공사 일정은 날씨·자재 수급 상황에 따라 조정될 수 있습니다.</Text>
        </View>

        {/* Seal */}
        <View style={styles.sealRow}>
          <Text style={styles.sealStatement}>위와 같이 견적합니다.</Text>
          <View style={styles.sealCircle}>
            {estimate.sealImageUrlSnapshot ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={estimate.sealImageUrlSnapshot} style={styles.sealImage} />
            ) : (
              <Text style={styles.sealCirclePlaceholder}>(직인)</Text>
            )}
          </View>
        </View>

        <Text style={styles.footer}>
          {estimate.companyNameSnapshot}
          {estimate.companyPhoneSnapshot ? ` · ${estimate.companyPhoneSnapshot}` : ""}
        </Text>
      </Page>
    </Document>
  );
}
