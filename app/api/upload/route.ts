import { NextResponse } from "next/server";
import { supabaseAdmin, PHOTO_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const admin = supabaseAdmin();
  const { error: uploadError } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = admin.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
