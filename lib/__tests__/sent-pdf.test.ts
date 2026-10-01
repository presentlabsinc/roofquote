/**
 * 발송 PDF 보관 — 경로 규칙·검증과 본문 검사 (lib/sent-pdf-path.ts). 네트워크 없음.
 */
import { describe, expect, it } from "vitest";
import {
  SENT_PDF_MAX_BYTES, buildSentPdfName, buildSentPdfPath, checkSentPdfBody, isSentPdfPathFor,
  looksLikePdf, parseSentPdfDetail, parseSentPdfName, sentPdfStamp,
} from "../sent-pdf-path";
import { contentDisposition, safeFileNamePart } from "../content-disposition";

const USER = "3f2b8c1e-9a4d-4c7e-8b21-0d5e6f7a8b9c";
const OTHER_USER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EST = "cmabc123def456ghi789jkl0";
const OTHER_EST = "cmzzz999yyy888xxx777www0";
const AT = new Date("2026-10-01T09:30:12.345Z");

describe("발송 PDF 경로 만들기", () => {
  it("UTC 시각 + 간단/상세 — 파일명에 안전하고 정렬 가능", () => {
    expect(sentPdfStamp(AT)).toBe("20261001T093012345Z");
    expect(buildSentPdfName(AT, "simple")).toBe("20261001T093012345Z-simple.pdf");
    expect(buildSentPdfPath(USER, EST, AT, "detailed")).toBe(`${USER}/${EST}/20261001T093012345Z-detailed.pdf`);
    // 이름순 = 시간순
    const earlier = buildSentPdfName(new Date("2026-09-30T23:59:59.999Z"), "simple");
    expect(earlier < buildSentPdfName(AT, "simple")).toBe(true);
  });

  it("KST 자정 직후도 UTC 로 고정", () => {
    expect(sentPdfStamp(new Date("2026-10-01T00:05:00+09:00"))).toBe("20260930T150500000Z");
  });

  it("폴더에 쓸 수 없는 ID·잘못된 구분은 거부", () => {
    expect(() => buildSentPdfPath("../x", EST, AT, "simple")).toThrow();
    expect(() => buildSentPdfPath(USER, "a/b", AT, "simple")).toThrow();
    expect(() => buildSentPdfPath(USER, "", AT, "simple")).toThrow();
    expect(() => buildSentPdfPath(USER, EST, AT, "full" as never)).toThrow();
    expect(() => sentPdfStamp(new Date("nope"))).toThrow();
  });
});

describe("발송 PDF 경로 해석·검증", () => {
  const good = buildSentPdfPath(USER, EST, AT, "simple");

  it("만든 경로는 그 사용자·견적의 것으로 통과하고 시각·구분이 되돌려진다", () => {
    expect(isSentPdfPathFor(good, USER, EST)).toBe(true);
    const parsed = parseSentPdfName("20261001T093012345Z-simple.pdf");
    expect(parsed?.detail).toBe("simple");
    expect(parsed?.sentAt.toISOString()).toBe(AT.toISOString());
    expect(parseSentPdfName("20261001T093012345Z-detailed.pdf")?.detail).toBe("detailed");
  });

  it("다른 사용자·다른 견적 폴더는 거부", () => {
    expect(isSentPdfPathFor(good, OTHER_USER, EST)).toBe(false);
    expect(isSentPdfPathFor(good, USER, OTHER_EST)).toBe(false);
    expect(isSentPdfPathFor(`${OTHER_USER}/${EST}/20261001T093012345Z-simple.pdf`, USER, EST)).toBe(false);
  });

  it("경로 조작·다른 폴더 깊이는 거부", () => {
    const name = "20261001T093012345Z-simple.pdf";
    expect(isSentPdfPathFor(`${USER}/${EST}/../${OTHER_EST}/${name}`, USER, EST)).toBe(false);
    expect(isSentPdfPathFor(`${USER}/../${OTHER_USER}/${EST}/${name}`, USER, EST)).toBe(false);
    expect(isSentPdfPathFor(`${USER}/${EST}/sub/${name}`, USER, EST)).toBe(false);
    expect(isSentPdfPathFor(`/${USER}/${EST}/${name}`, USER, EST)).toBe(false);
    expect(isSentPdfPathFor(`${USER}/${EST}`, USER, EST)).toBe(false);
    expect(isSentPdfPathFor(null, USER, EST)).toBe(false);
    expect(parseSentPdfName("../20261001T093012345Z-simple.pdf")).toBeNull();
    expect(parseSentPdfName("..")).toBeNull();
  });

  it("확장자·구분·시각 형식이 정확히 맞아야 통과", () => {
    expect(parseSentPdfName("20261001T093012345Z-simple.PDF")).toBeNull();
    expect(parseSentPdfName("20261001T093012345Z-simple.pdf.exe")).toBeNull();
    expect(parseSentPdfName("20261001T093012345Z-simple.png")).toBeNull();
    expect(parseSentPdfName("20261001T093012345Z-full.pdf")).toBeNull();
    expect(parseSentPdfName("20261001T093012345Z-.pdf")).toBeNull();
    expect(parseSentPdfName("20261001T0930123Z-simple.pdf")).toBeNull();
    expect(parseSentPdfName(" 20261001T093012345Z-simple.pdf")).toBeNull();
    expect(parseSentPdfName("20261301T093012345Z-simple.pdf")).toBeNull(); // 13월
    expect(parseSentPdfName("20260231T093012345Z-simple.pdf")).toBeNull(); // 2월 31일
    expect(parseSentPdfName("20261001T250000000Z-simple.pdf")).toBeNull(); // 25시
    expect(parseSentPdfName(42)).toBeNull();
  });

  it("detail 쿼리는 simple·detailed 만", () => {
    expect(parseSentPdfDetail("simple")).toBe("simple");
    expect(parseSentPdfDetail("detailed")).toBe("detailed");
    expect(parseSentPdfDetail("Detailed")).toBeNull();
    expect(parseSentPdfDetail(null)).toBeNull();
  });
});

describe("발송 PDF 본문 검사", () => {
  const pdf = (n: number) => {
    const b = new Uint8Array(n);
    b.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
    return b;
  };

  it("%PDF- 로 시작하면 통과", () => {
    expect(looksLikePdf(pdf(100))).toBe(true);
    expect(checkSentPdfBody(pdf(100))).toBeNull();
    expect(checkSentPdfBody(pdf(SENT_PDF_MAX_BYTES))).toBeNull();
  });

  it("빈 본문·4MB 초과·PDF 아님은 거부", () => {
    expect(checkSentPdfBody(new Uint8Array(0))).toBe("empty");
    expect(checkSentPdfBody(pdf(SENT_PDF_MAX_BYTES + 1))).toBe("tooLarge");
    expect(checkSentPdfBody(new TextEncoder().encode("<html>%PDF-</html>"))).toBe("notPdf");
    expect(checkSentPdfBody(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("notPdf");
    expect(looksLikePdf(new TextEncoder().encode("%PDF"))).toBe(false);
  });
});

describe("Content-Disposition 파일명", () => {
  it("한글은 filename* 로, ASCII 폴백의 따옴표·비ASCII 는 치환", () => {
    expect(contentDisposition("inline", "견적서-홍길동.pdf", "estimate-2026-001.pdf")).toBe(
      `inline; filename="estimate-2026-001.pdf"; filename*=UTF-8''${encodeURIComponent("견적서-홍길동.pdf")}`,
    );
    expect(contentDisposition("attachment", "a.pdf", 'x"y\\z한.pdf')).toContain('filename="x_y_z_.pdf"');
  });

  it("파일명에 못 쓰는 글자 제거, 비면 폴백", () => {
    expect(safeFileNamePart('홍/길:동*?"', "고객")).toBe("홍 길 동");
    expect(safeFileNamePart("  ", "고객")).toBe("고객");
    expect(safeFileNamePart(null, "고객")).toBe("고객");
  });
});
