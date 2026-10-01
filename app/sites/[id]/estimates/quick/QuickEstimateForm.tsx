"use client";
/**
 * 번개 견적 폼 — 공사 유형 · 시공면적 · 평당가(부가세 별도) 세 가지만 받는다 (lib/quick-estimate.ts).
 * 나머지는 설정 기본값으로 서버가 일반 견적과 같은 방식으로 만든다. 미리보기 숫자는 서버와 같은 계산.
 * 마지막에 쓴 평당가는 공사 유형별로 이 폰에 기억한다 (localStorage — 없거나 막혀 있어도 폼은 그대로 동작).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Coins, Ruler, Zap } from "lucide-react";
import type { PricingSettings } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { BufferedNumberInput } from "@/components/ui/buffered-number-input";
import { StickySubmit } from "@/app/sites/new/NewSiteForm";
import { pyeongToSqm, sqmToPyeong } from "@/lib/calculations";
import { previewQuickEstimate, quickErrorMessage, QUICK_NETWORK_ERROR } from "@/lib/quick-estimate";
import { CONSTRUCTION_TYPES, type ConstructionType } from "@/lib/types";

interface Props {
  siteId: string;
  userId: string;
  settings: PricingSettings;
}

// ─── 마지막 평당가 (공사 유형별, 이 폰에만) ────────────────────────────────
function lastPriceKey(userId: string): string {
  return `roofquote:quick-pyeong:v1:${userId}`;
}

function readLastPrices(userId: string): Partial<Record<ConstructionType, number>> {
  try {
    const raw = window.localStorage.getItem(lastPriceKey(userId));
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<Record<ConstructionType, number>>) : {};
  } catch {
    return {};
  }
}

function readLastPrice(userId: string, t: ConstructionType): number | null {
  const n = readLastPrices(userId)[t];
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

function saveLastPrice(userId: string, t: ConstructionType, price: number) {
  try {
    window.localStorage.setItem(lastPriceKey(userId), JSON.stringify({ ...readLastPrices(userId), [t]: price }));
  } catch {
    /* 저장 못 해도 견적은 이미 만들어짐 */
  }
}

function fmt(n: number) { return n.toLocaleString("ko-KR"); }

export function QuickEstimateForm({ siteId, userId, settings }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [constructionType, setConstructionType] = useState<ConstructionType | null>(null);
  const [sqmInput, setSqmInput] = useState("");
  const [pyeongInput, setPyeongInput] = useState("");
  const [pyeongPrice, setPyeongPrice] = useState<number | null>(null);
  // 평당가를 직접 친 뒤엔 유형을 바꿔도 기억한 값으로 덮지 않는다.
  const [priceTouched, setPriceTouched] = useState(false);

  const areaM2 = parseFloat(sqmInput) || 0;
  const price = pyeongPrice !== null && pyeongPrice > 0 ? pyeongPrice : null;

  // 미리보기는 서버와 같은 계산·같은 검증 — 서버가 거절할 입력이면 같은 문구를 미리 보여 주고 제출을 막는다.
  const result = useMemo(
    () => (constructionType && areaM2 > 0 ? previewQuickEstimate(settings, constructionType, areaM2, price) : null),
    [settings, constructionType, areaM2, price],
  );
  const preview = result?.ok ? result : null;
  const problem = result && !result.ok ? result : null;
  const ready = constructionType !== null && areaM2 > 0 && price !== null && !problem;

  function pickType(t: ConstructionType) {
    if (t === constructionType) return;
    setConstructionType(t);
    if (!priceTouched) setPyeongPrice(readLastPrice(userId, t));
  }

  // 평 ↔ ㎡ 자동 변환 — 견적 폼과 같은 규칙 (소수 2자리).
  function handleSqmChange(val: string) {
    setSqmInput(val);
    const n = parseFloat(val);
    setPyeongInput(Number.isFinite(n) && n > 0 ? String(sqmToPyeong(n)) : "");
  }
  function handlePyeongChange(val: string) {
    setPyeongInput(val);
    const n = parseFloat(val);
    setSqmInput(Number.isFinite(n) && n > 0 ? String(pyeongToSqm(n)) : "");
  }

  async function handleCreate() {
    if (!constructionType) { toast.error("공사 유형을 선택해 주세요"); return; }
    if (areaM2 <= 0) { toast.error("시공 면적을 입력해 주세요"); return; }
    if (price === null) { toast.error("평당가를 입력해 주세요"); return; }
    if (problem) { toast.error(problem.error); return; }
    setSaving(true);
    let res: Response;
    try {
      res = await fetch(`/api/sites/${siteId}/estimates/quick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constructionType, areaM2, pyeongPrice: price }),
      });
    } catch {
      // 오프라인·연결 끊김 — 브라우저의 영문 오류("Failed to fetch") 대신.
      toast.error(QUICK_NETWORK_ERROR);
      setSaving(false);
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const message = quickErrorMessage(res.status, err?.error);
      if (res.status === 401) {
        // 세션 만료 (현장에서 폰을 오래 둔 경우 등) — 로그인 후 이 화면으로 돌아오게.
        const next = `/sites/${siteId}/estimates/quick`;
        toast.error(message, {
          action: { label: "로그인", onClick: () => router.push(`/login?next=${encodeURIComponent(next)}`) },
        });
      } else {
        toast.error(message);
      }
      setSaving(false);
      return;
    }
    const est = (await res.json().catch(() => null)) as { id?: unknown } | null;
    saveLastPrice(userId, constructionType, price);
    toast.success("번개 견적을 만들었습니다");
    // 성공 시 saving 을 풀지 않는다 — 화면 전환 전 재클릭으로 견적이 중복 생성되지 않게.
    router.push(typeof est?.id === "string" ? `/sites/${siteId}/estimates/${est.id}` : `/sites/${siteId}`);
    router.refresh();
  }

  const pricing = preview?.pricing ?? null;
  const isLoss = !!pricing && pricing.marginAmount < 0;
  const marginRatePct = pricing ? Math.round(pricing.marginRate * 1000) / 10 : 0;
  const vatLabel = settings.vatIncludedByDefault ? "부가세 포함" : "부가세 별도";

  return (
    <>
      <div className="space-y-3 pb-32">
        <Section icon={<Building2 size={18} />} title="공사 유형">
          <div className="grid grid-cols-3 gap-2">
            {CONSTRUCTION_TYPES.map((t) => {
              const active = constructionType === t.value;
              const [main, sub] = t.label.split(" (");
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => pickType(t.value)}
                  aria-pressed={active}
                  className={`pressable min-h-[76px] rounded-2xl border-2 px-1.5 py-2.5 flex flex-col items-center justify-center gap-0.5 ${
                    active ? "border-primary bg-primary/5" : "border-border/60 bg-card"
                  }`}
                >
                  <span className="text-xl leading-none">{t.icon}</span>
                  <span className={`text-sm font-semibold leading-tight ${active ? "text-primary" : "text-foreground"}`}>{main}</span>
                  {sub && <span className="text-[10px] text-muted-foreground leading-tight">({sub}</span>}
                </button>
              );
            })}
          </div>
        </Section>

        <Section icon={<Ruler size={18} />} title="시공 면적">
          <div className="grid grid-cols-2 gap-2.5">
            <UnitInput unit="평" value={pyeongInput} onChange={handlePyeongChange} ariaLabel="시공 면적 (평)" />
            <UnitInput unit="㎡" value={sqmInput} onChange={handleSqmChange} ariaLabel="시공 면적 (㎡)" />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">평 또는 ㎡ 어디든 입력하면 자동 변환</p>
        </Section>

        <Section icon={<Coins size={18} />} title="평당가">
          <div className="relative">
            <BufferedNumberInput
              value={pyeongPrice}
              integer
              min={0}
              emptyValue="unset"
              onValueChange={(n) => { setPyeongPrice(n ?? null); setPriceTouched(true); }}
              placeholder="0"
              aria-label="평당가 (원, 부가세 별도)"
              className="h-14 text-xl font-bold text-center pl-12 pr-12 rounded-2xl tabular-nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">원/평</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            부가세 별도 · 평당가 × 평수 = 공급가 · 마지막에 쓴 값을 공사 유형별로 기억
          </p>
        </Section>

        {problem && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-3 py-2.5 flex items-start gap-2" role="alert">
            <span className="text-base leading-5">⚠️</span>
            <div className="text-xs text-red-700 leading-snug flex-1 min-w-0">
              <p>{problem.error}</p>
              {problem.suggestFullForm && (
                <Link
                  href={`/sites/${siteId}/estimates/new`}
                  className="pressable inline-flex items-center min-h-[44px] font-semibold underline underline-offset-2"
                >
                  일반 견적으로 만들기 →
                </Link>
              )}
            </div>
          </div>
        )}

        {preview && (
          <div className="bg-card rounded-2xl border border-border/60 p-4" aria-live="polite">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={18} className="text-primary" />
              <h2 className="font-semibold text-foreground text-sm flex-1">미리보기</h2>
              <span className="text-[11px] text-muted-foreground tabular-nums">{preview.pyeong}평 · 원가 항목 {preview.lineCount}개</span>
            </div>

            {isLoss && pricing && (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-3 py-2 mb-3 flex items-center gap-2">
                <span className="text-base">⚠️</span>
                <div className="text-xs text-red-700 leading-tight">
                  <div className="font-bold">손해 견적입니다</div>
                  <div className="tabular-nums">매출 대비 {fmt(pricing.marginAmount)}원 ({marginRatePct}%)</div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Row
                label="예상 원가"
                value={`${fmt(preview.totalCost)}원`}
                note={preview.pyeong > 0 ? `평당 ${fmt(Math.round(preview.totalCost / preview.pyeong))}원` : undefined}
              />
              {pricing ? (
                <>
                  <Row label={isLoss ? `손해 (${marginRatePct}%)` : `마진 (${marginRatePct}%)`} value={`${fmt(pricing.marginAmount)}원`} danger={isLoss} />
                  <Row
                    label="공급가"
                    value={`${fmt(pricing.supplyPrice)}원`}
                    note={price !== null ? `${fmt(price)}원 × ${preview.pyeong}평` : undefined}
                  />
                  {preview.vatIncluded && <Row label="부가세 (10%)" value={`${fmt(pricing.vat)}원`} />}
                  <div className="flex justify-between items-center pt-2 mt-1 border-t border-border/40">
                    <span className="text-sm font-semibold text-foreground">
                      최종 금액 <span className="text-[11px] font-medium text-muted-foreground ml-0.5">({vatLabel})</span>
                    </span>
                    <span className="text-base font-bold text-primary tabular-nums">{fmt(pricing.finalPrice)}원</span>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground pt-1">평당가를 넣으면 공급가·마진·최종 금액을 계산합니다</p>
              )}
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground px-1 leading-relaxed">
          자재·공사 범위·인원 등 나머지는 설정 기본값으로 자동 계산합니다. 만든 뒤 견적 상세의 &apos;입력값 수정&apos;에서 바꿀 수 있어요.
        </p>
      </div>

      <StickySubmit
        onClick={handleCreate}
        disabled={saving || !ready}
        label={saving ? "만드는 중..." : "번개 견적 만들기"}
      />
    </>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-primary">{icon}</span>
        <h2 className="font-semibold text-foreground text-sm">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function UnitInput({ unit, value, onChange, ariaLabel }: { unit: string; value: string; onChange: (v: string) => void; ariaLabel: string }) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        aria-label={ariaLabel}
        className="h-14 text-xl font-bold text-center pr-10 rounded-2xl tabular-nums"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">{unit}</span>
    </div>
  );
}

function Row({ label, value, note, danger }: { label: string; value: string; note?: string; danger?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-3 text-sm">
      <span className={danger ? "text-red-600 font-semibold" : "text-muted-foreground"}>
        {label}
        {note && <span className="block text-[10px] font-normal text-muted-foreground tabular-nums">{note}</span>}
      </span>
      <span className={`tabular-nums shrink-0 ${danger ? "text-red-600 font-semibold" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
