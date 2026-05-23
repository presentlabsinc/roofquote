"use client";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { Estimate, EstimateLineItem, Site } from "@prisma/client";
import type { ScopeFlags } from "@/lib/types";

Font.register({
  family: "Noto Sans KR",
  src: "https://fonts.gstatic.com/s/notosanskr/v36/PbykFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLTq8H4hfeE.woff2",
});

const styles = StyleSheet.create({
  page: { fontFamily: "Noto Sans KR", fontSize: 10, padding: 40, color: "#1a1a1a", backgroundColor: "#ffffff" },
  header: { marginBottom: 24, borderBottom: "2pt solid #1a56db", paddingBottom: 12 },
  companyName: { fontSize: 18, fontWeight: "bold", color: "#1a56db", marginBottom: 4 },
  companyMeta: { fontSize: 9, color: "#666" },
  title: { fontSize: 16, fontWeight: "bold", textAlign: "center", marginBottom: 20, color: "#1a1a1a" },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 6, color: "#1a56db", borderBottom: "0.5pt solid #ddd", paddingBottom: 3 },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 100, fontSize: 9, color: "#666" },
  value: { flex: 1, fontSize: 9 },
  scopeItem: { fontSize: 9, marginBottom: 3, paddingLeft: 10 },
  priceBox: { backgroundColor: "#f0f4ff", padding: 12, borderRadius: 4, marginTop: 8 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  priceLabel: { fontSize: 10, color: "#444" },
  priceValue: { fontSize: 10, fontWeight: "bold" },
  finalPrice: { flexDirection: "row", justifyContent: "space-between", borderTop: "1pt solid #1a56db", paddingTop: 8, marginTop: 8 },
  finalLabel: { fontSize: 13, fontWeight: "bold", color: "#1a56db" },
  finalValue: { fontSize: 13, fontWeight: "bold", color: "#1a56db" },
  footer: { fontSize: 8, color: "#999", marginTop: 20, borderTop: "0.5pt solid #eee", paddingTop: 8 },
  notice: { fontSize: 8, color: "#666", backgroundColor: "#fffbf0", padding: 8, borderRadius: 4, marginTop: 8 },
  vatBadge: { fontSize: 8, color: "#d97706", backgroundColor: "#fffbeb", padding: "3 6", borderRadius: 3, alignSelf: "flex-start", marginTop: 4 },
});

function scopeLabel(scope: ScopeFlags): string[] {
  const lines: string[] = [];
  if (scope.colorSteel) lines.push("• 칼라강판 시공 및 주요 마감");
  if (scope.overlay) lines.push("• 기존 지붕 덧씌우기 방식 시공");
  if (scope.removal) lines.push("• 기존 지붕 철거 및 처리");
  if (scope.ridge) lines.push("• 용마루 마감");
  if (scope.eave) lines.push("• 처마 마감");
  if (scope.gutter) lines.push("• 물받이 교체");
  if (scope.waste) lines.push("• 폐기물 처리 및 현장 정리");
  if (scope.skylift || scope.ladderTruck) lines.push("• 장비 및 안전 작업");
  if (lines.length === 0) lines.push("• 지붕공사 관련 작업 일체");
  return lines;
}

function buildWorkTitle(scope: ScopeFlags): string {
  if (scope.colorSteel && scope.removal) return "기존 지붕 철거 후 칼라강판 지붕공사";
  if (scope.colorSteel && scope.overlay) return "칼라강판 지붕 덧씌우기 공사";
  if (scope.colorSteel) return "칼라강판 지붕공사";
  return "지붕공사";
}

interface Props {
  estimate: Estimate & { lineItems: EstimateLineItem[]; site: Site };
  scopeFlags: ScopeFlags;
}

export function EstimatePDFDoc({ estimate, scopeFlags }: Props) {
  const workTitle = buildWorkTitle(scopeFlags);
  const finalPriceFormatted = estimate.finalPrice.toLocaleString("ko-KR") + "원";
  const supplyPriceFormatted = estimate.supplyPrice.toLocaleString("ko-KR") + "원";
  const vatFormatted = estimate.vat.toLocaleString("ko-KR") + "원";
  const validUntil = new Date(estimate.createdAt);
  validUntil.setDate(validUntil.getDate() + estimate.validityDays);
  const validUntilStr = validUntil.toLocaleDateString("ko-KR");
  const createdStr = new Date(estimate.createdAt).toLocaleDateString("ko-KR");

  return (
    <Document title={`견적서 - ${estimate.site.customerName}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>{estimate.companyNameSnapshot}</Text>
          {estimate.companyPhoneSnapshot && (
            <Text style={styles.companyMeta}>연락처: {estimate.companyPhoneSnapshot}</Text>
          )}
          {estimate.companyAddressSnapshot && (
            <Text style={styles.companyMeta}>{estimate.companyAddressSnapshot}</Text>
          )}
        </View>

        {/* Title */}
        <Text style={styles.title}>견 적 서</Text>

        {/* Customer Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>고객 정보</Text>
          <View style={styles.row}>
            <Text style={styles.label}>고객명</Text>
            <Text style={styles.value}>{estimate.site.customerName}</Text>
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
          <View style={styles.row}>
            <Text style={styles.label}>견적일</Text>
            <Text style={styles.value}>{createdStr}</Text>
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
            <Text style={styles.label}>예상 면적</Text>
            <Text style={styles.value}>{estimate.areaM2}㎡ ({Math.round(estimate.areaM2 / 3.3058 * 10) / 10}평)</Text>
          </View>
          <View style={[styles.row, { marginTop: 6 }]}>
            <Text style={styles.label}>공사 범위</Text>
            <View style={{ flex: 1 }}>
              {scopeLabel(scopeFlags).map((line, i) => (
                <Text key={i} style={styles.scopeItem}>{line}</Text>
              ))}
            </View>
          </View>
        </View>

        {/* Price */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>견적 금액</Text>
          <View style={styles.priceBox}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>공급가</Text>
              <Text style={styles.priceValue}>{supplyPriceFormatted}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>부가세 (10%)</Text>
              <Text style={styles.priceValue}>{vatFormatted}</Text>
            </View>
            <View style={styles.finalPrice}>
              <Text style={styles.finalLabel}>최종 견적가</Text>
              <Text style={styles.finalValue}>{finalPriceFormatted}</Text>
            </View>
            <Text style={styles.vatBadge}>{estimate.vatIncluded ? "VAT 포함" : "VAT 별도"}</Text>
          </View>
        </View>

        {/* Payment Terms */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>결제 조건</Text>
          <View style={styles.row}>
            <Text style={styles.label}>결제 방식</Text>
            <Text style={styles.value}>{estimate.paymentTerms}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>견적 유효기간</Text>
            <Text style={styles.value}>{validUntilStr}까지 ({estimate.validityDays}일)</Text>
          </View>
        </View>

        {/* Notice */}
        <View style={styles.notice}>
          <Text>본 견적은 현장 조건 및 추가 요청 사항에 따라 변경될 수 있습니다.</Text>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          {estimate.companyNameSnapshot} {estimate.companyPhoneSnapshot ? `| ${estimate.companyPhoneSnapshot}` : ""}
        </Text>
      </Page>
    </Document>
  );
}
