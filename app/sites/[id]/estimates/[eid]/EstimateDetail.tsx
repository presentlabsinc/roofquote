"use client";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Edit2, Check, Share2, FileText } from "lucide-react";
import type { Estimate, EstimateLineItem, Site } from "@/app/generated/prisma/client";

type FullEstimate = Estimate & { lineItems: EstimateLineItem[]; site: Site };

const CATEGORY_LABELS: Record<string, string> = {
  material: "자재비",
  labor: "인건비",
  equipment: "장비비",
  transport: "운송비",
  meals: "식비",
  lodging: "숙박비",
  waste: "폐기물 처리",
  removal: "철거비",
  other: "기타",
};

function fmt(n: number) { return n.toLocaleString("ko-KR") + "원"; }

export function EstimateDetail({ estimate: initial }: { estimate: FullEstimate }) {
  const [est, setEst] = useState<FullEstimate>(initial);
  const [expanded, setExpanded] = useState(true);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineEditVal, setLineEditVal] = useState("");

  // Margin editing
  const [editingMargin, setEditingMargin] = useState<"rate" | "amount" | "final" | null>(null);
  const [marginInput, setMarginInput] = useState("");

  // PDF / share
  const [pdfLoading, setPdfLoading] = useState(false);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/estimates/${est.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("업데이트 실패");
    const updated = await res.json();
    setEst(updated);
  }, [est.id]);

  async function saveLineItem(lineId: string) {
    const total = parseInt(lineEditVal.replace(/,/g, "")) || 0;
    try {
      await patch({ lineItemId: lineId, total });
      toast.success("금액이 수정되었습니다.");
    } catch {
      toast.error("수정에 실패했습니다.");
    }
    setEditingLineId(null);
  }

  async function saveMargin() {
    if (!editingMargin) return;
    try {
      if (editingMargin === "rate") {
        const rate = parseFloat(marginInput) / 100;
        await patch({ marginRate: rate });
      } else if (editingMargin === "amount") {
        const amount = parseInt(marginInput.replace(/,/g, "")) || 0;
        await patch({ marginAmount: amount });
      } else {
        const fp = parseInt(marginInput.replace(/,/g, "")) || 0;
        await patch({ finalPrice: fp });
      }
      toast.success("마진이 업데이트되었습니다.");
    } catch {
      toast.error("수정에 실패했습니다.");
    }
    setEditingMargin(null);
  }

  async function toggleVat() {
    try {
      await patch({ vatIncluded: !est.vatIncluded });
    } catch {
      toast.error("수정에 실패했습니다.");
    }
  }

  async function handleShare() {
    const summaryText = `안녕하세요. 오늘 상담드린 지붕공사 예비 견적서 보내드립니다.\n\n현장 주소: ${est.site.siteAddress}\n공사 유형: 칼라강판 지붕공사\n예상 면적: ${est.areaM2}㎡\n견적 금액: ${fmt(est.finalPrice)} (${est.vatIncluded ? "VAT 포함" : "VAT 별도"})\n\n자세한 내용은 첨부 견적서를 확인해 주세요.\n최종 견적은 현장 조건 확인 후 조정될 수 있습니다.`;

    if (typeof navigator.share !== "undefined") {
      try {
        await navigator.share({ title: "지붕공사 견적서", text: summaryText });
        await patch({ pdfSentAt: new Date().toISOString() });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(summaryText);
      toast.success("카톡 요약문이 클립보드에 복사되었습니다.");
    }
  }

  async function handleDownloadPdf() {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/estimates/${est.id}/pdf`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `견적서-${est.site.customerName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setEst((prev) => ({ ...prev, pdfSentAt: new Date() }));
    } catch {
      toast.error("PDF 생성에 실패했습니다.");
    } finally {
      setPdfLoading(false);
    }
  }

  const marginRatePct = Math.round(est.marginRate * 1000) / 10;

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-1">
          <span className="text-blue-200 text-sm">최종 견적가</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{est.vatIncluded ? "VAT 포함" : "VAT 별도"}</span>
        </div>
        <p className="text-3xl font-bold mb-3">{fmt(est.finalPrice)}</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white/10 rounded-xl p-2 text-center">
            <div className="text-blue-200">총 원가</div>
            <div className="font-semibold">{fmt(est.totalCost)}</div>
          </div>
          <div className="bg-white/10 rounded-xl p-2 text-center">
            <div className="text-blue-200">마진</div>
            <div className="font-semibold">{marginRatePct}%</div>
          </div>
          <div className="bg-white/10 rounded-xl p-2 text-center">
            <div className="text-blue-200">면적</div>
            <div className="font-semibold">{est.areaM2}㎡</div>
          </div>
        </div>
      </div>

      {/* Margin controls */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-4">마진 조정</h2>
        <div className="space-y-3">
          {/* VAT toggle */}
          <div className="flex items-center gap-3">
            <Checkbox id="vat" checked={est.vatIncluded} onCheckedChange={toggleVat} />
            <Label htmlFor="vat" className="text-sm text-gray-700">VAT 포함 (10%)</Label>
          </div>

          <Separator />

          {/* Margin rate */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 w-20 shrink-0">마진율</span>
            {editingMargin === "rate" ? (
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1">
                  <Input autoFocus type="number" value={marginInput} onChange={(e) => setMarginInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveMargin()} className="pr-6" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                </div>
                <Button size="sm" onClick={saveMargin}><Check size={16} /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-base font-semibold text-gray-900">{marginRatePct}%</span>
                <button onClick={() => { setEditingMargin("rate"); setMarginInput(String(marginRatePct)); }} className="p-1 text-gray-400 hover:text-blue-600">
                  <Edit2 size={15} />
                </button>
              </div>
            )}
          </div>

          {/* Margin amount */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 w-20 shrink-0">마진 금액</span>
            {editingMargin === "amount" ? (
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1">
                  <Input autoFocus type="number" value={marginInput} onChange={(e) => setMarginInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveMargin()} className="pr-6" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                </div>
                <Button size="sm" onClick={saveMargin}><Check size={16} /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-base font-semibold text-gray-900">{fmt(est.marginAmount)}</span>
                <button onClick={() => { setEditingMargin("amount"); setMarginInput(String(est.marginAmount)); }} className="p-1 text-gray-400 hover:text-blue-600">
                  <Edit2 size={15} />
                </button>
              </div>
            )}
          </div>

          {/* Final price direct entry */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 w-20 shrink-0">최종가 직접</span>
            {editingMargin === "final" ? (
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1">
                  <Input autoFocus type="number" value={marginInput} onChange={(e) => setMarginInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveMargin()} className="pr-6" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                </div>
                <Button size="sm" onClick={saveMargin}><Check size={16} /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm text-gray-500">입력 시 마진 역산</span>
                <button onClick={() => { setEditingMargin("final"); setMarginInput(String(est.finalPrice)); }} className="p-1 text-gray-400 hover:text-blue-600">
                  <Edit2 size={15} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Price breakdown */}
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">총 원가</span>
            <span>{fmt(est.totalCost)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">마진 ({marginRatePct}%)</span>
            <span>{fmt(est.marginAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">공급가</span>
            <span>{fmt(est.supplyPrice)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">부가세 (10%)</span>
            <span>{fmt(est.vat)}</span>
          </div>
          <div className="flex justify-between font-semibold text-base pt-2 border-t border-gray-100">
            <span>최종 견적가</span>
            <span className="text-blue-600">{fmt(est.finalPrice)}</span>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <span className="font-semibold text-gray-800">원가 항목별 내역</span>
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {expanded && (
          <div className="px-5 pb-5 space-y-1">
            {est.lineItems.map((item) => (
              <div key={item.id} className="py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 shrink-0">{CATEGORY_LABELS[item.category] ?? item.category}</span>
                      {item.isUserEdited && <span className="text-xs text-amber-500">수정됨</span>}
                    </div>
                    <p className="text-sm font-medium text-gray-800">{item.name}</p>
                    <p className="text-xs text-gray-400">
                      {item.quantity}{item.unit} × {item.unitPrice.toLocaleString("ko-KR")}원
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {editingLineId === item.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          autoFocus
                          type="number"
                          value={lineEditVal}
                          onChange={(e) => setLineEditVal(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveLineItem(item.id)}
                          className="w-28 h-8 text-sm text-right"
                        />
                        <Button size="sm" className="h-8 w-8 p-0" onClick={() => saveLineItem(item.id)}>
                          <Check size={14} />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold">{fmt(item.total)}</span>
                        <button
                          onClick={() => { setEditingLineId(item.id); setLineEditVal(String(item.total)); }}
                          className="p-1 text-gray-300 hover:text-blue-600"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment terms */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-2">견적 조건</h2>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">결제 조건</span>
          <span className="font-medium">{est.paymentTerms}</span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-gray-500">유효기간</span>
          <span className="font-medium">{est.validityDays}일</span>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
          className="h-14 rounded-2xl text-sm font-semibold flex items-center gap-2"
        >
          <FileText size={18} />
          {pdfLoading ? "생성 중..." : "PDF 저장"}
        </Button>
        <Button
          onClick={handleShare}
          className="h-14 rounded-2xl text-sm font-semibold flex items-center gap-2"
        >
          <Share2 size={18} />
          카톡 공유
        </Button>
      </div>

      {est.pdfSentAt && (
        <p className="text-center text-xs text-gray-400">
          마지막 발송: {new Date(est.pdfSentAt).toLocaleString("ko-KR")}
        </p>
      )}
    </div>
  );
}
