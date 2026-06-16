import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";
import { extractPresetSnapshot } from "@/lib/presets";

/** GET /api/presets — 사용자의 프리셋 목록 (id, name, updatedAt). */
export async function GET() {
  const { user } = await requireUserAndSettings();
  const presets = await prisma.pricingPreset.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(presets);
}

/**
 * POST /api/presets — 현재 설정을 새 프리셋으로 저장 (다른 이름으로 저장 / 첫 저장).
 * body: { name }. 현재 PricingSettings 의 단가·계수를 스냅샷하고 활성으로 지정.
 */
export async function POST(req: Request) {
  const { user, settings } = await requireUserAndSettings();
  const body = await req.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });

  const preset = await prisma.pricingPreset.create({
    data: {
      userId: user.id,
      name,
      snapshotJson: extractPresetSnapshot(settings) as object,
    },
  });
  // 새 프리셋을 활성으로
  await prisma.pricingSettings.update({
    where: { userId: user.id },
    data: { activePresetId: preset.id },
  });
  return NextResponse.json(preset, { status: 201 });
}
