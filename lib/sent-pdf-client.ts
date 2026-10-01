/**
 * 발송 기록 (브라우저 쪽) — 카톡 공유가 끝난 뒤 발송 시각 기록 + 공유한 PDF 보관.
 * PreviewActions 가 쓴다. fetch 를 주입받아 테스트한다 (lib/__tests__/sent-pdf-client.test.ts).
 *
 * 순서:
 *   1. 발송 시각 먼저 (PATCH pdfSentAt) — 작은 요청이라 빨리 끝나고 keepalive 라 화면을 떠나도 전송된다.
 *   2. 공유한 그 파일을 보관 (POST /sent-pdf) — 성공하면 서버가 pdfUrl·pdfSentAt 을 다시 쓴다.
 * 두 요청 모두 시간 제한이 있어 '기록 중' 이 끝없이 이어지지 않는다.
 */

export type SentPdfLevel = "simple" | "detailed";

/**
 * stored = 사본 보관됨 · timeOnly = 발송 시각만 기록 · none = 아무것도 기록 못 함 ·
 * unknown = 시간 제한으로 끊어서 서버가 처리했는지 모름 (끊어도 서버는 계속 처리할 수 있다 — '못 했다'고 단정하지 않음)
 */
export type SentRecordOutcome = "stored" | "timeOnly" | "none" | "unknown";

export const SENT_TIME_TIMEOUT_MS = 10_000;
export const SENT_UPLOAD_TIMEOUT_MS = 30_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok">>;

export interface RecordSentOptions {
  estimateId: string;
  file: Blob;
  level: SentPdfLevel;
  sentAt?: Date;
  fetchImpl?: FetchLike;
  timeTimeoutMs?: number;
  uploadTimeoutMs?: number;
}

type FetchResult = "ok" | "failed" | "unknown";

/**
 * 시간 제한 안에 2xx → ok, 오류 응답·네트워크 오류 → failed, 시간 제한으로 끊음 → unknown (throw 하지 않음).
 * 요청을 보낸 뒤 끊으면 서버(서버리스 함수)는 그대로 처리를 마칠 수 있어서 '실패'와 구분한다.
 */
async function fetchResult(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    return res.ok ? "ok" : "failed";
  } catch {
    return ctrl.signal.aborted ? "unknown" : "failed";
  } finally {
    clearTimeout(timer);
  }
}

export async function recordSentPdf({
  estimateId, file, level, sentAt = new Date(), fetchImpl = (u, i) => fetch(u, i),
  timeTimeoutMs = SENT_TIME_TIMEOUT_MS, uploadTimeoutMs = SENT_UPLOAD_TIMEOUT_MS,
}: RecordSentOptions): Promise<SentRecordOutcome> {
  const id = encodeURIComponent(estimateId);
  const time = await fetchResult(fetchImpl, `/api/estimates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdfSentAt: sentAt.toISOString() }),
    keepalive: true,
  }, timeTimeoutMs);

  const upload = await fetchResult(fetchImpl, `/api/estimates/${id}/sent-pdf?detail=${level}`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  }, uploadTimeoutMs);

  if (upload === "ok") return "stored";
  if (upload === "unknown") return "unknown";
  // 보관이 확실히 실패 — 발송 시각 결과에 따라.
  return time === "ok" ? "timeOnly" : time === "unknown" ? "unknown" : "none";
}

/** 결과별 안내 문구 — 보관됐으면 null (성공 안내만). */
export function sentRecordNotice(outcome: SentRecordOutcome): string | null {
  if (outcome === "timeOnly") return "보낸 PDF 사본은 보관하지 못했어요. 발송 시각만 기록했어요.";
  if (outcome === "none") return "보낸 PDF 사본 보관과 발송 기록을 하지 못했어요.";
  if (outcome === "unknown") return "발송 기록 결과를 확인하지 못했어요. 잠시 뒤 견적 상세의 '보낸 견적서'에서 확인해 주세요.";
  return null;
}
