import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const settings = await prisma.pricingSettings.findFirst();
  return NextResponse.json(settings);
}

export async function POST(req: Request) {
  const data = await req.json();
  const existing = await prisma.pricingSettings.findFirst();
  if (existing) {
    const updated = await prisma.pricingSettings.update({
      where: { id: existing.id },
      data,
    });
    return NextResponse.json(updated);
  }
  const created = await prisma.pricingSettings.create({ data });
  return NextResponse.json(created, { status: 201 });
}
