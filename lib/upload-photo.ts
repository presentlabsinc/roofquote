/**
 * 사진·직인 업로드 (클라이언트 전용) — 올리기 전에 폰에서 줄인다 (2026-09-28).
 *
 * - 서버(Vercel 함수) 본문 한도 4.5MB 때문에 폰 원본(5~12MB)이 이유 없이 실패하던 문제.
 * - 캔버스로 다시 그려 저장하면 EXIF(촬영 위치 GPS 포함)가 빠진다 — 고객 집 사진이 공개 URL 이라
 *   위치 정보까지 새지 않게.
 * - 디코딩: createImageBitmap(방향 옵션) → 옵션 없이 → <img> 순으로 시도 (구형 iOS·HEIC 대응).
 *   셋 다 실패하면 4MB 이하일 때만 원본 그대로 (이 경우 EXIF 가 남을 수 있음).
 * - 여러 장은 **한 장씩 순서대로** 처리 (동시에 디코딩하면 iOS 에서 메모리 부족으로 탭이 리로드됨).
 */
const PHOTO_MAX_EDGE = 2000;
const SEAL_MAX_EDGE = 512;
const JPEG_QUALITY = 0.85;
const RAW_LIMIT = 4 * 1024 * 1024;

type Drawable = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: File): Promise<Drawable | null> {
  if (typeof createImageBitmap === "function") {
    for (const opts of [{ imageOrientation: "from-image" } as ImageBitmapOptions, undefined]) {
      try {
        const bmp = opts ? await createImageBitmap(file, opts) : await createImageBitmap(file);
        return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
      } catch {
        /* 다음 방법 */
      }
    }
  }
  // <img> — iOS Safari 는 HEIC 도 여기서 디코딩한다 (EXIF 방향은 브라우저가 적용).
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

async function reencode(file: File, maxEdge: number, type: "image/jpeg" | "image/png"): Promise<Blob | null> {
  const d = await decode(file);
  if (!d || d.width <= 0 || d.height <= 0) { d?.release(); return null; }
  const scale = Math.min(1, maxEdge / Math.max(d.width, d.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(d.width * scale));
  canvas.height = Math.max(1, Math.round(d.height * scale));
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(d.source, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), type, JPEG_QUALITY));
  } finally {
    d.release();
    canvas.width = 0; // 캔버스 메모리 즉시 해제 (iOS 는 캔버스 총량 제한이 빡빡함)
    canvas.height = 0;
  }
}

async function postUpload(body: Blob, name: string, label: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", body, name);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(`${label}: ${j?.error ?? "업로드 실패"}`);
  }
  const { url } = await res.json();
  return url as string;
}

/** 현장 사진 1장 — 줄여서(JPEG, 긴 변 2000px) 업로드하고 공개 URL 을 돌려준다. */
export async function uploadPhoto(file: File): Promise<string> {
  const jpeg = await reencode(file, PHOTO_MAX_EDGE, "image/jpeg");
  if (jpeg) return postUpload(jpeg, file.name.replace(/\.[^.]+$/, "") + ".jpg", file.name);
  if (file.size <= RAW_LIMIT) return postUpload(file, file.name, file.name);
  throw new Error(`${file.name}: 이 형식은 폰에서 줄일 수 없어요 (4MB 이하 사진만 가능)`);
}

/** 여러 장을 한 장씩 순서대로 업로드. 성공한 URL 과 실패 메시지를 돌려준다. */
export async function uploadPhotosSequentially(
  files: File[],
  onEach?: (result: { url?: string; error?: string }) => void,
): Promise<{ urls: string[]; errors: string[] }> {
  const urls: string[] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      const url = await uploadPhoto(f);
      urls.push(url);
      onEach?.({ url });
    } catch (e) {
      const msg = e instanceof Error ? e.message : `${f.name} 업로드 실패`;
      errors.push(msg);
      onEach?.({ error: msg });
    }
  }
  return { urls, errors };
}

/**
 * 직인 — 투명 배경을 살려 PNG(긴 변 512px)로 줄여 업로드. PDF 는 1MB 이하 PNG/JPEG 만 그리므로
 * 업로드 단계에서 맞춘다 (HEIC·WebP·큰 PNG 직인이 견적서에서 조용히 '(인)'으로 빠지던 문제).
 */
export async function uploadSeal(file: File): Promise<string> {
  const png = await reencode(file, SEAL_MAX_EDGE, "image/png");
  if (!png) throw new Error("직인 이미지를 읽을 수 없어요 — PNG 또는 JPG 로 올려 주세요");
  if (png.size > 1024 * 1024) throw new Error("직인 이미지가 너무 커요 — 더 단순한 이미지로 올려 주세요");
  return postUpload(png, "seal.png", "직인");
}
