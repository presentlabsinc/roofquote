import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    include: { estimates: { include: { lineItems: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "desc" } } },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(site);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const site = await prisma.site.update({ where: { id }, data });
  return NextResponse.json(site);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.site.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
