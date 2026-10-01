import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { contentDisposition, safeFileNamePart } from "@/lib/content-disposition";
import { downloadSentPdf, looksLikePdf, parseSentPdfName, sentPdfFolder } from "@/lib/sent-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

/** 보낸 견적서 PDF 한 부 열기 — 소유 확인 후 비공개 버킷에서 받아 그대로 돌려준다. */
export async function GET(_req: Request, { params }: { params: Promise<{ eid: string; name: string }> }) {
  const user = await requireUser();
  const { eid, name } = await params;

  const parsed = parseSentPdfName(name);
  if (!parsed) return NextResponse.json({ error: "보낸 견적서를 찾을 수 없습니다" }, { status: 404 });

  const estimate = await prisma.estimate.findFirst({
    where: { id: eid, site: { userId: user.id } },
    select: { estimateNumber: true, customerNameSnapshot: true, site: { select: { customerName: true } } },
  });
  if (!estimate) return NextResponse.json({ error: "보낸 견적서를 찾을 수 없습니다" }, { status: 404 });

  let pdf: Buffer | null = null;
  try {
    pdf = await downloadSentPdf(user.id, eid, `${sentPdfFolder(user.id, eid)}/${name}`);
  } catch (e) {
    console.error("[sent-pdf] open failed", { eid, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "보낸 견적서를 열지 못했습니다" }, { status: 500 });
  }
  if (!pdf || !looksLikePdf(pdf)) return NextResponse.json({ error: "보낸 견적서를 찾을 수 없습니다" }, { status: 404 });

  const customer = safeFileNamePart(estimate.customerNameSnapshot ?? estimate.site.customerName, "고객");
  const day = KST_DATE.format(parsed.sentAt).replace(/-/g, "");
  const level = parsed.detail === "detailed" ? "상세" : "간단";
  const koreanName = `견적서-${customer}-${level}-${day}-발송본.pdf`;
  const asciiName = `estimate-${estimate.estimateNumber ?? eid.slice(0, 8)}-sent-${day}.pdf`;

  return new NextResponse(new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition("inline", koreanName, asciiName),
      "Cache-Control": "private, no-store",
    },
  });
}
