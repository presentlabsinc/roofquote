import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Supabase 무료 프로젝트 일시정지 방지 (2026-10-21) — 7일간 활동이 없으면 프로젝트가 멈춘다.
 * Vercel Cron(vercel.json, 하루 1번)이 이 라우트를 불러 DB 에 `SELECT 1` 만 보낸다. 데이터는 읽지도 쓰지도 않는다.
 * CRON_SECRET 이 설정돼 있으면 Vercel 이 보내는 `Authorization: Bearer <CRON_SECRET>` 만 받는다.
 * 로그인 없는 경로라 proxy.ts 의 공개 경로에 /api/cron/ 이 들어 있다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[keepalive] db ping failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
