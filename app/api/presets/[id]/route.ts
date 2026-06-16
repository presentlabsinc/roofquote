import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";
import { extractPresetSnapshot, applyPresetSnapshot } from "@/lib/presets";

/**
 * PATCH /api/presets/[id] — dispatch on action:
 *   { action: "activate" }      → 프리셋 값을 현재 설정(PricingSettings)에 복사 + 활성 지정
 *   { action: "overwrite" }     → 현재 설정을 이 프리셋에 덮어씀 (저장)
 *   { action: "rename", name }  → 이름 변경
 * 소유권은 userId 필터로 보장.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireUserAndSettings();
  const { id } = await params;
  const body = await req.json();

  const preset = await prisma.pricingPreset.findFirst({ where: { id, userId: user.id } });
  if (!preset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "activate") {
    // 프리셋 → 현재 설정. 회사정보·채번 등 제외 필드는 applyPresetSnapshot 이 한 번 더 거름.
    await prisma.pricingSettings.update({
      where: { userId: user.id },
      data: { ...applyPresetSnapshot(preset.snapshotJson), activePresetId: preset.id },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "overwrite") {
    const updated = await prisma.pricingPreset.update({
      where: { id: preset.id },
      data: { snapshotJson: extractPresetSnapshot(settings) as object },
    });
    // 덮어쓸 때 활성도 이 프리셋으로 맞춤 (이미 활성이면 무해).
    await prisma.pricingSettings.update({
      where: { userId: user.id },
      data: { activePresetId: preset.id },
    });
    return NextResponse.json(updated);
  }

  if (body.action === "rename") {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
    const updated = await prisma.pricingPreset.update({ where: { id: preset.id }, data: { name } });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** DELETE /api/presets/[id] — 프리셋 삭제. 활성이었으면 activePresetId 해제. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireUserAndSettings();
  const { id } = await params;

  const deleted = await prisma.pricingPreset.deleteMany({ where: { id, userId: user.id } });
  if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (settings.activePresetId === id) {
    await prisma.pricingSettings.update({
      where: { userId: user.id },
      data: { activePresetId: null },
    });
  }
  return NextResponse.json({ ok: true });
}
