import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { parsePhotos } from "@/lib/storage";

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export async function POST(req: Request) {
  const user = await requireUser();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다" }, { status: 400 });
  }
  const customerName = text(body.customerName, 100);
  const siteAddress = text(body.siteAddress, 300);
  if (!customerName || !siteAddress) {
    return NextResponse.json({ error: "고객명과 주소를 입력해 주세요" }, { status: 400 });
  }
  // 사진 100장 초과·형식 오류는 조용히 버리지 않고 거부 (업로드된 사진이 사라지지 않게).
  const photos = body.photos === undefined || body.photos === null ? [] : parsePhotos(body.photos);
  if (photos === null) {
    return NextResponse.json({ error: "사진은 현장당 100장까지 저장할 수 있습니다" }, { status: 400 });
  }
  const site = await prisma.site.create({
    data: {
      userId: user.id,
      customerName,
      customerPhone: text(body.customerPhone, 40),
      siteAddress,
      photos,
      generalMemo: text(body.generalMemo, 2000),
    },
  });
  return NextResponse.json(site, { status: 201 });
}
