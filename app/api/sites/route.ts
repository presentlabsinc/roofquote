import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const sites = await prisma.site.findMany({
    include: { estimates: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(sites);
}

export async function POST(req: Request) {
  const { customerName, customerPhone, siteAddress, photos, generalMemo } = await req.json();
  const site = await prisma.site.create({
    data: {
      customerName,
      customerPhone: customerPhone ?? null,
      siteAddress,
      photos: photos ?? [],
      generalMemo: generalMemo ?? null,
    },
  });
  return NextResponse.json(site, { status: 201 });
}
