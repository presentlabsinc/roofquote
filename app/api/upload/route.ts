import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { PHOTO_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";

/** Vercel 함수 본문 한도(4.5MB) 안쪽. 클라이언트가 업로드 전에 리사이즈한다 (lib/image-resize). */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * 파일 앞부분(매직 바이트)으로 실제 형식 판별 — 파일명·Content-Type 은 위조 가능하므로 믿지 않는다.
 * 허용: JPEG / PNG / WebP / GIF / HEIC(iOS 원본). AVIF 등 그 외는 거부.
 */
function sniffImage(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { ext: "webp", mime: "image/webp" };
  const head6 = buf.subarray(0, 6).toString("ascii");
  if (head6 === "GIF87a" || head6 === "GIF89a") return { ext: "gif", mime: "image/gif" };
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) return { ext: "heic", mime: "image/heic" };
  }
  return null;
}

export async function POST(req: Request) {
  // 라우트 자체에서 인증 (이전엔 proxy 에만 의존했다).
  const user = await requireUser();

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "사진 용량이 너무 큽니다 (4MB 이하)" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buffer);
  if (!kind) {
    return NextResponse.json({ error: "사진 파일(JPG·PNG·WebP·HEIC)만 올릴 수 있습니다" }, { status: 415 });
  }

  // 사용자별 폴더 — 삭제 시 본인 파일만 지울 수 있게 (lib/storage.ts).
  const path = `${user.id}/${crypto.randomUUID()}.${kind.ext}`;
  const admin = supabaseAdmin();
  const { error: uploadError } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(path, buffer, { contentType: kind.mime, upsert: false });

  if (uploadError) {
    console.error("[upload] storage error", uploadError.message);
    return NextResponse.json({ error: "업로드에 실패했습니다. 잠시 후 다시 시도해 주세요" }, { status: 500 });
  }

  const { data } = admin.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
