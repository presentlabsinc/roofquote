import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  SENT_PDF_MAX_BYTES, buildSentPdfName, buildSentPdfPath, checkSentPdfBody, listSentPdfs,
  parseSentPdfDetail, removeSentPdf, uploadSentPdf,
} from "@/lib/sent-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 발송 PDF 보관 (lib/sent-pdf.ts).
 *   POST ?detail=simple|detailed — 본문 = 고객에게 공유한 PDF 바이트 그대로. 보관 후 pdfUrl·pdfSentAt 기록.
 *   GET                         — 이 견적의 보관본 목록 (최신순).
 * pdfUrl 은 이 라우트만 쓴다 (견적 PATCH 로는 못 바꿈).
 */

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** 소유한 견적이면 { pdfUrl }, 아니면 null. */
function findOwned(eid: string, userId: string) {
  return prisma.estimate.findFirst({ where: { id: eid, site: { userId } }, select: { pdfUrl: true } });
}

export async function POST(req: Request, { params }: { params: Promise<{ eid: string }> }) {
  const user = await requireUser();
  const { eid } = await params;

  const detail = parseSentPdfDetail(new URL(req.url).searchParams.get("detail"));
  if (!detail) return json({ error: "간단/상세 구분이 올바르지 않습니다" }, 400);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > SENT_PDF_MAX_BYTES) return json({ error: "PDF 용량이 너무 큽니다 (4MB 이하)" }, 413);

  if (!(await findOwned(eid, user.id))) return json({ error: "견적을 찾을 수 없습니다" }, 404);

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await req.arrayBuffer());
  } catch {
    return json({ error: "요청 형식이 올바르지 않습니다" }, 400);
  }
  const problem = checkSentPdfBody(bytes);
  if (problem === "tooLarge") return json({ error: "PDF 용량이 너무 큽니다 (4MB 이하)" }, 413);
  if (problem) return json({ error: "PDF 파일만 보관할 수 있습니다" }, 415);

  const sentAt = new Date();
  let path: string;
  try {
    path = buildSentPdfPath(user.id, eid, sentAt, detail);
    await uploadSentPdf(user.id, eid, path, bytes);
  } catch (e) {
    console.error("[sent-pdf] store failed", { eid, error: e instanceof Error ? e.message : String(e) });
    return json({ error: "견적서 보관에 실패했습니다" }, 500);
  }

  try {
    const result = await prisma.estimate.updateMany({
      where: { id: eid, site: { userId: user.id } },
      data: { pdfUrl: path, pdfSentAt: sentAt },
    });
    if (result.count === 0) {
      // 그 사이 견적이 삭제됨 — 올린 파일도 되돌린다.
      await removeSentPdf(user.id, eid, path);
      return json({ error: "견적을 찾을 수 없습니다" }, 404);
    }
  } catch (e) {
    console.error("[sent-pdf] record failed", { eid, error: e instanceof Error ? e.message : String(e) });
    await removeSentPdf(user.id, eid, path);
    return json({ error: "발송 기록에 실패했습니다" }, 500);
  }

  return json({ sentAt: sentAt.toISOString(), name: buildSentPdfName(sentAt, detail) });
}

export async function GET(_req: Request, { params }: { params: Promise<{ eid: string }> }) {
  const user = await requireUser();
  const { eid } = await params;
  const estimate = await findOwned(eid, user.id);
  if (!estimate) return json({ error: "견적을 찾을 수 없습니다" }, 404);
  // 보관한 적 없는 견적은 스토리지를 조회하지 않는다 (pdfUrl 은 보관 성공 시에만 기록됨).
  if (!estimate.pdfUrl) return json({ items: [] });
  try {
    return json({ items: await listSentPdfs(user.id, eid) });
  } catch (e) {
    console.error("[sent-pdf] list failed", { eid, error: e instanceof Error ? e.message : String(e) });
    return json({ error: "보낸 견적서 목록을 불러오지 못했습니다" }, 500);
  }
}
