import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { EstimatePDFDoc } from "@/components/EstimatePDF";

export async function GET(req: Request, { params }: { params: Promise<{ eid: string }> }) {
  const { eid } = await params;

  const estimate = await prisma.estimate.findUnique({
    where: { id: eid },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
  });
  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const scopeFlags = estimate.scopeFlags as unknown as import("@/lib/types").ScopeFlags;

  const url = new URL(req.url);
  const detailLevel = url.searchParams.get("detail") === "detailed" ? "detailed" : "simple";

  const element = createElement(EstimatePDFDoc, { estimate, scopeFlags, detailLevel }) as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // ?download=1 forces download. Otherwise inline for preview iframes.
  const wantDownload = url.searchParams.get("download") === "1";
  const filename = `estimate-${eid.slice(0, 8)}.pdf`;
  const disposition = wantDownload
    ? `attachment; filename="${filename}"`
    : `inline; filename="${filename}"`;

  return new NextResponse(uint8 as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}
