"use client";
import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Edit2, Check, Eye, EyeOff, Pencil, Undo2, Trash2, FileText, Edit3 } from "lucide-react";
import type { Estimate, EstimateLineItem, Site } from "@prisma/client";
import { distributeMarginForDisplay, type MarginDistributionRatios } from "@/lib/calculations";

type FullEstimate = Estimate & { lineItems: EstimateLineItem[]; site: Site };

const CATEGORY_LABELS: Record<string, string> = {
  material: "자재", labor: "인건", equipment: "장비", transport: "운송",
  meals: "식비", lodging: "숙박", waste: "폐기", removal: "철거", other: "기타",
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

export function EstimateDetail({
  estimate: initial,
  marginRatios = { material: 0.5, labor: 0.25, profit: 0.25 },
}: {
  estimate: FullEstimate;
  marginRatios?: MarginDistributionRatios;
}) {
  const router = useRouter();
  const [est, setEst] = useState<FullEstimate>(initial);
  const [expanded, setExpanded] = useState(true);
  const [clientView, setClientView] = useState(false); // 고객 보기 모드
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineEditVal, setLineEditVal] = useState("");
  const [editingMargin, setEditingMargin] = useState<"rate" | "amount" | "final" | "pyeong" | null>(null);
  const [marginInput, setMarginInput] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

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

  async function undoLineItem(lineId: string) {
    try {
      await patch({ lineItemId: lineId, action: "undo" });
      toast.success("원래 값으로 되돌렸습니다");
    } catch {
      toast.error("실패했습니다");
    }
  }

  async function deleteLineItem(lineId: string) {
    try {
      await patch({ lineItemId: lineId, action: "delete" });
      toast.success("항목이 삭제되었습니다");
    } catch {
      toast.error("삭제에 실패했습니다");
    }
    setPendingDelete(null);
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
      } else if (editingMargin === "pyeong") {
        // 평당가 → 공급가 → marginAmount 로 변환해서 전송.
        // marginAmount 액션 (mode='amount') 으로 들어가면 VAT 토글이 finalPrice
        // 만 흔들고 평당가/마진율은 그대로 유지됨.
        if (pyeong <= 0) {
          toast.error("면적이 0이라 평당가를 적용할 수 없습니다");
          setEditingMargin(null);
          return;
        }
        const perPyeong = parseInt(marginInput.replace(/,/g, "")) || 0;
        const newSupplyPrice = Math.round(perPyeong * pyeong);
        const newMarginAmount = newSupplyPrice - est.totalCost;
        await patch({ marginAmount: newMarginAmount });
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
    try { await patch({ vatIncluded: !est.vatIncluded }); }
    catch { toast.error("수정에 실패했습니다"); }
  }

  const marginRatePct = Math.round(est.marginRate * 1000) / 10;
  // 평당 단가 — VAT 전 공급가 기준 (한국 시공업 관례).
  // VAT 토글해도 평당가는 안 흔들림 — finalPrice 만 변동.
  // 1평 = 3.3058㎡. areaM2 이 0이면 표시·편집 모두 비활성.
  const pyeong = est.areaM2 > 0 ? est.areaM2 / 3.3058 : 0;
  const pricePerPyeong = pyeong > 0 ? Math.round(est.supplyPrice / pyeong) : 0;
  const vatLabel = est.vatIncluded ? "VAT 포함" : "VAT 별도";
  // 손해 견적 감지 — 사장님이 평당가·최종가를 원가보다 낮게 잡으면 음수 마진.
  // 저장은 허용하되 빨간색으로 강조해서 못 보고 지나치는 걸 방지.
  const isLoss = est.marginAmount < 0;

  // 라인별 "고객가" = 원가 라인에 마진을 분배한 후의 표시 금액.
  // PDF 가 보여주는 숫자와 똑같이 계산해서 사장님이 원가 ↔ 고객가 비교 가능.
  // distributeMarginForDisplay 는 입력 라인 순서를 보존하므로 index 매칭으로 충분.
  // (마지막에 synthetic 이윤 라인이 추가될 수 있는데 그건 별도 처리, BreakdownRow 에선 표시 안 함.)
  const customerPriceById = useMemo(() => {
    const map = new Map<string, number>();
    if (est.marginAmount === 0) return map; // 분배할 게 없으면 원가 = 고객가
    const display = distributeMarginForDisplay(est.lineItems, est.marginAmount, marginRatios);
    est.lineItems.forEach((item, i) => {
      const d = display[i];
      if (d) map.set(item.id, d.total);
    });
    return map;
  }, [est.lineItems, est.marginAmount, marginRatios]);

  // 표시용 라인 정렬 — 한국 표준 순서 (재료비 → 노무비 → 경비) 로 그룹핑.
  // DB 의 sortOrder 는 그대로 두고 (다른 곳에서 쓰임), 화면 표시에만 적용.
  // 같은 그룹 안에선 원래 sortOrder 유지 → 자재 안에선 칼라강판 → 용마루 → ... 순서 보존.
  const sortedLineItems = useMemo(() => {
    const rank: Record<string, number> = {
      material: 1,
      labor: 2, meals: 2, lodging: 2,
      equipment: 3, transport: 3,
      removal: 4, waste: 4,
      other: 5,
    };
    return [...est.lineItems].sort((a, b) => {
      const ra = rank[a.category] ?? 9;
      const rb = rank[b.category] ?? 9;
      if (ra !== rb) return ra - rb;
      return a.sortOrder - b.sortOrder;
    });
  }, [est.lineItems]);

  return (
    <div className="space-y-3 pb-48">
      {/* Client-safe view toggle bar */}
      <div className="flex items-center justify-between bg-card rounded-2xl border border-border/60 px-3 py-2.5">
        <div className="flex items-center gap-2 text-xs">
          {clientView ? (
            <><EyeOff size={14} className="text-amber-600" /><span className="font-medium text-amber-700">고객 보기 모드</span></>
          ) : (
            <><Eye size={14} className="text-muted-foreground" /><span className="text-muted-foreground">내부 보기 (원가/마진 표시)</span></>
          )}
        </div>
        <button
          onClick={() => setClientView((v) => !v)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full pressable ${
            clientView ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"
          }`}
        >
          {clientView ? "내부 보기로" : "고객 보기"}
        </button>
      </div>

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
        <p className="text-[34px] font-bold leading-none tabular-nums mb-1">{fmt(est.finalPrice)}<span className="text-lg font-medium ml-1.5 text-white/80">원</span></p>
        <p className="text-[11px] font-medium text-white/70 mb-4">{vatLabel}</p>

        {/* 손해 견적 경고 — 내부 보기에서만 (고객 화면엔 노출 X). */}
        {!clientView && isLoss && (
          <div className="bg-red-500/20 border border-red-300/40 rounded-2xl px-3 py-2 mb-3 flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <div className="text-xs text-white leading-tight">
              <div className="font-bold">손해 견적입니다</div>
              <div className="text-white/80 tabular-nums">원가 대비 {fmt(est.marginAmount)}원 ({marginRatePct}%)</div>
            </div>
          </div>
        )}

        {/* clientView: 2 chips (면적 + 평당가).
            internal: 4 chips in a 2×2 grid (원가, 마진, 면적, 평당가). */}
        <div className="grid gap-2 text-[11px] grid-cols-2">
          {!clientView && (
            <>
              <div className="bg-white/10 backdrop-blur rounded-2xl p-2.5">
                <div className="text-white/60 mb-0.5">총 원가</div>
                <div className="font-bold tabular-nums text-sm">{fmt(est.totalCost)}</div>
              </div>
              <div className={`backdrop-blur rounded-2xl p-2.5 ${isLoss ? "bg-red-500/30 border border-red-300/40" : "bg-white/10"}`}>
                <div className={isLoss ? "text-red-100 mb-0.5" : "text-white/60 mb-0.5"}>마진</div>
                <div className="font-bold tabular-nums text-sm">{marginRatePct}%</div>
              </div>
            </>
          )}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-2.5">
            <div className="text-white/60 mb-0.5">면적</div>
            <div className="font-bold tabular-nums text-sm">{est.areaM2}㎡ <span className="text-white/60 font-normal">({Math.round(pyeong)}평)</span></div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-2xl p-2.5">
            <div className="text-white/60 mb-0.5">평당가</div>
            <div className="font-bold tabular-nums text-sm">{pyeong > 0 ? `${fmt(pricePerPyeong)}원` : "—"}</div>
          </div>
        </div>
      </div>

      {/* Internal-only sections: margin controls + line items */}
      {!clientView && (
        <>
          {/* Margin controls */}
          <div className="bg-card rounded-2xl border border-border/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Pencil size={16} className="text-primary" />
              <h2 className="font-semibold text-foreground text-sm">마진 조정</h2>
            </div>

            {/* 평당가 → 마진율 → 마진금액 → 최종견적가직접 순서.
                평당가는 VAT 전 공급가 기준 — VAT 토글해도 안 흔들림.
                최종견적가직접만 VAT 포함/별도 토글에 따라 값이 변동. */}
            <div className="space-y-1.5 divide-y divide-border/40">
              <EditableRow
                label="평당가 (VAT 전)"
                display={pyeong > 0 ? fmtKrw(pricePerPyeong) : "—"}
                editing={editingMargin === "pyeong"}
                onEdit={() => {
                  if (pyeong <= 0) return;
                  setEditingMargin("pyeong");
                  setMarginInput(String(pricePerPyeong));
                }}
                value={marginInput} onValueChange={setMarginInput} onSave={saveMargin}
                unit="원/평" highlight
              />
              <EditableRow
                label="마진율"
                display={`${marginRatePct}%`}
                editing={editingMargin === "rate"}
                onEdit={() => { setEditingMargin("rate"); setMarginInput(String(marginRatePct)); }}
                value={marginInput} onValueChange={setMarginInput} onSave={saveMargin}
                unit="%" danger={isLoss}
              />
              <EditableRow
                label="마진 금액"
                display={fmtKrw(est.marginAmount)}
                editing={editingMargin === "amount"}
                onEdit={() => { setEditingMargin("amount"); setMarginInput(String(est.marginAmount)); }}
                value={marginInput} onValueChange={setMarginInput} onSave={saveMargin}
                unit="원" danger={isLoss}
              />
              <EditableRow
                label={`최종 견적가 직접 (${vatLabel})`}
                display={est.marginMode === "finalPrice" ? fmtKrw(est.finalPrice) : "역산 계산"}
                placeholder
                editing={editingMargin === "final"}
                onEdit={() => { setEditingMargin("final"); setMarginInput(String(est.finalPrice)); }}
                value={marginInput} onValueChange={setMarginInput} onSave={saveMargin}
                unit="원"
              />
            </div>

            <div className="mt-4 pt-3 border-t border-border/40 space-y-1.5">
              <BreakdownRow label="총 원가" value={fmtKrw(est.totalCost)} />
              <BreakdownRow
                label={isLoss ? `손해 (${marginRatePct}%)` : `마진 (${marginRatePct}%)`}
                value={fmtKrw(est.marginAmount)}
                danger={isLoss}
              />
              <BreakdownRow label="공급가" value={fmtKrw(est.supplyPrice)} />
              <BreakdownRow label="부가세 (10%)" value={fmtKrw(est.vat)} />
              <div className="flex justify-between items-center pt-2 mt-1 border-t border-border/40">
                <span className="text-sm font-semibold text-foreground">최종 견적가 <span className="text-[11px] font-medium text-muted-foreground ml-0.5">({vatLabel})</span></span>
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
                {sortedLineItems.map((item) => (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${CATEGORY_COLORS[item.category] ?? "bg-gray-100 text-gray-700"}`}>
                            {CATEGORY_LABELS[item.category] ?? item.category}
                          </span>
                          {item.isUserEdited && <span className="text-[10px] font-semibold text-amber-600 px-1.5 py-0.5 bg-amber-50 rounded">수정됨</span>}
                        </div>
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                          {item.quantity}{item.unit} × {fmt(item.unitPrice)}원
                          {item.isUserEdited && (
                            <span className="text-muted-foreground/60"> · 원래 {fmt(Math.round(item.quantity * item.unitPrice))}원</span>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {editingLineId === item.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              autoFocus type="number" value={lineEditVal}
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
                            className="flex flex-col items-end gap-0.5 pressable px-1.5 py-1 -mr-1.5 rounded-lg"
                          >
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-semibold tabular-nums">{fmt(item.total)}<span className="text-[10px] ml-0.5 text-muted-foreground">원</span></span>
                              <Edit2 size={12} className="text-muted-foreground/60" />
                            </div>
                            {/* 고객가 — 마진을 라인별로 분배한 후의 표시 금액.
                                원가와 같으면(분배 안 됨) 숨김. */}
                            {customerPriceById.has(item.id) && customerPriceById.get(item.id) !== item.total && (
                              <span className="text-[10px] tabular-nums text-primary/70 font-medium">
                                (고객가 {fmt(customerPriceById.get(item.id)!)}원)
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Action row — undo / delete */}
                    {(item.isUserEdited || pendingDelete === item.id) && (
                      <div className="flex items-center gap-1.5 mt-2">
                        {item.isUserEdited && pendingDelete !== item.id && (
                          <button
                            onClick={() => undoLineItem(item.id)}
                            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-1 rounded-full pressable"
                          >
                            <Undo2 size={11} />원래대로
                          </button>
                        )}
                        {pendingDelete === item.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-destructive font-medium">정말 삭제?</span>
                            <button onClick={() => deleteLineItem(item.id)}
                              className="text-[11px] font-semibold text-white bg-destructive px-2.5 py-1 rounded-full pressable">
                              삭제
                            </button>
                            <button onClick={() => setPendingDelete(null)}
                              className="text-[11px] font-medium text-muted-foreground px-2 py-1 rounded-full pressable">
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPendingDelete(item.id)}
                            className="flex items-center gap-1 text-[11px] font-medium text-destructive/80 bg-destructive/5 px-2 py-1 rounded-full pressable"
                          >
                            <Trash2 size={11} />삭제
                          </button>
                        )}
                      </div>
                    )}

                    {/* Delete also available when not edited — hidden behind a long-press-like UX */}
                    {!item.isUserEdited && pendingDelete !== item.id && (
                      <button
                        onClick={() => setPendingDelete(item.id)}
                        className="text-[10px] text-muted-foreground/40 mt-2 pressable"
                      >
                        항목 삭제
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Edit-flow hint */}
          <p className="text-[11px] text-muted-foreground text-center px-2">
            항목을 추가하려면 새로 견적을 만들거나 위 "기타 비용" 으로 추가하세요
          </p>
        </>
      )}

      {/* Terms — visible in both views, inline editable */}
      <TermsCard
        paymentTerms={est.paymentTerms}
        validityDays={est.validityDays}
        onSavePayment={async (v) => {
          try { await patch({ paymentTerms: v }); toast.success("결제 조건이 수정되었습니다"); }
          catch { toast.error("수정에 실패했습니다"); }
        }}
        onSaveValidity={async (v) => {
          try { await patch({ validityDays: v }); toast.success("유효기간이 수정되었습니다"); }
          catch { toast.error("수정에 실패했습니다"); }
        }}
      />

      {est.pdfSentAt && (
        <p className="text-center text-[11px] text-muted-foreground py-1">
          마지막 발송: {new Date(est.pdfSentAt).toLocaleString("ko-KR")}
        </p>
      )}

      {/* Edit input + Delete — destructive actions grouped at the bottom */}
      <EditEstimateButton estimateId={est.id} siteId={est.siteId} />
      <DeleteEstimateButton estimateId={est.id} siteId={est.siteId} />


      {/* Sticky action — sits above the BottomNav (which is at bottom-0). */}
      <div className="fixed bottom-24 left-0 right-0 z-30 safe-x pointer-events-none">
        <div className="max-w-lg mx-auto px-4 pointer-events-auto">
          <Button
            onClick={() => router.push(`/sites/${est.siteId}/estimates/${est.id}/preview`)}
            className="w-full h-14 rounded-2xl text-base font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 pressable"
          >
            <FileText size={20} />
            견적서 미리보기
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditableRow({
  label, display, editing, onEdit, value, onValueChange, onSave, unit, highlight, placeholder, danger,
}: {
  label: string; display: string; editing: boolean; onEdit: () => void;
  value: string; onValueChange: (v: string) => void; onSave: () => void;
  unit: string; highlight?: boolean; placeholder?: boolean;
  /** Show value in red — used to flag negative margin (손해 견적). */
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 first:pt-0">
      <span className={`text-sm ${danger ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{label}</span>
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
          <span className={`text-sm tabular-nums ${
            danger ? "font-bold text-red-600"
            : highlight ? "font-bold text-foreground"
            : placeholder ? "text-muted-foreground/60"
            : "font-semibold text-foreground"
          }`}>
            {display}
          </span>
          <Edit2 size={13} className={danger ? "text-red-400" : "text-muted-foreground/50"} />
        </button>
      )}
    </div>
  );
}

function BreakdownRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={danger ? "text-red-600 font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${danger ? "text-red-600 font-semibold" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function EditEstimateButton({ estimateId, siteId }: { estimateId: string; siteId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  function goEdit() {
    router.push(`/sites/${siteId}/estimates/new?edit=${estimateId}`);
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 p-4">
      {confirming ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground text-center">
            입력값을 수정하시면 <b className="text-amber-700">아래 항목이 초기화</b>됩니다:
          </p>
          <ul className="text-[11px] text-muted-foreground space-y-0.5 pl-4 list-disc">
            <li>인라인으로 수정한 라인아이템 금액</li>
            <li>마진율 / 최종가 직접 입력</li>
            <li>견적 상세에서 추가/삭제한 라인</li>
          </ul>
          <p className="text-[11px] text-muted-foreground">
            견적 번호와 발송 기록은 유지됩니다. 회사 정보와 단가는 현재 단가 설정값으로 다시 snapshot 됩니다.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              className="flex-1 h-11 rounded-xl text-sm"
            >
              취소
            </Button>
            <Button
              onClick={goEdit}
              className="flex-1 h-11 rounded-xl text-sm font-semibold"
            >
              계속 수정
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-primary py-2 pressable"
        >
          <Edit3 size={15} /> 입력값 수정
        </button>
      )}
    </div>
  );
}

function DeleteEstimateButton({ estimateId, siteId }: { estimateId: string; siteId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function doDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("견적이 삭제되었습니다");
      router.push(`/sites/${siteId}`);
    } catch {
      toast.error("삭제에 실패했습니다");
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-destructive/20 p-4">
      {confirming ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-destructive text-center">
            이 견적을 삭제하시겠습니까? 되돌릴 수 없습니다.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="flex-1 h-11 rounded-xl text-sm"
            >
              취소
            </Button>
            <Button
              onClick={doDelete}
              disabled={deleting}
              className="flex-1 h-11 rounded-xl text-sm font-semibold bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "삭제 중..." : "예, 삭제"}
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-destructive/80 py-2 pressable"
        >
          <Trash2 size={15} /> 견적 삭제
        </button>
      )}
    </div>
  );
}

function TermsCard({
  paymentTerms, validityDays, onSavePayment, onSaveValidity,
}: {
  paymentTerms: string;
  validityDays: number;
  onSavePayment: (v: string) => Promise<void>;
  onSaveValidity: (v: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState<"payment" | "validity" | null>(null);
  const [paymentInput, setPaymentInput] = useState(paymentTerms);
  const [validityInput, setValidityInput] = useState(String(validityDays));

  async function savePayment() {
    await onSavePayment(paymentInput.trim() || paymentTerms);
    setEditing(null);
  }
  async function saveValidity() {
    const n = parseInt(validityInput) || validityDays;
    await onSaveValidity(n);
    setEditing(null);
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 p-4">
      <h2 className="font-semibold text-foreground text-sm mb-3">견적 조건</h2>
      <div className="space-y-1 divide-y divide-border/40">
        <div className="py-2 first:pt-0">
          {editing === "payment" ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus value={paymentInput}
                onChange={(e) => setPaymentInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && savePayment()}
                placeholder="예: 계약금 30% / 잔금 70%"
                className="h-10 text-sm rounded-lg flex-1"
              />
              <Button size="sm" onClick={savePayment} className="h-10 w-10 p-0 rounded-lg"><Check size={15} /></Button>
            </div>
          ) : (
            <button
              onClick={() => { setPaymentInput(paymentTerms); setEditing("payment"); }}
              className="w-full flex items-center justify-between pressable rounded-lg px-1 py-1 -mx-1"
            >
              <span className="text-sm text-muted-foreground">결제 조건</span>
              <span className="flex items-center gap-1">
                <span className="text-sm font-medium text-foreground">{paymentTerms}</span>
                <Edit2 size={12} className="text-muted-foreground/50" />
              </span>
            </button>
          )}
        </div>
        <div className="py-2">
          {editing === "validity" ? (
            <div className="flex items-center gap-2 justify-end">
              <div className="relative w-24">
                <Input
                  autoFocus type="number" value={validityInput}
                  onChange={(e) => setValidityInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveValidity()}
                  className="h-10 pr-7 text-right text-sm tabular-nums rounded-lg"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">일</span>
              </div>
              <Button size="sm" onClick={saveValidity} className="h-10 w-10 p-0 rounded-lg"><Check size={15} /></Button>
            </div>
          ) : (
            <button
              onClick={() => { setValidityInput(String(validityDays)); setEditing("validity"); }}
              className="w-full flex items-center justify-between pressable rounded-lg px-1 py-1 -mx-1"
            >
              <span className="text-sm text-muted-foreground">유효기간</span>
              <span className="flex items-center gap-1">
                <span className="text-sm font-medium text-foreground tabular-nums">{validityDays}일</span>
                <Edit2 size={12} className="text-muted-foreground/50" />
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
