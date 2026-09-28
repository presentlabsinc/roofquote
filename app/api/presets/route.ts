import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";
import { extractPresetSnapshot } from "@/lib/presets";

const MAX_PRESETS = 50;
const MAX_PRESET_NAME = 30;

/**
 * POST /api/presets — 현재 설정을 새 프리셋으로 저장 (다른 이름으로 저장 / 첫 저장).
 * body: { name }. 현재 PricingSettings 의 단가·계수를 스냅샷하고 활성으로 지정.
 */
export async function POST(req: Request) {
  const { user, settings } = await requireUserAndSettings();
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다" }, { status: 400 });
  }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
  if (name.length > MAX_PRESET_NAME) return NextResponse.json({ error: `이름은 ${MAX_PRESET_NAME}자 이하로 해 주세요.` }, { status: 400 });

  const existing = await prisma.pricingPreset.findMany({ where: { userId: user.id }, select: { name: true } });
  if (existing.length >= MAX_PRESETS) return NextResponse.json({ error: `프리셋은 ${MAX_PRESETS}개까지 저장할 수 있습니다.` }, { status: 400 });
  if (existing.some((p) => p.name === name)) return NextResponse.json({ error: "같은 이름의 프리셋이 이미 있습니다." }, { status: 409 });

  const preset = await prisma.$transaction(async (tx) => {
    const created = await tx.pricingPreset.create({
      data: { userId: user.id, name, snapshotJson: extractPresetSnapshot(settings) as object },
    });
    await tx.pricingSettings.update({ where: { userId: user.id }, data: { activePresetId: created.id } });
    return created;
  });
  return NextResponse.json(preset, { status: 201 });
}
