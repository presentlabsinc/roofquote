import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();
  const sites = await prisma.site.findMany({
    where: { userId: user.id },
    include: { estimates: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(sites);
}

export async function POST(req: Request) {
  const user = await requireUser();
  const { customerName, customerPhone, siteAddress, photos, generalMemo } = await req.json();
  const site = await prisma.site.create({
    data: {
      userId: user.id,
      customerName,
      customerPhone: customerPhone ?? null,
      siteAddress,
      photos: photos ?? [],
      generalMemo: generalMemo ?? null,
    },
  });
  return NextResponse.json(site, { status: 201 });
}
