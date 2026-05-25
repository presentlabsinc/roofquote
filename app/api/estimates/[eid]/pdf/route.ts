import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderToBuffer, Document, Page, Text } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { EstimatePDFDoc } from "@/components/EstimatePDF";

// PDF generation is heavy (font fetch + react-pdf render). Default Vercel
// timeout (10s on Hobby) can be tight on cold start. Give it 60s headroom.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ eid: string }> }) {
  const { eid } = await params;
  const url = new URL(req.url);

  // ─── Diagnostic mode ────────────────────────────────────────────────
  // Visit /api/estimates/{anyEid}/pdf?test=1 to render a minimal PDF
  // with no Korean text, no font registration dependency, no data. If
  // this fails, the issue is environmental (Turbopack/react-pdf wiring/
  // serverless runtime). If it succeeds, the issue is in EstimatePDFDoc.
  if (url.searchParams.get("test") === "1") {
    try {
      const minimal = createElement(
        Document,
        null,
        createElement(
          Page,
          { size: "A4" },
          createElement(Text, null, "hello from react-pdf"),
        ),
      ) as ReactElement<DocumentProps>;
      const buf = await renderToBuffer(minimal);
      const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      return new NextResponse(u8 as unknown as BodyInit, {
        headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
      });
    } catch (err) {
      return NextResponse.json(
        {
          mode: "test",
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        },
        { status: 500 },
      );
    }
  }

  try {
    const estimate = await prisma.estimate.findUnique({
      where: { id: eid },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
    });
    if (!estimate) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // scopeFlags is Json — could be {}, null, or a shape mismatch on old rows.
    // Force-coerce to an empty object so component code never sees null.
    const rawScope = estimate.scopeFlags as unknown;
    const scopeFlags = (rawScope && typeof rawScope === "object"
      ? rawScope
      : {}) as import("@/lib/types").ScopeFlags;

    const detailLevel = url.searchParams.get("detail") === "detailed" ? "detailed" : "simple";

    // Pre-render-time defensive snapshot. If EstimatePDFDoc throws during
    // React's reconciliation, react-pdf's reconciler silently swallows the
    // error and leaves container.document = null, which then surfaces as
    // "Cannot read properties of null (reading 'props')" at line 139 of
    // react-pdf.js's render(). To diagnose, we render the doc via
    // React.renderToStaticMarkup substitute (a try around createElement)
    // and let any synchronous throws bubble up to our catch block.
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
  } catch (err) {
    // Surface the error so we can see it in Vercel logs + as a structured
    // response (instead of a 500 with no body, which iframes render blank).
    console.error("[PDF] render failed", {
      eid,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      {
        error: "PDF 생성 실패",
        detail: err instanceof Error ? err.message : String(err),
        // Stack helps diagnose where inside react-pdf the null props happens.
        // Keep this in v0 — it's only seen by us, no PII.
        stack: err instanceof Error ? err.stack : undefined,
      },
      { status: 500 },
    );
  }
}
