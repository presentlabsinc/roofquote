import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/**
 * Site ownership note: we always look up `findFirst({ id, userId })` (not
 * findUnique by id) so requests for someone else's site return 404 — never
 * leak existence. PATCH/DELETE also re-check ownership before mutating.
 */

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const site = await prisma.site.findFirst({
    where: { id, userId: user.id },
    include: { estimates: { include: { lineItems: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "desc" } } },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(site);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const body = await req.json();
  // Whitelist editable fields — never trust the body for userId/id/photos shape etc.
  const data: Record<string, unknown> = {};
  if (typeof body.customerName === "string") data.customerName = body.customerName.trim();
  if ("customerPhone" in body) data.customerPhone = body.customerPhone || null;
  if (typeof body.siteAddress === "string") data.siteAddress = body.siteAddress.trim();
  if ("generalMemo" in body) data.generalMemo = body.generalMemo || null;
  if ("photos" in body) data.photos = body.photos; // SitePhotos already PATCHes this shape
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  // updateMany scoped to id+userId is atomic — returns 0 affected if not owned.
  const result = await prisma.site.updateMany({ where: { id, userId: user.id }, data });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const site = await prisma.site.findUnique({ where: { id } });
  return NextResponse.json(site);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const result = await prisma.site.deleteMany({ where: { id, userId: user.id } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
