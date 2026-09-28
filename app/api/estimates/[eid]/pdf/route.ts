import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { storagePathFromPublicUrl } from "@/lib/storage";
import { createElement } from "react";

// PDF generation is heavy (font fetch + react-pdf render). Default Vercel
// timeout (10s on Hobby) can be tight on cold start. Give it 60s headroom.
export const runtime = "nodejs";
export const maxDuration = 60;
// Force fully dynamic — never try to statically optimize this route.
export const dynamic = "force-dynamic";

const SEAL_MAX_BYTES = 1024 * 1024;
const SEAL_TIMEOUT_MS = 3000;

/**
 * 직인 이미지를 미리 받아 버퍼로 넘긴다 (2026-09-28 — 그동안 비활성이던 직인 복구).
 * react-pdf 에 URL 을 그대로 주면 렌더 중 fetch 실패가 PDF 전체를 깨뜨렸고, 임의 URL 이면
 * 서버가 아무 주소나 가져오게 된다. 그래서: 우리 스토리지 버킷 URL 만, 1MB·3초 제한, PNG/JPEG
 * 매직 바이트 확인. 어떤 이유로든 실패하면 null → PDF 는 '(인)' 으로 정상 생성.
 */
async function loadSeal(url: string | null): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  if (!url || !storagePathFromPublicUrl(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEAL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > SEAL_MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > SEAL_MAX_BYTES) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { data: buf, format: "png" };
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { data: buf, format: "jpg" };
    return null; // WebP·HEIC 등은 react-pdf 미지원 → (인)
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Content-Disposition 파일명 — 한글은 RFC 5987 로, ASCII 폴백도 함께. */
function contentDisposition(kind: "inline" | "attachment", koreanName: string, asciiName: string) {
  return `${kind}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(koreanName)}`;
}

export async function GET(req: Request, { params }: { params: Promise<{ eid: string }> }) {
  // 인증 먼저 — 진단 모드(?test=1)도 로그인한 사용자만.
  const user = await requireUser();
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
  // ?test=1 renders a minimal hello-world PDF with zero data and zero font
  // deps — separates environmental failures from data-driven ones.
  if (url.searchParams.get("test") === "1") {
    try {
      const minimal = createElement(Document, null, createElement(Page, { size: "A4" }, createElement(Text, null, "hello from react-pdf")));
      const buf = await renderToBuffer(minimal);
      const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      return new NextResponse(u8 as unknown as BodyInit, {
        headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
      });
    } catch (err) {
      console.error("[PDF] test render failed", err);
      return NextResponse.json({ mode: "test", error: "PDF 테스트 렌더 실패" }, { status: 500 });
    }
  }

  try {
    // 견적 + 설정 병렬 조회 (독립 쿼리 — 직렬이면 왕복 2번). 설정은 구 견적(비율 스냅샷 없음) 폴백용.
    const [estimate, settings] = await Promise.all([
      prisma.estimate.findFirst({
        where: { id: eid, site: { userId: user.id } },
        include: { lineItems: { orderBy: { sortOrder: "asc" } }, site: true },
      }),
      prisma.pricingSettings.findUnique({ where: { userId: user.id } }),
    ]);
    if (!estimate) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // 마진 분배 비율 — 견적 시점 스냅샷 (2026-09-28). 이후 설정·프리셋을 바꿔도 발송한 견적서의
    // 라인별 금액이 달라지지 않는다. 스냅샷 없는 구 견적만 현재 설정으로 폴백.
    const ratios = {
      material: estimate.marginMaterialRatioSnapshot ?? settings?.marginMaterialRatio ?? 0.5,
      labor: estimate.marginLaborRatioSnapshot ?? settings?.marginLaborRatio ?? 0.25,
      profit: estimate.marginProfitRatioSnapshot ?? settings?.marginProfitRatio ?? 0.25,
    };

    // scopeFlags is Json — could be {}, null, or a shape mismatch on old rows.
    const rawScope = estimate.scopeFlags as unknown;
    const scopeFlags = (rawScope && typeof rawScope === "object"
      ? rawScope
      : {}) as import("@/lib/types").ScopeFlags;

    const detailLevel = url.searchParams.get("detail") === "detailed" ? "detailed" : "simple";
    const sealImage = await loadSeal(estimate.sealImageUrlSnapshot);

    const element = createElement(EstimatePDFDoc, { estimate, scopeFlags, detailLevel, marginRatios: ratios, sealImage });
    // react-pdf's renderToBuffer is typed for DocumentProps, but it actually
    // accepts any React element whose tree contains a <Document> root.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any);
    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // ?download=1 forces download. Otherwise inline for preview iframes.
    const wantDownload = url.searchParams.get("download") === "1";
    const customer = (estimate.customerNameSnapshot ?? estimate.site.customerName ?? "고객").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim() || "고객";
    const koreanName = `견적서-${customer}-${detailLevel === "detailed" ? "상세" : "간단"}.pdf`;
    const asciiName = `estimate-${estimate.estimateNumber ?? eid.slice(0, 8)}.pdf`;

    return new NextResponse(uint8 as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(wantDownload ? "attachment" : "inline", koreanName, asciiName),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // 상세는 서버 로그에만 (응답에 스택·내부 메시지 노출 안 함).
    console.error("[PDF] render failed", {
      eid,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: "PDF 생성에 실패했습니다. 잠시 후 다시 시도해 주세요" }, { status: 500 });
  }
}
