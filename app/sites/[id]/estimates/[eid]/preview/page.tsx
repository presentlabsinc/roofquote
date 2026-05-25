import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { PreviewActions } from "./PreviewActions";

export const dynamic = "force-dynamic";

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eid: string }>;
  searchParams: Promise<{ detail?: string }>;
}) {
  const user = await requireUser();
  const { id, eid } = await params;
  const { detail } = await searchParams;
  const detailLevel = detail === "detailed" ? "detailed" : "simple";

  const estimate = await prisma.estimate.findFirst({
    where: { id: eid, site: { userId: user.id } },
    include: { site: true },
  });
  if (!estimate || estimate.siteId !== id) notFound();

  const pdfUrl = `/api/estimates/${eid}/pdf?detail=${detailLevel}`;
  const summaryText = `안녕하세요. 오늘 상담드린 지붕공사 예비 견적서 보내드립니다.

현장 주소: ${estimate.site.siteAddress}
공사 유형: ${estimate.constructionType === "steelWaterproof" ? "옥상 스틸방수" : estimate.constructionType === "rooftopRoof" ? "옥상지붕" : "지붕공사"}
예상 면적: ${estimate.areaM2}㎡
견적 금액: ${estimate.finalPrice.toLocaleString("ko-KR")}원 (${estimate.vatIncluded ? "부가세 포함" : "부가세 별도"})

자세한 내용은 첨부 견적서를 확인해 주세요.
최종 견적은 현장 조건 확인 후 조정될 수 있습니다.`;

  // 손해 견적 감지 — finalPrice 가 totalCost 보다 낮으면 마진이 음수.
  // 미리보기 진입 시점이 "고객에게 보내기 직전" 의 마지막 안전망이라
  // 큰 빨간 배너로 막아서 한 번 더 확인하게 함.
  const isLoss = estimate.marginAmount < 0;
  const lossAmount = Math.abs(estimate.marginAmount);

  return (
    <>
      <AppHeader title="견적서 미리보기" subtitle={estimate.site.customerName} />
      <div className="max-w-lg mx-auto px-4 pt-4 pb-32">
        {isLoss && (
          <div className="mb-3 bg-red-50 border-2 border-red-300 rounded-2xl p-4">
            <div className="flex items-start gap-2.5">
              <span className="text-xl leading-none">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-700">손해 견적입니다</p>
                <p className="text-xs text-red-600 mt-1 leading-relaxed tabular-nums">
                  원가 {estimate.totalCost.toLocaleString("ko-KR")}원 보다 낮은 가격으로 발송됩니다.<br />
                  손해 금액: <b>-{lossAmount.toLocaleString("ko-KR")}원</b><br />
                  의도한 가격이 맞는지 한 번 더 확인해 주세요.
                </p>
              </div>
            </div>
          </div>
        )}
        <PreviewActions
          estimateId={eid}
          siteId={id}
          customerName={estimate.site.customerName}
          summaryText={summaryText}
          detailLevel={detailLevel}
        />
        <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm" style={{ height: "70vh" }}>
          <iframe
            // Key on detail level so iframe reloads when toggled
            key={detailLevel}
            src={pdfUrl}
            className="w-full h-full"
            title="견적서 미리보기"
          />
        </div>
        {/* iOS Safari often refuses to render PDFs inside iframes — show a
            fallback link that always opens the PDF in a new tab. */}
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs font-semibold text-primary bg-primary/5 rounded-xl py-3 mt-3 pressable"
        >
          📄 PDF 가 안 보이면 — 새 탭에서 열기
        </a>
        <p className="text-[11px] text-muted-foreground text-center mt-2">
          위 미리보기는 고객에게 발송될 견적서입니다. 원가·마진은 포함되지 않습니다.
        </p>
      </div>
    </>
  );
}
