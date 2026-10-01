import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { parsePhotos, removeOwnedObjects } from "@/lib/storage";
import { removeForEstimates } from "@/lib/sent-pdf";

/**
 * Site ownership note: we always look up `findFirst({ id, userId })` (not
 * findUnique by id) so requests for someone else's site return 404 — never
 * leak existence. PATCH/DELETE also re-check ownership before mutating.
 */

function photoUrls(photos: unknown): string[] {
  return Array.isArray(photos)
    ? photos.map((p) => (p && typeof p === "object" ? (p as { url?: unknown }).url : null)).filter((u): u is string => typeof u === "string")
    : [];
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다" }, { status: 400 });
  }

  const current = await prisma.site.findFirst({ where: { id, userId: user.id } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Whitelist editable fields — never trust the body for userId/id etc.
  const data: Record<string, unknown> = {};
  if (typeof body.customerName === "string") {
    const v = body.customerName.trim().slice(0, 100);
    if (!v) return NextResponse.json({ error: "고객명을 입력해 주세요" }, { status: 400 });
    data.customerName = v;
  }
  if ("customerPhone" in body) data.customerPhone = typeof body.customerPhone === "string" && body.customerPhone.trim() ? body.customerPhone.trim().slice(0, 40) : null;
  if (typeof body.siteAddress === "string") {
    const v = body.siteAddress.trim().slice(0, 300);
    if (!v) return NextResponse.json({ error: "주소를 입력해 주세요" }, { status: 400 });
    data.siteAddress = v;
  }
  if ("generalMemo" in body) data.generalMemo = typeof body.generalMemo === "string" && body.generalMemo.trim() ? body.generalMemo.slice(0, 2000) : null;
  let removedPhotoUrls: string[] = [];
  if ("photos" in body) {
    const photos = parsePhotos(body.photos);
    if (photos === null) return NextResponse.json({ error: "사진은 현장당 100장까지 저장할 수 있습니다" }, { status: 400 });
    data.photos = photos;
    const keep = new Set(photos.map((p) => p.url));
    removedPhotoUrls = photoUrls(current.photos).filter((u) => !keep.has(u));
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  // updateMany scoped to id+userId is atomic — returns 0 affected if not owned.
  const result = await prisma.site.updateMany({ where: { id, userId: user.id }, data });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // 목록에서 빠진 사진은 스토리지에서도 삭제 (공개 URL 로 영구 잔존하던 문제).
  if (removedPhotoUrls.length) await removeOwnedObjects(user.id, removedPhotoUrls);
  const site = await prisma.site.findFirst({ where: { id, userId: user.id } });
  return NextResponse.json(site);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const current = await prisma.site.findFirst({
    where: { id, userId: user.id },
    select: { photos: true, estimates: { select: { id: true } } },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Estimate 는 onDelete: Cascade (2026-09-28) — 현장과 함께 견적·라인도 삭제.
  const result = await prisma.site.deleteMany({ where: { id, userId: user.id } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // 사진과 보관한 발송 PDF 정리 (둘 다 best-effort).
  await Promise.all([
    removeOwnedObjects(user.id, photoUrls(current.photos)),
    removeForEstimates(user.id, current.estimates.map((e) => e.id)),
  ]);
  return NextResponse.json({ ok: true });
}
