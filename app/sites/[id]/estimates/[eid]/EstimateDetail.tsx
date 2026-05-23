"use client";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Edit2, Check, Share2, FileText, Pencil } from "lucide-react";
import type { Estimate, EstimateLineItem, Site } from "@prisma/client";

type FullEstimate = Estimate & { lineItems: EstimateLineItem[]; site: Site };

const CATEGORY_LABELS: Record<string, string> = {
  material: "자재",
  labor: "인건",
  equipment: "장비",
  transport: "운송",
  meals: "식비",
  lodging: "숙박",
  waste: "폐기",
  removal: "철거",
  other: "기타",
};

const CATEGORY_COLORS: Record<string, string> = {
  material: "bg-blue-50 text-blue-700",
  labor: "bg-amber-50 text-amber-700",
  equipment: "bg-purple-50 text-purple-700",
  transport: "bg-cyan-50 text-cyan-700",
  meals: "bg-orange-50 text-orange-700",
  lodging: "bg-pink-50 text-pink-700",
  waste: "bg-gray-100 text-gray-700",
  removal: "bg-red-50 text-red-700",
  other: "bg-gray-100 text-gray-700",
};

function fmt(n: number) { return n.toLocaleString("ko-KR"); }
function fmtKrw(n: number) { return fmt(n) + "원"; }

export function EstimateDetail({ estimate: initial }: { estimate: FullEstimate }) {
  const [est, setEst] = useState<FullEstimate>(initial);
  const [expanded, setExpanded] = useState(true);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineEditVal, setLineEditVal] = useState("");
  const [editingMargin, setEditingMargin] = useState<"rate" | "amount" | "final" | null>(null);
  const [marginInput, setMarginInput] = useState("");
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
      toast.success("금액이 수정되었습니다");
    } catch {
      toast.error("수정에 실패했습니다");
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
      toast.success("업데이트되었습니다");
    } catch {
      toast.error("수정에 실패했습니다");
    }
    setEditingMargin(null);
  }

  async function toggleVat() {
    try {
      await patch({ vatIncluded: !est.vatIncluded });
    } catch {
      toast.error("수정에 실패했습니다");
    }
  }

  async function handleShare() {
    const summaryText = `안녕하세요. 오늘 상담드린 지붕공사 예비 견적서 보내드립니다.\n\n현장 주소: ${est.site.siteAddress}\n공사 유형: 칼라강판 지붕공사\n예상 면적: ${est.areaM2}㎡\n견적 금액: ${fmtKrw(est.finalPrice)} (${est.vatIncluded ? "VAT 포함" : "VAT 별도"})\n\n자세한 내용은 첨부 견적서를 확인해 주세요.\n최종 견적은 현장 조건 확인 후 조정될 수 있습니다.`;

    if (typeof navigator.share !== "undefined") {
      try {
        await navigator.share({ title: "지붕공사 견적서", text: summaryText });
        await patch({ pdfSentAt: new Date().toISOString() });
      } catch {/* user cancelled */}
    } else {
      await navigator.clipboard.writeText(summaryText);
      toast.success("카톡 요약문이 복사되었습니다");
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
      toast.success("PDF가 저장되었습니다");
    } catch {
      toast.error("PDF 생성에 실패했습니다");
    } finally {
      setPdfLoading(false);
    }
  }

  const marginRatePct = Math.round(est.marginRate * 1000) / 10;

  return (
    <div className="space-y-3 pb-32">
      {/* Hero: Final price */}
      <div className="bg-gradient-to-br from-primary to-blue-700 rounded-3xl p-5 text-white shadow-xl shadow-primary/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/70 text-xs font-medium uppercase tracking-wider">최종 견적가</span>
          <button
            onClick={toggleVat}
            className="text-[11px] font-medium px-2.5 py-1 bg-white/15 rounded-full pressable"
          >
            {est.vatIncluded ? "VAT 포함" : "VAT 별도"}
          </button>
        </div>
        <p className="text-[34px] font-bold leading-none tabular-nums mb-4">{fmt(est.finalPrice)}<span className="text-lg font-medium ml-1.5 text-white/80">원</span></p>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="bg-white/10 backdrop-blur rounded-2xl p-2.5">
            <div className="text-white/60 mb-0.5">총 원가</div>
            <div className="font-bold tabular-nums text-sm">{fmt(est.totalCost)}</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-2xl p-2.5">
            <div className="text-white/60 mb-0.5">마진</div>
            <div className="font-bold tabular-nums text-sm">{marginRatePct}%</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-2xl p-2.5">
            <div className="text-white/60 mb-0.5">면적</div>
            <div className="font-bold tabular-nums text-sm">{est.areaM2}㎡</div>
          </div>
        </div>
      </div>

      {/* Margin controls */}
      <div className="bg-card rounded-2xl border border-border/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Pencil size={16} className="text-primary" />
          <h2 className="font-semibold text-foreground text-sm">마진 조정</h2>
        </div>

        <div className="space-y-1.5 divide-y divide-border/40">
          <EditableRow
            label="마진율"
            display={`${marginRatePct}%`}
            editing={editingMargin === "rate"}
            onEdit={() => { setEditingMargin("rate"); setMarginInput(String(marginRatePct)); }}
            value={marginInput}
            onValueChange={setMarginInput}
            onSave={saveMargin}
            unit="%"
            highlight
          />
          <EditableRow
            label="마진 금액"
            display={fmtKrw(est.marginAmount)}
            editing={editingMargin === "amount"}
            onEdit={() => { setEditingMargin("amount"); setMarginInput(String(est.marginAmount)); }}
            value={marginInput}
            onValueChange={setMarginInput}
            onSave={saveMargin}
            unit="원"
          />
          <EditableRow
            label="최종 견적가 직접"
            display={est.marginMode === "finalPrice" ? fmtKrw(est.finalPrice) : "역산 계산"}
            placeholder
            editing={editingMargin === "final"}
            onEdit={() => { setEditingMargin("final"); setMarginInput(String(est.finalPrice)); }}
            value={marginInput}
            onValueChange={setMarginInput}
            onSave={saveMargin}
            unit="원"
          />
        </div>

        {/* Breakdown */}
        <div className="mt-4 pt-3 border-t border-border/40 space-y-1.5">
          <BreakdownRow label="총 원가" value={fmtKrw(est.totalCost)} />
          <BreakdownRow label={`마진 (${marginRatePct}%)`} value={fmtKrw(est.marginAmount)} />
          <BreakdownRow label="공급가" value={fmtKrw(est.supplyPrice)} />
          <BreakdownRow label="부가세 (10%)" value={fmtKrw(est.vat)} />
          <div className="flex justify-between items-center pt-2 mt-1 border-t border-border/40">
            <span className="text-sm font-semibold text-foreground">최종 견적가</span>
            <span className="text-base font-bold text-primary tabular-nums">{fmtKrw(est.finalPrice)}</span>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-4 pressable"
        >
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            <span className="font-semibold text-foreground text-sm">원가 항목별 ({est.lineItems.length})</span>
          </div>
          {expanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
        </button>

        {expanded && (
          <div className="divide-y divide-border/40">
            {est.lineItems.map((item) => (
              <div key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${CATEGORY_COLORS[item.category] ?? "bg-gray-100 text-gray-700"}`}>
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </span>
                      {item.isUserEdited && <span className="text-[10px] font-semibold text-amber-600 px-1.5 py-0.5 bg-amber-50 rounded">수정됨</span>}
                    </div>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                      {item.quantity}{item.unit} × {fmt(item.unitPrice)}원
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
                          className="w-28 h-9 text-sm text-right tabular-nums rounded-lg"
                        />
                        <Button size="sm" className="h-9 w-9 p-0 rounded-lg" onClick={() => saveLineItem(item.id)}>
                          <Check size={15} />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingLineId(item.id); setLineEditVal(String(item.total)); }}
                        className="flex items-center gap-1 pressable px-1.5 py-1 -mr-1.5 rounded-lg"
                      >
                        <span className="text-sm font-semibold tabular-nums">{fmt(item.total)}<span className="text-[10px] ml-0.5 text-muted-foreground">원</span></span>
                        <Edit2 size={12} className="text-muted-foreground/60" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Terms */}
      <div className="bg-card rounded-2xl border border-border/60 p-4">
        <h2 className="font-semibold text-foreground text-sm mb-3">견적 조건</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">결제 조건</span>
            <span className="font-medium text-foreground">{est.paymentTerms}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">유효기간</span>
            <span className="font-medium text-foreground tabular-nums">{est.validityDays}일</span>
          </div>
        </div>
      </div>

      {est.pdfSentAt && (
        <p className="text-center text-[11px] text-muted-foreground py-1">
          마지막 발송: {new Date(est.pdfSentAt).toLocaleString("ko-KR")}
        </p>
      )}

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 safe-x bg-gradient-to-t from-background via-background/95 to-transparent pt-6 pb-4">
        <div className="max-w-lg mx-auto px-4 safe-bottom flex gap-2.5">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="flex-1 h-14 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 pressable bg-card"
          >
            <FileText size={18} />
            {pdfLoading ? "생성 중" : "PDF 저장"}
          </Button>
          <Button
            onClick={handleShare}
            className="flex-1 h-14 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 pressable"
          >
            <Share2 size={18} />
            카톡 보내기
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditableRow({
  label, display, editing, onEdit, value, onValueChange, onSave, unit, highlight, placeholder,
}: {
  label: string; display: string; editing: boolean; onEdit: () => void;
  value: string; onValueChange: (v: string) => void; onSave: () => void;
  unit: string; highlight?: boolean; placeholder?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 first:pt-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <div className="relative w-36">
            <Input
              autoFocus
              type="number"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSave()}
              className="h-10 pr-7 text-right text-sm tabular-nums rounded-lg"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
          </div>
          <Button size="sm" onClick={onSave} className="h-10 w-10 p-0 rounded-lg"><Check size={16} /></Button>
        </div>
      ) : (
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 pressable rounded-lg px-2 py-1 -mr-2"
        >
          <span className={`text-sm tabular-nums ${highlight ? "font-bold text-foreground" : placeholder ? "text-muted-foreground/60" : "font-semibold text-foreground"}`}>
            {display}
          </span>
          <Edit2 size={13} className="text-muted-foreground/50" />
        </button>
      )}
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}
