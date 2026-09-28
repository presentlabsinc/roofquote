import "server-only";
import { supabaseAdmin } from "./supabase-server";
import { PHOTO_BUCKET } from "./supabase";

/**
 * 스토리지 헬퍼 (서버 전용) — 사진·직인 업로드 파일의 경로 해석과 정리.
 *
 * 경로 규칙 (2026-09-28~): `<userId>/<uuid>.<ext>` — 사용자별 폴더.
 * 정리(삭제)는 **본인 폴더(`<userId>/`) 파일만** 한다. 사진 배열은 사용자가 PATCH 로
 * 임의 URL 을 넣을 수 있으므로, 폴더 확인 없이 지우면 남의 파일을 지울 수 있다.
 * 이전 규칙(루트의 `<uuid>.<ext>`)으로 올라간 구 파일은 소유를 증명할 수 없어 지우지 않는다.
 */

const PUBLIC_PREFIX = `/storage/v1/object/public/${PHOTO_BUCKET}/`;

/** 우리 버킷의 public URL 이면 버킷 내 경로를, 아니면 null. */
export function storagePathFromPublicUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const ours = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    if (u.host !== ours.host || !u.pathname.startsWith(PUBLIC_PREFIX)) return null;
    const path = decodeURIComponent(u.pathname.slice(PUBLIC_PREFIX.length));
    if (!path || path.includes("..")) return null;
    return path;
  } catch {
    return null;
  }
}

/** 이 사용자 폴더의 파일인지. */
export function isOwnedPath(userId: string, path: string | null): path is string {
  return !!path && path.startsWith(`${userId}/`);
}

/**
 * 사용자 본인 폴더에 있는 파일만 삭제 (best-effort — 실패해도 호출자 흐름은 계속).
 * 사진 삭제·현장 삭제·직인 교체 후 공개 URL 로 영구히 남던 문제(고객 집 사진) 해결.
 */
export async function removeOwnedObjects(userId: string, urls: string[]): Promise<void> {
  const paths = urls
    .map(storagePathFromPublicUrl)
    .filter((p): p is string => isOwnedPath(userId, p));
  if (paths.length === 0) return;
  try {
    const { error } = await supabaseAdmin().storage.from(PHOTO_BUCKET).remove(paths);
    if (error) console.error("[storage] remove failed", error.message);
  } catch (e) {
    console.error("[storage] remove threw", e);
  }
}

/**
 * 현장 사진 배열 검증 — https URL 만, 메모 길이 제한, 최대 100장.
 * 우리 버킷으로 한정하지 않는 이유: 2026-05-23 이전(뭄바이 프로젝트) 사진 URL 이 남아 있을 수
 * 있어, 한정하면 다음 저장 때 조용히 사라진다. 삭제는 removeOwnedObjects 가 본인 폴더만 하므로 안전.
 */
export const MAX_SITE_PHOTOS = 100;
export function parsePhotos(v: unknown): { url: string; memo?: string }[] | null {
  if (!Array.isArray(v) || v.length > MAX_SITE_PHOTOS) return null;
  const out: { url: string; memo?: string }[] = [];
  for (const p of v.slice(0, 100)) {
    if (typeof p !== "object" || p === null) continue;
    const url = (p as { url?: unknown }).url;
    const memo = (p as { memo?: unknown }).memo;
    if (typeof url !== "string" || !url.startsWith("https://") || url.length > 1000) continue;
    out.push({ url, ...(typeof memo === "string" && memo.trim() ? { memo: memo.slice(0, 500) } : {}) });
  }
  return out;
}
