/**
 * 발송 PDF 보관 — 순수 헬퍼 (경로 만들기·해석·검증, 본문 검사). 서버·테스트 공용.
 * 스토리지 입출력은 lib/sent-pdf.ts (server-only).
 *
 * 경로: `<userId>/<estimateId>/<YYYYMMDDTHHmmssSSSZ>-<simple|detailed>.pdf` (UTC — 이름순 = 시간순)
 */

export const SENT_PDF_BUCKET = "estimate-pdfs";
/** Vercel 함수 본문 한도(4.5MB) 안쪽. */
export const SENT_PDF_MAX_BYTES = 4 * 1024 * 1024;

export type SentPdfDetail = "simple" | "detailed";

export interface SentPdfEntry {
  /** 파일 이름 (경로 마지막 칸) — 열람 API 의 [name]. */
  name: string;
  detail: SentPdfDetail;
  /** 발송 시각 (ISO, UTC). */
  sentAt: string;
  /** 바이트. 알 수 없으면 null. */
  size: number | null;
}

/** 사용자 ID(UUID)·견적 ID(cuid) 폴더 이름 — 영숫자·`-`·`_` 만. */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NAME_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-(simple|detailed)\.pdf$/;

export function parseSentPdfDetail(v: unknown): SentPdfDetail | null {
  return v === "simple" || v === "detailed" ? v : null;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** `20261001T093012345Z` — UTC, 파일명에 안전하고 정렬 가능한 시각. */
export function sentPdfStamp(d: Date): string {
  if (Number.isNaN(d.getTime())) throw new Error("invalid date");
  return (
    `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}${pad(d.getUTCMilliseconds(), 3)}Z`
  );
}

export function buildSentPdfName(sentAt: Date, detail: SentPdfDetail): string {
  if (!parseSentPdfDetail(detail)) throw new Error("invalid detail");
  return `${sentPdfStamp(sentAt)}-${detail}.pdf`;
}

export function sentPdfFolder(userId: string, estimateId: string): string {
  if (!ID_RE.test(userId) || !ID_RE.test(estimateId)) throw new Error("invalid id");
  return `${userId}/${estimateId}`;
}

export function buildSentPdfPath(userId: string, estimateId: string, sentAt: Date, detail: SentPdfDetail): string {
  return `${sentPdfFolder(userId, estimateId)}/${buildSentPdfName(sentAt, detail)}`;
}

/** 파일 이름을 엄격히 해석 — 패턴이 정확히 맞고 실제 있는 날짜일 때만. */
export function parseSentPdfName(name: unknown): { sentAt: Date; detail: SentPdfDetail } | null {
  if (typeof name !== "string") return null;
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, ms, detail] = m;
  const sentAt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms));
  // 13월·25시 같은 값은 Date 가 넘겨 버리므로 되돌려 같은지 확인.
  if (Number.isNaN(sentAt.getTime()) || sentPdfStamp(sentAt) !== name.slice(0, 19)) return null;
  return { sentAt, detail: detail as SentPdfDetail };
}

/** 이 경로가 (userId, estimateId) 폴더의 정확한 발송 PDF 파일인지 — 다른 폴더·`..`·다른 확장자 거부. */
export function isSentPdfPathFor(path: unknown, userId: string, estimateId: string): path is string {
  if (typeof path !== "string" || !ID_RE.test(userId) || !ID_RE.test(estimateId)) return false;
  const parts = path.split("/");
  return parts.length === 3 && parts[0] === userId && parts[1] === estimateId && parseSentPdfName(parts[2]) !== null;
}

/** 본문이 PDF(`%PDF-` 로 시작)인지. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
  );
}

/** 업로드 본문 검사 — 문제 있으면 이유 코드, 없으면 null. */
export function checkSentPdfBody(bytes: Uint8Array): "empty" | "tooLarge" | "notPdf" | null {
  if (bytes.length === 0) return "empty";
  if (bytes.length > SENT_PDF_MAX_BYTES) return "tooLarge";
  if (!looksLikePdf(bytes)) return "notPdf";
  return null;
}
