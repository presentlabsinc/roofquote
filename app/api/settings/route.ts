import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";

export async function GET() {
  const { settings } = await requireUserAndSettings();
  return NextResponse.json(settings);
}

export async function POST(req: Request) {
  const { user } = await requireUserAndSettings();
  const data = await req.json();
  // Defensive: never let the body change the userId. Settings are scoped by
  // the @unique userId column; we update by that and re-create if absent.
  delete data.userId;
  delete data.id;
  const updated = await prisma.pricingSettings.update({
    where: { userId: user.id },
    data,
  });
  return NextResponse.json(updated);
}
