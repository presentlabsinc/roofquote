/**
 * 고객 PDF 가 저장소에 포함한 Pretendard 폰트(assets/fonts)로 렌더되는지 (2026-09-30).
 * 외부 네트워크를 막은 채 렌더해서, 폰트를 CDN 에서 받던 예전 구조로 돌아가면 이 테스트가 깨진다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentProps } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { EstimatePDFDoc } from "../../components/EstimatePDF";

type Props = ComponentProps<typeof EstimatePDFDoc>;

const now = new Date("2026-09-30T09:00:00+09:00");
const line = (i: number, name: string, category: string, quantity: number, unit: string, unitPrice: number) => ({
  id: `l${i}`, estimateId: "e1", name, category, quantity, unit, unitPrice,
  total: Math.round(quantity * unitPrice), sortOrder: i, isUserEdited: false, createdAt: now, updatedAt: now,
});
const lineItems = [
  line(0, "징크250 강판 (0.45T)", "material", 120, "㎡", 32000),
  line(1, "용마루 절곡", "material", 12, "m", 3600),
  line(2, "기공 인건비", "labor", 6, "품", 250000),
  line(3, "식대·간식", "meals", 6, "인일", 20000),
  line(4, "폐기물 처리", "waste", 1, "차", 1000000),
];
const totalCost = lineItems.reduce((s, l) => s + l.total, 0);
const supply = Math.round(totalCost / (1 - 0.3));
const vat = Math.round(supply * 0.1);
const scopeFlags = { overlay: true, ridge: true, eave: true, gutter: true, waste: true };
const estimate = {
  id: "e1", siteId: "s1", lineItems,
  site: { id: "s1", userId: "u1", customerName: "홍길동", customerPhone: null, siteAddress: "서울시 강남구 테헤란로 1", photos: [], generalMemo: null, createdAt: now, updatedAt: now },
  estimateNumber: "2026-001", constructionType: "roof", areaM2: 120, buildingAreaM2: null,
  materialType: "zinc250", materialThickness: "0.45", materialTexture: "스톤", materialColor: "차콜",
  scopeFlags, gutterMode: "front,back", gutterLengthM: 18, workDays: 3, workerCount: 2,
  totalCost, marginRate: 0.3, marginAmount: supply - totalCost, marginMode: "percent", supplyPrice: supply,
  vatIncluded: true, vatAmount: vat, finalPrice: supply + vat,
  paymentTerms: "계약금 30% · 계약 시 / 잔금 70% · 완공 시", validityDays: 30, constructionMonth: "2026-10",
  companyNameSnapshot: "테스트지붕", companyPhoneSnapshot: "010-0000-0000", companyAddressSnapshot: "서울시 어딘가",
  businessRegistrationNumberSnapshot: "000-00-00000", sealImageUrlSnapshot: null, bankAccountSnapshot: "국민 000-000",
  noticeTextSnapshot: "본 견적은 현장 여건에 따라 달라질 수 있습니다.\n하자보수 1년",
  customerNameSnapshot: "홍길동", siteAddressSnapshot: "서울시 강남구 테헤란로 1", issuedAt: now,
  createdAt: now, updatedAt: now, pdfSentAt: null, pdfUrl: null,
} as unknown as Props["estimate"];

describe("고객 PDF — 저장소 폰트로 오프라인 렌더", () => {
  const httpCalls: string[] = [];
  beforeAll(() => {
    const realFetch = globalThis.fetch;
    // data: URL(레이아웃 엔진 wasm)은 통과, http(s) 는 전부 차단 — 폰트를 원격에서 받으려 하면 실패한다.
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (/^https?:/i.test(url)) {
        httpCalls.push(url);
        throw new Error(`network blocked in test: ${url}`);
      }
      return realFetch(input, init);
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  for (const detailLevel of ["simple", "detailed"] as const) {
    it(`${detailLevel} — Pretendard 가 박힌 PDF 가 나오고 원격 요청이 없다`, async () => {
      const el = createElement(EstimatePDFDoc, {
        estimate, scopeFlags, detailLevel,
        marginRatios: { material: 0.5, labor: 0.25, profit: 0.25 }, sealImage: null,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- renderToBuffer 는 DocumentProps 로 타입돼 있지만 Document 를 품은 요소면 된다
      const buf = await renderToBuffer(el as any);
      const text = buf.toString("latin1");
      expect(text.startsWith("%PDF-")).toBe(true);
      expect(text).toMatch(/Pretendard/);
      expect(buf.length).toBeGreaterThan(20_000);
      expect(httpCalls).toEqual([]);
    }, 60_000);
  }
});
