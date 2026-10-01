import "server-only";
import { supabaseAdmin } from "./supabase-server";
import {
  SENT_PDF_BUCKET, isSentPdfPathFor, parseSentPdfName, sentPdfFolder, type SentPdfEntry,
} from "./sent-pdf-path";

export * from "./sent-pdf-path";

/**
 * 발송 PDF 보관 (서버 전용) — 고객에게 보낸 견적서 PDF 를 **비공개** 버킷에 그대로 보관한다.
 * 견적서 디자인이 바뀌어도 이미 보낸 PDF 는 보낸 모습 그대로 다시 열 수 있게 (스펙 §데이터 설계).
 *
 * - 버킷 `estimate-pdfs` 는 비공개. 열람은 인증된 라우트(/api/estimates/[eid]/sent-pdf/[name])가
 *   소유를 확인한 뒤 service-role 로 받아서 돌려준다 — 공개 URL·서명 URL 을 밖에 주지 않는다.
 * - 경로·파일명 규칙과 검증은 lib/sent-pdf-path.ts.
 */

type StorageErr = { message?: string; status?: number; statusCode?: string } | null | undefined;

function isNotFound(e: StorageErr): boolean {
  return !!e && (e.statusCode === "404" || e.status === 404 || /not found/i.test(e.message ?? ""));
}
function isAlreadyExists(e: StorageErr): boolean {
  return !!e && (e.statusCode === "409" || e.status === 409 || /already exists|duplicate/i.test(e.message ?? ""));
}

let bucketReady: Promise<void> | null = null;

/**
 * 비공개 버킷이 있는지 확인하고 없으면 만든다 (프로세스당 한 번 — 실패하면 다음 호출에서 다시).
 * 버킷이 공개로 바뀌어 있으면 보관을 거부한다 (고객 견적서가 공개 URL 로 새지 않게).
 */
export function ensureSentPdfBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const storage = supabaseAdmin().storage;
      const assertPrivate = (b: { public: boolean }) => {
        if (b.public) throw new Error(`[sent-pdf] bucket ${SENT_PDF_BUCKET} is public — refusing to store`);
      };
      const got = await storage.getBucket(SENT_PDF_BUCKET);
      if (got.data) return assertPrivate(got.data);

      const created = await storage.createBucket(SENT_PDF_BUCKET, {
        public: false,
        fileSizeLimit: "10MB",
        allowedMimeTypes: ["application/pdf"],
      });
      if (!created.error) return;
      if (!isAlreadyExists(created.error)) throw new Error(`[sent-pdf] createBucket failed: ${created.error.message}`);
      // 동시에 다른 요청이 만든 경우 — 다시 읽어 비공개인지 확인.
      const again = await storage.getBucket(SENT_PDF_BUCKET);
      if (!again.data) throw new Error(`[sent-pdf] getBucket failed: ${again.error?.message}`);
      assertPrivate(again.data);
    })().catch((e) => {
      bucketReady = null;
      throw e;
    });
  }
  return bucketReady;
}

/** 경로 검증 후 업로드 (덮어쓰기 없음). 실패하면 throw. */
export async function uploadSentPdf(userId: string, estimateId: string, path: string, bytes: Buffer): Promise<void> {
  if (!isSentPdfPathFor(path, userId, estimateId)) throw new Error("[sent-pdf] invalid path");
  await ensureSentPdfBucket();
  const { error } = await supabaseAdmin()
    .storage.from(SENT_PDF_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error(`[sent-pdf] upload failed: ${error.message}`);
}

/** 이 견적의 보관본 목록 — 최신순. 버킷이 아직 없으면 빈 목록. 그 외 오류는 throw. */
export async function listSentPdfs(userId: string, estimateId: string): Promise<SentPdfEntry[]> {
  const { data, error } = await supabaseAdmin()
    .storage.from(SENT_PDF_BUCKET)
    .list(sentPdfFolder(userId, estimateId), { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (error) {
    if (isNotFound(error)) return [];
    throw new Error(`[sent-pdf] list failed: ${error.message}`);
  }
  const out: SentPdfEntry[] = [];
  for (const f of data ?? []) {
    if (f.id === null) continue; // 폴더
    const parsed = parseSentPdfName(f.name);
    if (!parsed) continue;
    const size = typeof f.metadata?.size === "number" ? f.metadata.size : null;
    out.push({ name: f.name, detail: parsed.detail, sentAt: parsed.sentAt.toISOString(), size });
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

/** 보관본 받기 — 경로가 (userId, estimateId) 소속이 아니면 null. 없거나 실패해도 null. */
export async function downloadSentPdf(userId: string, estimateId: string, path: string): Promise<Buffer | null> {
  if (!isSentPdfPathFor(path, userId, estimateId)) return null;
  const { data, error } = await supabaseAdmin().storage.from(SENT_PDF_BUCKET).download(path);
  if (error || !data) {
    if (!isNotFound(error)) console.error("[sent-pdf] download failed", error?.message);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

/** 지정한 보관본 삭제 (best-effort — 로그만 남기고 throw 하지 않음). 성공 여부를 돌려준다. */
async function removePaths(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  try {
    const { error } = await supabaseAdmin().storage.from(SENT_PDF_BUCKET).remove(paths);
    if (error && !isNotFound(error)) {
      console.error("[sent-pdf] remove failed", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[sent-pdf] remove threw", e instanceof Error ? e.message : e);
    return false;
  }
}

/** 업로드 직후 DB 기록이 실패했을 때 그 파일만 되돌린다 (best-effort). */
export async function removeSentPdf(userId: string, estimateId: string, path: string): Promise<void> {
  if (isSentPdfPathFor(path, userId, estimateId)) await removePaths([path]);
}

/**
 * 견적 삭제·현장 삭제 시 그 견적들의 보관본을 지운다 (best-effort — 실패해도 호출자 흐름은 계속).
 * 본인 폴더(`<userId>/<estimateId>/`) 안의, 규칙에 맞는 파일만.
 */
export async function removeForEstimates(userId: string, estimateIds: string[]): Promise<void> {
  await Promise.all(
    estimateIds.map(async (estimateId) => {
      try {
        const folder = sentPdfFolder(userId, estimateId);
        // 목록은 100개씩 — 그보다 많으면 지우고 다시 읽는다 (삭제가 실패하면 중단).
        for (let round = 0; round < 20; round++) {
          const entries = await listSentPdfs(userId, estimateId);
          if (entries.length === 0) break;
          const ok = await removePaths(entries.map((e) => `${folder}/${e.name}`));
          if (!ok || entries.length < 100) break;
        }
      } catch (e) {
        console.error("[sent-pdf] cleanup failed", { estimateId, error: e instanceof Error ? e.message : e });
      }
    }),
  );
}
