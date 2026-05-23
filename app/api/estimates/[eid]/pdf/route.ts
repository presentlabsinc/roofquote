import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { EstimatePDFDoc } from "@/components/EstimatePDF";

export async function GET(_: Request, { params }: { params: Promise<{ eid: string }> }) {
  const { eid } = await params;

  const estimate = await prisma.estimate.findUnique({
    where: { id: eid },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
  });
  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const scopeFlags = estimate.scopeFlags as unknown as import("@/lib/types").ScopeFlags;

  const element = createElement(EstimatePDFDoc, { estimate, scopeFlags }) as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  await prisma.estimate.update({
    where: { id: eid },
    data: { pdfSentAt: new Date() },
  });

  const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  return new NextResponse(uint8 as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="estimate-${eid.slice(0, 8)}.pdf"`,
    },
  });
}
