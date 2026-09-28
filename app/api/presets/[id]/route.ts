import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";
import { extractPresetSnapshot, applyPresetSnapshot } from "@/lib/presets";
import { sanitizeSettingsData } from "@/lib/settings-input";

const MAX_PRESET_NAME = 30;

/**
 * PATCH /api/presets/[id] — dispatch on action:
 *   { action: "activate" }      → 프리셋 값을 현재 설정(PricingSettings)에 복사 + 활성 지정
 *   { action: "overwrite" }     → 현재 설정을 이 프리셋에 덮어씀 (저장). 직전 값을 prevSnapshotJson 에 보관
 *   { action: "undo" }          → 직전 덮어쓰기 되돌리기 — 프리셋과 현재 설정 모두 이전 값으로 (1단계)
 *   { action: "rename", name }  → 이름 변경
 * 소유권은 userId 필터로 보장.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireUserAndSettings();
  const { id } = await params;
  let body: { action?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다" }, { status: 400 });
  }

  const preset = await prisma.pricingPreset.findFirst({ where: { id, userId: user.id } });
  if (!preset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "activate") {
    // 프리셋 → 현재 설정. 스냅샷에 없는 필드는 공장 기본값으로 채우고(applyPresetSnapshot),
    // 없어진 컬럼·잘못된 값은 조용히 버린다(lenient) — 옛 프리셋도 항상 불러올 수 있게.
    const data = sanitizeSettingsData(applyPresetSnapshot(preset.snapshotJson), { lenient: true });
    await prisma.pricingSettings.update({
      where: { userId: user.id },
      data: { ...data, activePresetId: preset.id },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "overwrite") {
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.pricingPreset.update({
        where: { id: preset.id },
        data: {
          prevSnapshotJson: preset.snapshotJson as object,
          snapshotJson: extractPresetSnapshot(settings) as object,
        },
      });
      // 덮어쓸 때 활성도 이 프리셋으로 맞춤 (이미 활성이면 무해).
      await tx.pricingSettings.update({ where: { userId: user.id }, data: { activePresetId: preset.id } });
      return u;
    });
    return NextResponse.json({ id: updated.id, name: updated.name, canUndo: true });
  }

  if (body.action === "undo") {
    if (preset.prevSnapshotJson === null) {
      return NextResponse.json({ error: "되돌릴 이전 저장이 없습니다." }, { status: 409 });
    }
    const prev = preset.prevSnapshotJson;
    const data = sanitizeSettingsData(applyPresetSnapshot(prev), { lenient: true });
    await prisma.$transaction([
      prisma.pricingPreset.update({
        where: { id: preset.id },
        data: { snapshotJson: prev as object, prevSnapshotJson: Prisma.DbNull },
      }),
      prisma.pricingSettings.update({
        where: { userId: user.id },
        data: { ...data, activePresetId: preset.id },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "rename") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
    if (name.length > MAX_PRESET_NAME) return NextResponse.json({ error: `이름은 ${MAX_PRESET_NAME}자 이하로 해 주세요.` }, { status: 400 });
    const dup = await prisma.pricingPreset.findFirst({ where: { userId: user.id, name, NOT: { id: preset.id } } });
    if (dup) return NextResponse.json({ error: "같은 이름의 프리셋이 이미 있습니다." }, { status: 409 });
    const updated = await prisma.pricingPreset.update({ where: { id: preset.id }, data: { name } });
    return NextResponse.json({ id: updated.id, name: updated.name });
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
