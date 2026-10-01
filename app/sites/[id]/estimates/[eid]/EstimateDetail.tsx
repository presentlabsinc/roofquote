"use client";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Edit2, Check, Eye, EyeOff, Pencil, Undo2, Trash2, FileText, Edit3, Plus, X, ExternalLink } from "lucide-react";
import type { Estimate, EstimateLineItem, Site } from "@prisma/client";
import { distributeMarginForDisplay, type MarginDistributionRatios } from "@/lib/calculations";
import type { SentPdfEntry } from "@/lib/sent-pdf-path";

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
  // 서버가 새 데이터를 주면(router.refresh — 예: 미리보기에서 발송 기록이 끝남) 화면 상태도 따라간다.
  // 이 화면이 이미 열려 있으면 useState 초기값은 다시 읽히지 않아서, 발송 기록·'보낸 견적서'가 옛값에 머물렀다.
  // est 는 서버 응답으로만 바뀌는 값이라 새 서버 데이터로 덮어도 잃는 입력이 없다.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setEst(initial);
  }
  const [expanded, setExpanded] = useState(true);
  const [clientView, setClientView] = useState(false); // 고객 보기 모드
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineEditVal, setLineEditVal] = useState("");
  const [editingMargin, setEditingMargin] = useState<"rate" | "amount" | "final" | "pyeong" | null>(null);
  const [marginInput, setMarginInput] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // 요청 중에는 다른 변경을 막는다 — 연타·동시 요청이 서로 덮어써 'VAT 포함' 표시와 VAT 없는
  // 최종가가 함께 저장되던 문제 (2026-09-28).
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    if (busy) throw new Error("이전 변경을 저장하는 중입니다");
    setBusy(true);
    try {
      const res = await fetch(`/api/estimates/${est.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "수정에 실패했습니다");
      }
      const updated = await res.json();
      setEst(updated);
      // 라우터 캐시 갱신 — 뒤로가기·미리보기(카톡 요약문)가 수정 전 금액을 보여주던 문제.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [est.id, busy, router]);

  /** 숫자 입력 파싱 — 빈 값은 null (= 편집 취소), 숫자가 아니면 NaN. */
  function parseNum(v: string): number | null {
    const t = v.replace(/,/g, "").trim();
    if (t === "") return null;
    return Number(t);
  }

  async function saveLineItem(lineId: string) {
    const total = parseNum(lineEditVal);
    if (total === null) { setEditingLineId(null); return; } // 빈 값 = 취소 (0원 저장 방지)
    if (!Number.isFinite(total)) { toast.error("금액을 숫자로 입력해 주세요"); return; }
    try {
      await patch({ lineItemId: lineId, total: Math.round(total) });
      toast.success("금액이 수정되었습니다");
      setEditingLineId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "수정에 실패했습니다");
    }
  }

  async function undoLineItem(lineId: string) {
    try {
      await patch({ lineItemId: lineId, action: "undo" });
      toast.success("원래 값으로 되돌렸습니다");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "실패했습니다");
    }
  }

  async function deleteLineItem(lineId: string) {
    try {
      await patch({ lineItemId: lineId, action: "delete" });
      toast.success("항목이 삭제되었습니다");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다");
    }
    setPendingDelete(null);
  }

  async function saveMargin() {
    if (!editingMargin) return;
    const n = parseNum(marginInput);
    if (n === null) { setEditingMargin(null); return; } // 빈 값 = 취소
    if (!Number.isFinite(n)) { toast.error("숫자로 입력해 주세요"); return; }
    try {
      if (editingMargin === "rate") {
        // 매출 대비 마진율은 100% 이상이 불가능 — 99% 초과 입력은 오타로 보고 막는다.
        if (n >= 99.5 || n <= -100) { toast.error("마진율은 -100% ~ 99% 사이로 입력해 주세요"); return; }
        await patch({ marginRate: n / 100 });
      } else if (editingMargin === "amount") {
        await patch({ marginAmount: Math.round(n) });
      } else if (editingMargin === "pyeong") {
        // 평당가 × 평수 = 공급가(VAT 전). 서버가 자기 원가 기준으로 마진을 역산 (mode 'amount'
        // — VAT 를 토글해도 평당가 유지).
        if (pyeong <= 0) {
          toast.error("면적이 0이라 평당가를 적용할 수 없습니다");
          setEditingMargin(null);
          return;
        }
        if (n <= 0) { toast.error("평당가를 입력해 주세요"); return; }
        await patch({ supplyPrice: Math.round(n * pyeong) });
      } else {
        if (n <= 0) { toast.error("최종 견적가를 입력해 주세요"); return; }
        await patch({ finalPrice: Math.round(n) });
      }
      toast.success("업데이트되었습니다");
      setEditingMargin(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "수정에 실패했습니다");
    }
  }

  async function setVat(included: boolean) {
    if (included === est.vatIncluded) return;
    try { await patch({ vatIncluded: included }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "수정에 실패했습니다"); }
  }

  async function addLineItem(item: { name: string; quantity: number; unit: string; unitPrice: number; category: string }) {
    try {
      await patch({ action: "add", newLineItem: item });
      toast.success("항목을 추가했습니다");
      setAdding(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "추가에 실패했습니다");
    }
  }

  const marginRatePct = Math.round(est.marginRate * 1000) / 10;
  // 평당 단가 — VAT 전 공급가 기준 (한국 시공업 관례).
  // VAT 토글해도 평당가는 안 흔들림 — finalPrice 만 변동.
  // 1평 = 3.3058㎡. areaM2 이 0이면 표시·편집 모두 비활성.
  // 평수는 소수 2자리로 — 30평으로 입력한 면적(99.17㎡)이 29.9988평이 되어 평당가×평수가
  // 딱 떨어지지 않던 문제 (30평 × 30만 → 8,999,637원).
  const pyeong = est.areaM2 > 0 ? Math.round((est.areaM2 / 3.3058) * 100) / 100 : 0;
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
          <span className="text-white/70 text-xs font-medium uppercase tracking-wider">
            최종 견적가{est.estimateNumber ? <span className="ml-1.5 normal-case tracking-normal text-white/50 tabular-nums">No. {est.estimateNumber}</span> : null}
          </span>
          {/* VAT 라벨은 스위치 밖, 세그먼트 토글은 포함/별도만 */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-white/60 tracking-wide">VAT</span>
            <div className="flex items-center gap-0.5 bg-white/15 rounded-full p-0.5">
              <button
                onClick={() => setVat(true)} disabled={busy}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full pressable transition-colors ${
                  est.vatIncluded ? "bg-white text-primary shadow-sm" : "text-white/70"
                }`}
              >
                포함
              </button>
              <button
                onClick={() => setVat(false)} disabled={busy}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full pressable transition-colors ${
                  !est.vatIncluded ? "bg-white text-primary shadow-sm" : "text-white/70"
                }`}
              >
                별도
              </button>
            </div>
          </div>
        </div>
        <p className="text-[34px] font-bold leading-none tabular-nums mb-1">{fmt(est.finalPrice)}<span className="text-lg font-medium ml-1.5 text-white/80">원</span></p>
        <p className="text-[11px] font-medium text-white/70 mb-4">{vatLabel}</p>

        {/* 손해 견적 경고 — 내부 보기에서만 (고객 화면엔 노출 X). */}
        {!clientView && isLoss && (
          <div className="bg-red-500/20 border border-red-300/40 rounded-2xl px-3 py-2 mb-3 flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <div className="text-xs text-white leading-tight">
              <div className="font-bold">손해 견적입니다</div>
              <div className="text-white/80 tabular-nums">매출 대비 {fmt(est.marginAmount)}원 ({marginRatePct}%)</div>
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
                label="평당가"
                display={pyeong > 0 ? fmtKrw(pricePerPyeong) : "—"}
                editing={editingMargin === "pyeong"}
                onEdit={() => {
                  if (pyeong <= 0) return;
                  setEditingMargin("pyeong");
                  setMarginInput(String(pricePerPyeong));
                }}
                value={marginInput} onValueChange={setMarginInput} onSave={saveMargin} onCancel={() => setEditingMargin(null)} disabled={busy}
                unit="원/평" highlight
              />
              <EditableRow
                label="마진율"
                display={`${marginRatePct}%`}
                editing={editingMargin === "rate"}
                onEdit={() => { setEditingMargin("rate"); setMarginInput(String(marginRatePct)); }}
                value={marginInput} onValueChange={setMarginInput} onSave={saveMargin} onCancel={() => setEditingMargin(null)} disabled={busy}
                unit="%" danger={isLoss}
              />
              <EditableRow
                label="마진 금액"
                display={fmtKrw(est.marginAmount)}
                editing={editingMargin === "amount"}
                onEdit={() => { setEditingMargin("amount"); setMarginInput(String(est.marginAmount)); }}
                value={marginInput} onValueChange={setMarginInput} onSave={saveMargin} onCancel={() => setEditingMargin(null)} disabled={busy}
                unit="원" danger={isLoss}
              />
              <EditableRow
                label={`최종 견적가 직접 (${vatLabel})`}
                display={est.marginMode === "finalPrice" ? fmtKrw(est.finalPrice) : "역산 계산"}
                placeholder
                editing={editingMargin === "final"}
                onEdit={() => { setEditingMargin("final"); setMarginInput(String(est.finalPrice)); }}
                value={marginInput} onValueChange={setMarginInput} onSave={saveMargin} onCancel={() => setEditingMargin(null)} disabled={busy}
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
                              autoFocus type="text" inputMode="numeric" value={lineEditVal}
                              onChange={(e) => setLineEditVal(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveLineItem(item.id);
                                if (e.key === "Escape") setEditingLineId(null);
                              }}
                              className="w-28 h-9 text-sm text-right tabular-nums rounded-lg"
                            />
                            <Button size="sm" className="h-9 w-9 p-0 rounded-lg" disabled={busy} onClick={() => saveLineItem(item.id)} aria-label="저장">
                              <Check size={15} />
                            </Button>
                            <Button size="sm" variant="outline" className="h-9 w-9 p-0 rounded-lg" onClick={() => setEditingLineId(null)} aria-label="취소">
                              <X size={15} />
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

          {/* 항목 직접 추가 — 자동 계산에 없는 비용을 이 견적에만 추가 */}
          {adding ? (
            <AddLineForm busy={busy} onCancel={() => setAdding(false)} onAdd={addLineItem} />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-primary bg-card rounded-2xl border border-dashed border-primary/40 py-3 pressable"
            >
              <Plus size={15} /> 항목 직접 추가
            </button>
          )}
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

      {/* 보낸 견적서 — 보관된 발송본(보낸 그대로). 내부 보기에서만, 없으면 표시 안 함. */}
      <SentPdfList estimateId={est.id} latestPath={est.pdfUrl} hidden={clientView} />

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

const SENT_AT_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
});

function fmtSize(bytes: number | null) {
  if (bytes === null) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * 보관된 발송 PDF 목록 — 화면이 뜬 뒤 불러오고, 누르면 보낸 그대로의 PDF 를 새 탭에서 연다.
 * `latestPath`(= 서버의 pdfUrl, 보관할 때마다 바뀜)가 바뀌면 다시 불러온다 — 보관이 끝나며
 * router.refresh() 가 오면 목록도 따라온다. 보관한 적이 없으면(null) 요청하지 않는다.
 */
function SentPdfList({ estimateId, latestPath, hidden }: { estimateId: string; latestPath: string | null; hidden: boolean }) {
  const [items, setItems] = useState<SentPdfEntry[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!latestPath) return;
    let cancelled = false;
    fetch(`/api/estimates/${estimateId}/sent-pdf`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((j: { items?: SentPdfEntry[] } | null) => {
        if (!cancelled && Array.isArray(j?.items)) setItems(j.items);
      })
      .catch(() => { /* 목록은 부가 정보 — 실패하면 표시 안 함 */ });
    return () => { cancelled = true; };
  }, [estimateId, latestPath]);

  if (hidden || !latestPath || items.length === 0) return null;
  const visible = showAll ? items : items.slice(0, 3);

  return (
    <div className="bg-card rounded-2xl border border-border/60 px-4 pt-3 pb-1">
      <h2 className="font-semibold text-foreground text-sm mb-1">보낸 견적서 <span className="text-muted-foreground font-normal tabular-nums">({items.length})</span></h2>
      <div className="divide-y divide-border/40">
        {visible.map((it) => (
          <a
            key={it.name}
            href={`/api/estimates/${estimateId}/sent-pdf/${encodeURIComponent(it.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 min-h-11 py-2 pressable"
          >
            <span className="text-sm text-foreground tabular-nums">{SENT_AT_FMT.format(new Date(it.sentAt))}</span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {it.detail === "detailed" ? "상세" : "간단"}
              </span>
              {it.size !== null && <span className="text-[11px] text-muted-foreground tabular-nums">{fmtSize(it.size)}</span>}
              <ExternalLink size={13} className="text-muted-foreground/60" />
            </span>
          </a>
        ))}
      </div>
      {items.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full min-h-11 text-xs font-medium text-muted-foreground pressable"
        >
          {showAll ? "접기" : `${items.length - 3}개 더 보기`}
        </button>
      )}
    </div>
  );
}

function EditableRow({
  label, display, editing, onEdit, value, onValueChange, onSave, onCancel, disabled, unit, highlight, placeholder, danger,
}: {
  label: string; display: string; editing: boolean; onEdit: () => void;
  value: string; onValueChange: (v: string) => void; onSave: () => void;
  /** 편집 취소 (Esc · X) — 실수로 탭해도 값이 바뀌지 않게. */
  onCancel: () => void;
  disabled?: boolean;
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
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
                if (e.key === "Escape") onCancel();
              }}
              className="h-10 pr-7 text-right text-sm tabular-nums rounded-lg"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
          </div>
          <Button size="sm" onClick={onSave} disabled={disabled} className="h-10 w-10 p-0 rounded-lg" aria-label="저장"><Check size={16} /></Button>
          <Button size="sm" variant="outline" onClick={onCancel} className="h-10 w-10 p-0 rounded-lg" aria-label="취소"><X size={16} /></Button>
        </div>
      ) : (
        <button
          onClick={onEdit}
          disabled={disabled}
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
            <li>마진율 / 평당가 / 최종가 직접 입력 (기본 마진율로 돌아감)</li>
            <li>견적 상세에서 직접 추가/삭제한 라인</li>
          </ul>
          <p className="text-[11px] text-muted-foreground">
            입력 폼의 &apos;기타 비용&apos;은 유지됩니다 (2026-09-28 이전 견적은 다시 입력 필요).
            견적 번호와 발송 기록은 유지되고, 단가·회사 정보·고객 정보·발행일은 지금 기준으로 다시 저장됩니다 (재발행).
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
                placeholder="예: 계약금 10% / 잔금 90%"
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

const ADD_CATEGORIES: { value: string; label: string }[] = [
  { value: "material", label: "자재" },
  { value: "labor", label: "인건" },
  { value: "equipment", label: "장비" },
  { value: "other", label: "기타" },
];

/** 견적 상세에서 항목 직접 추가 — 이름·수량·단위·단가·분류. */
function AddLineForm({
  busy, onCancel, onAdd,
}: {
  busy: boolean;
  onCancel: () => void;
  onAdd: (item: { name: string; quantity: number; unit: string; unitPrice: number; category: string }) => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("식");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("other");

  function submit() {
    const quantity = Number(qty.replace(/,/g, ""));
    const unitPrice = Number(price.replace(/,/g, ""));
    if (!name.trim()) { toast.error("항목 이름을 입력해 주세요"); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { toast.error("수량을 확인해 주세요"); return; }
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || price.trim() === "") { toast.error("단가를 입력해 주세요"); return; }
    onAdd({ name: name.trim(), quantity, unit: unit.trim() || "식", unitPrice: Math.round(unitPrice), category });
  }

  return (
    <div className="bg-card rounded-2xl border border-primary/30 p-4 space-y-2.5">
      <p className="text-sm font-semibold text-foreground">항목 직접 추가</p>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="항목 이름 (예: 추가 철거)" className="h-11 rounded-xl" />
      <div className="grid grid-cols-3 gap-2">
        <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="수량" className="h-11 rounded-xl text-right tabular-nums" />
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="단위" className="h-11 rounded-xl" />
        <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="단가(원)" className="h-11 rounded-xl text-right tabular-nums" />
      </div>
      <div className="flex gap-1.5">
        {ADD_CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            className={`flex-1 h-10 rounded-xl text-xs font-semibold border pressable ${category === c.value ? "bg-primary/10 text-primary border-primary/40" : "bg-card text-muted-foreground border-border/60"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onCancel} className="flex-1 h-11 rounded-xl text-sm">취소</Button>
        <Button onClick={submit} disabled={busy} className="flex-1 h-11 rounded-xl text-sm font-semibold">추가</Button>
      </div>
    </div>
  );
}
