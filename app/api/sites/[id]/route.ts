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
  const data = await req.json();
  // Strip any attempt to change userId — should never come from the body.
  delete data.userId;
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
