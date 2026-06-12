import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createElement } from "react";

// PDF generation is heavy (font fetch + react-pdf render). Default Vercel
// timeout (10s on Hobby) can be tight on cold start. Give it 60s headroom.
export const runtime = "nodejs";
export const maxDuration = 60;
// Force fully dynamic — never try to statically optimize this route.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ eid: string }> }) {
  const { eid } = await params;
  const url = new URL(req.url);

  // ⚠️ Dynamic imports — DO NOT convert these back to top-level `import`.
  // @react-pdf/renderer ships its own React reconciler that breaks when
  // Turbopack inlines it into the route bundle (symptom: container.document
  // ends up null and the PDF endpoint 500s with "Cannot read properties of
  // null (reading 'props')"). Loading via `await import()` at request time
  // forces Node's native ESM resolver to load it from node_modules, which
  // makes the reconciler use its bundled scheduler correctly.
  const reactPdf = await import("@react-pdf/renderer");
  const { renderToBuffer, Document, Page, Text } = reactPdf;
  const { EstimatePDFDoc } = await import("@/components/EstimatePDF");

  // ─── Diagnostic mode ────────────────────────────────────────────────
  // GET /api/estimates/{anyEid}/pdf?test=1 renders a minimal hello-world PDF
  // with zero data and zero font deps. If this succeeds and the real route
  // still fails, the issue is data-driven inside EstimatePDFDoc. If this
  // also fails, the issue is environmental (react-pdf wiring/runtime).
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
      );
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
    const user = await requireUser();
    // 견적 + 설정 병렬 조회 (독립 쿼리 — 직렬이면 왕복 2번).
    const [estimate, settings] = await Promise.all([
      prisma.estimate.findFirst({
        where: { id: eid, site: { userId: user.id } },
        include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
      }),
      // Pull the current user's margin distribution ratios. We deliberately
      // read CURRENT settings (not snapshotted on the estimate) so the user
      // can re-render an old estimate's PDF with a new split — the underlying
      // line item totals don't change, only how the margin is presented.
      // (⚠️ 외부 감사 백로그: 비율 스냅샷으로 전환 예정 — AGENTS.md 참조)
      prisma.pricingSettings.findUnique({ where: { userId: user.id } }),
    ]);
    if (!estimate) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ratios = {
      material: settings?.marginMaterialRatio ?? 0.5,
      labor: settings?.marginLaborRatio ?? 0.25,
      profit: settings?.marginProfitRatio ?? 0.25,
    };

    // scopeFlags is Json — could be {}, null, or a shape mismatch on old rows.
    // Force-coerce to an empty object so component code never sees null.
    const rawScope = estimate.scopeFlags as unknown;
    const scopeFlags = (rawScope && typeof rawScope === "object"
      ? rawScope
      : {}) as import("@/lib/types").ScopeFlags;

    const detailLevel = url.searchParams.get("detail") === "detailed" ? "detailed" : "simple";

    const element = createElement(EstimatePDFDoc, { estimate, scopeFlags, detailLevel, marginRatios: ratios });
    // react-pdf's renderToBuffer is typed for DocumentProps, but it actually
    // accepts any React element whose tree contains a <Document> root.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any);

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
