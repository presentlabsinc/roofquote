"use client";
import { memo, useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/number-stepper";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import {
  type CatalogCategory,
  type CatalogGroup,
  type CatalogItem,
  type CatalogSelection,
  type CategoryMode,
  type GroupModesMap,
  type SimpleType,
  CATALOG_CATEGORIES,
  CATALOG_GROUPS,
  DEFAULT_CATALOG,
  SIMPLE_TYPE_LABELS,
  groupCatalog,
  resolveGroupDefaults,
} from "@/lib/catalog";

interface Props {
  selections: CatalogSelection[];
  onChange: (sel: CatalogSelection[]) => void;
  modes: GroupModesMap;
  onModesChange: (m: GroupModesMap) => void;
  /** Construction area + gutter length used for live-cost preview in simple mode */
  areaM2?: number;
  gutterLengthM?: number;
  /** Rough material total used for the "percent" simple type live preview */
  materialTotalEstimate?: number;
  catalog?: CatalogItem[];
  defaults?: GroupModesMap;
  /** 그룹 표시 라벨 override (예: 스틸방수에서 gutter → "배수로 / 물받이 부속"). */
  categoryLabels?: Partial<Record<CatalogGroup, string>>;
  /** 마감재 그룹 상단에 표시할 안내 — '마감 방식' 자동 계산과의 관계 (싱크 표시). */
  finishingAutoHint?: string;
}

// 8분류 라벨 — 상세 모드 안의 소제목으로만 사용 (카드는 3그룹).
const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATALOG_CATEGORIES.map((c) => [c.value, c.label]),
);

/**
 * Catalog picker — 3 collapsible group cards (마감재(기성품·절곡) / 부자재 / 물받이 부속).
 * Header has an iOS-style toggle that switches between 심플 (OFF) ↔ 상세 (ON) modes.
 * 상세 모드 lists items grouped by the 8 천보 카탈로그 분류 as small subsection headers —
 * e.g. 마감재 상세에서 기성품 용마루와 절곡 항목을 한 화면에서 같이 담을 수 있다.
 * Simple mode includes live "예상 X원" preview.
 */
function CatalogPickerBase({
  selections, onChange, modes, onModesChange, catalog = DEFAULT_CATALOG, defaults,
  areaM2 = 0, gutterLengthM = 0, materialTotalEstimate = 0, categoryLabels,
  finishingAutoHint,
}: Props) {
  const grouped = useMemo(() => groupCatalog(catalog), [catalog]);
  const resolved = useMemo(() => resolveGroupDefaults({ ...defaults, ...modes }), [modes, defaults]);

  // Track open/expanded state per group so we can auto-open on mode→detailed
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  function toggleOpen(grp: CatalogGroup) {
    setOpenMap((o) => ({ ...o, [grp]: !o[grp] }));
  }

  function setMode(grp: CatalogGroup, patch: Partial<CategoryMode>) {
    onModesChange({ ...modes, [grp]: { ...resolved[grp], ...patch } });
    // Auto-expand the card when user flips to 상세 — they're going to want
    // to see the items. (Doesn't auto-collapse on flip to 심플.)
    if (patch.mode === "detailed") {
      setOpenMap((o) => ({ ...o, [grp]: true }));
    }
  }

  /** Compute the simple-mode cost preview for a group */
  function previewCostFor(grp: CatalogGroup): number {
    const m = resolved[grp];
    if (m.mode !== "simple") return 0;
    const v = m.simpleValue ?? 0;
    if (!v || v <= 0) return 0;
    const qty = (m.simpleQty && m.simpleQty > 0) ? m.simpleQty
      : m.simpleType === "perSqm" ? areaM2
      : m.simpleType === "perM"   ? gutterLengthM
      : 0;
    switch (m.simpleType) {
      case "percent": return Math.round(materialTotalEstimate * v);
      case "perSqm":
      case "perM":    return Math.round(qty * v);
      case "total":   return Math.round(v);
      default:        return 0;
    }
  }

  function selectionForKey(key: string): CatalogSelection | undefined {
    return selections.find((s) => s.key === key);
  }

  function updateSelection(key: string, item: CatalogItem, patch: Partial<CatalogSelection>) {
    const existing = selectionForKey(key);
    if (existing) {
      onChange(selections.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    } else {
      onChange([
        ...selections,
        {
          category: item.category,
          key: item.key,
          label: item.label,
          unit: item.unit,
          quantity: 0,
          unitPrice: item.price,
          ...patch,
        },
      ]);
    }
  }

  function addCustom(category: CatalogCategory) {
    const key = `custom_${category}_${Date.now()}`;
    onChange([
      ...selections,
      { category, key, label: "", unit: "개", quantity: 1, unitPrice: 0 },
    ]);
  }

  function removeCustom(key: string) {
    onChange(selections.filter((s) => s.key !== key));
  }

  function updateCustom(key: string, patch: Partial<CategoryMode> & Partial<CatalogSelection>) {
    onChange(selections.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  return (
    <div className="space-y-2">
      {CATALOG_GROUPS.map((grp) => {
        const m = resolved[grp.value];
        const showSubheaders = grp.categories.length > 1;
        const customItems = selections.filter(
          (s) => grp.categories.includes(s.category) && s.key.startsWith("custom_"),
        );

        return (
          <CategoryCard
            key={grp.value}
            label={categoryLabels?.[grp.value] ?? grp.label}
            icon={grp.icon}
            enabled={m.enabled !== false}
            onToggleEnabled={() => setMode(grp.value, { enabled: m.enabled === false })}
            mode={m.mode}
            onToggleMode={() => setMode(grp.value, { mode: m.mode === "simple" ? "detailed" : "simple" })}
            open={!!openMap[grp.value]}
            onToggleOpen={() => toggleOpen(grp.value)}
            simpleCost={m.mode === "simple" ? previewCostFor(grp.value) : 0}
          >
            {grp.value === "finishing" && finishingAutoHint ? (
              <p className="text-[10px] text-muted-foreground mt-2 bg-muted/40 rounded-lg px-2.5 py-2">
                {finishingAutoHint}
              </p>
            ) : null}
            {m.mode === "simple" ? (
              <SimpleModeBlock
                mode={m}
                onChange={(patch) => setMode(grp.value, patch)}
                areaM2={areaM2}
                gutterLengthM={gutterLengthM}
                materialTotalEstimate={materialTotalEstimate}
              />
            ) : (
              <div className="space-y-1.5 mt-3">
                {grp.categories.map((cat) => {
                  const items = grouped[cat];
                  if (!items || items.length === 0) return null;
                  return (
                    <div key={cat} className="space-y-1.5">
                      {showSubheaders && (
                        <div className="text-[10px] font-semibold text-muted-foreground pt-1.5 first:pt-0">
                          {CATEGORY_LABELS[cat]}
                        </div>
                      )}
                      {items.map((item) => (
                        <CatalogRow
                          key={item.key}
                          item={item}
                          selection={selectionForKey(item.key)}
                          onUpdate={(patch) => updateSelection(item.key, item, patch)}
                        />
                      ))}
                    </div>
                  );
                })}
                {customItems.map((cs) => (
                  <CustomRow
                    key={cs.key}
                    selection={cs}
                    onUpdate={(patch) => updateCustom(cs.key, patch)}
                    onRemove={() => removeCustom(cs.key)}
                  />
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addCustom(grp.categories[0])}
                  className="w-full h-10 rounded-xl text-xs font-medium border-dashed border-primary/40 text-primary pressable mt-2"
                >
                  <Plus size={14} className="mr-1" /> 직접 추가
                </Button>
              </div>
            )}
          </CategoryCard>
        );
      })}
    </div>
  );
}

/**
 * memo — 부모(견적 폼)에서 무관한 입력(면적·작업일수 등) 칠 때마다 이 482줄 트리가
 * 통째로 재렌더링되던 걸 막음. props 가 다 안정적이면(setter 는 안정, defaults 는
 * 부모에서 useMemo) 관련 값(selections/modes/areaM2 등) 바뀔 때만 재렌더링.
 */
export const CatalogPicker = memo(CatalogPickerBase);

function CategoryCard({
  label, icon, enabled, onToggleEnabled, mode, onToggleMode, open, onToggleOpen, simpleCost, children,
}: {
  label: string;
  icon: string;
  enabled: boolean;
  onToggleEnabled: () => void;
  mode: "simple" | "detailed";
  onToggleMode: () => void;
  open: boolean;
  onToggleOpen: () => void;
  simpleCost: number;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-card rounded-2xl border overflow-hidden ${enabled ? "border-border/60" : "border-border/40 opacity-60"}`}>
      <div className="flex items-center gap-2 px-3 py-3">
        {/* 사용 여부 체크박스 */}
        <button type="button" onClick={onToggleEnabled} aria-label="사용 여부" className="shrink-0 pressable">
          <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
            enabled ? "bg-primary border-primary" : "bg-card border-border"
          }`}>
            {enabled && <span className="text-white text-xs leading-none">✓</span>}
          </span>
        </button>
        {/* 라벨 / 펼침 (사용 중일 때만 펼침, 아니면 클릭 시 켜짐) */}
        <button
          type="button"
          onClick={enabled ? onToggleOpen : onToggleEnabled}
          className="flex-1 flex items-center gap-2 pressable text-left min-w-0"
        >
          <span className="text-xl">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold ${enabled ? "text-foreground" : "text-muted-foreground"}`}>{label}</div>
            {enabled && mode === "simple" && simpleCost > 0 && !open ? (
              <div className="text-[11px] font-semibold text-primary tabular-nums">
                예상 {simpleCost.toLocaleString("ko-KR")}원
              </div>
            ) : null}
          </div>
          {enabled && (open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />)}
        </button>
        {/* 심플/상세 토글 — 사용 중일 때만 */}
        {enabled && (
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[11px] font-semibold tabular-nums w-7 text-right ${
              mode === "detailed" ? "text-primary" : "text-muted-foreground"
            }`}>
              {mode === "detailed" ? "상세" : "심플"}
            </span>
            <ModeToggleSwitch detailed={mode === "detailed"} onChange={onToggleMode} />
          </div>
        )}
      </div>
      {enabled && open && (
        <div className="px-3 pb-3 pt-1 border-t border-border/40">{children}</div>
      )}
    </div>
  );
}

/**
 * iOS-style switch for mode. OFF (left) = 심플; ON (right) = 상세.
 * The OFF state is muted but still visually clear that something is configured.
 */
function ModeToggleSwitch({ detailed, onChange }: { detailed: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={detailed}
      onClick={onChange}
      className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors pressable shrink-0 ${
        detailed ? "bg-primary justify-end" : "bg-muted-foreground/30 justify-start"
      }`}
    >
      <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

function SimpleModeBlock({
  mode, onChange, areaM2, gutterLengthM, materialTotalEstimate,
}: {
  mode: CategoryMode;
  onChange: (patch: Partial<CategoryMode>) => void;
  areaM2: number;
  gutterLengthM: number;
  materialTotalEstimate: number;
}) {
  const simpleType = mode.simpleType ?? "total";
  const simpleValue = mode.simpleValue ?? 0;
  const displayValue = simpleType === "percent"
    ? Math.round(simpleValue * 1000) / 10
    : simpleValue;

  // Effective quantity: user-entered simpleQty wins, else fall back to area/gutter
  const fallbackQty = simpleType === "perSqm" ? areaM2
    : simpleType === "perM" ? gutterLengthM
    : 0;
  const qty = (mode.simpleQty && mode.simpleQty > 0) ? mode.simpleQty : fallbackQty;

  const previewCost = (() => {
    if (!simpleValue || simpleValue <= 0) return 0;
    switch (simpleType) {
      case "percent": return Math.round(materialTotalEstimate * simpleValue);
      case "perSqm":
      case "perM":    return Math.round(qty * simpleValue);
      case "total":   return Math.round(simpleValue);
      default:        return 0;
    }
  })();

  const showQtyInput = simpleType === "perSqm" || simpleType === "perM";
  const qtyUnit = simpleType === "perSqm" ? "㎡" : "m";
  const qtyLabel = simpleType === "perSqm" ? "면적" : "길이";
  const fallbackHint = simpleType === "perSqm"
    ? (areaM2 > 0 ? `(비워두면 시공면적 ${areaM2}㎡ 사용)` : "(시공면적 입력 후 자동 사용)")
    : (gutterLengthM > 0 ? `(비워두면 물받이 길이 ${gutterLengthM}m 사용)` : "(물받이 길이 입력 후 자동 사용)");

  return (
    <div className="space-y-2 mt-2">
      <p className="text-[11px] text-muted-foreground">계산 방식 + 값 입력 → 비용 자동 계산</p>
      <div className="grid grid-cols-3 gap-1">
        {/* perSqm intentionally hidden — too hard for most users to use
            correctly. Calculation logic still supports it for existing data. */}
        {(["percent", "perM", "total"] as SimpleType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange({ simpleType: t })}
            className={`pressable rounded-lg py-2 text-[10px] font-semibold border ${
              simpleType === t
                ? "bg-primary/10 text-primary border-primary/40"
                : "bg-card text-muted-foreground border-border/60"
            }`}
          >
            {SIMPLE_TYPE_LABELS[t].label}
          </button>
        ))}
      </div>

      {/* Price / % / Total input */}
      <div>
        <label className="text-[10px] text-muted-foreground mb-1 block">
          {simpleType === "percent" ? "자재비 비율" : simpleType === "total" ? "총금액" : "단가"}
        </label>
        <div className="relative">
          <Input
            type="number"
            inputMode="decimal"
            value={displayValue || ""}
            onChange={(e) => {
              const raw = parseFloat(e.target.value) || 0;
              onChange({ simpleValue: simpleType === "percent" ? raw / 100 : raw });
            }}
            placeholder="0"
            className="h-12 text-right text-lg font-bold pr-16 rounded-xl tabular-nums"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">
            {SIMPLE_TYPE_LABELS[simpleType].suffix}
          </span>
        </div>
      </div>

      {/* Quantity input for perSqm / perM */}
      {showQtyInput ? (
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">
            {qtyLabel} <span className="text-muted-foreground/70">{fallbackHint}</span>
          </label>
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              value={mode.simpleQty ?? ""}
              onChange={(e) => {
                const raw = parseFloat(e.target.value);
                onChange({ simpleQty: Number.isFinite(raw) ? raw : undefined });
              }}
              placeholder={fallbackQty > 0 ? String(fallbackQty) : "0"}
              className="h-11 text-right text-base font-semibold pr-10 rounded-xl tabular-nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">
              {qtyUnit}
            </span>
          </div>
        </div>
      ) : null}

      {/* Live preview */}
      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
        <span className="text-muted-foreground">예상 비용</span>
        <span className="font-bold text-primary tabular-nums text-sm">
          {previewCost > 0 ? `${previewCost.toLocaleString("ko-KR")}원` : "—"}
        </span>
      </div>
    </div>
  );
}

function CatalogRow({
  item, selection, onUpdate,
}: {
  item: CatalogItem;
  selection: CatalogSelection | undefined;
  onUpdate: (patch: Partial<CatalogSelection>) => void;
}) {
  const quantity = selection?.quantity ?? 0;
  const unitPrice = selection?.unitPrice ?? item.price;
  const isActive = quantity > 0;
  // 길이성 자재(개=3m 등)면 m당 환산 표시 — "인간이 규격으로 입력, 환산은 앱이".
  const perM = item.lengthMm && item.lengthMm > 0 ? Math.round(unitPrice / (item.lengthMm / 1000)) : 0;

  return (
    <div className={`rounded-xl p-2.5 ${isActive ? "bg-primary/5 border border-primary/20" : "bg-muted/30 border border-transparent"}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-foreground">{item.label}</span>
        <span className="text-[10px] text-muted-foreground">
          {item.lengthMm ? `${(item.lengthMm / 1000).toLocaleString("ko-KR")}m/${item.unit}` : `${item.unit}당`}
          {perM > 0 && <span className="text-primary font-semibold"> · m당 {perM.toLocaleString("ko-KR")}원</span>}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <NumberStepper
            value={String(quantity)}
            onChange={(v) => onUpdate({ quantity: parseFloat(v) || 0 })}
            min={0}
            max={9999}
            step={item.unit === "m" ? 0.5 : 1}
            unit={item.unit}
          />
        </div>
        <span className="text-xs text-muted-foreground">×</span>
        <div className="relative w-24 shrink-0">
          <Input
            type="number" inputMode="numeric"
            value={unitPrice}
            onChange={(e) => onUpdate({ unitPrice: parseInt(e.target.value) || 0 })}
            className="h-12 pr-7 text-right text-sm tabular-nums rounded-2xl"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">원</span>
        </div>
      </div>
      {isActive ? (
        <div className="text-right text-[11px] font-semibold text-primary tabular-nums mt-1.5">
          = {(quantity * unitPrice).toLocaleString("ko-KR")}원
        </div>
      ) : null}
    </div>
  );
}

function CustomRow({
  selection, onUpdate, onRemove,
}: {
  selection: CatalogSelection;
  onUpdate: (patch: Partial<CatalogSelection>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-amber-50/60 rounded-xl p-2.5 border border-amber-200/50 space-y-2">
      <div className="flex items-start gap-2">
        <Input
          value={selection.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="항목명"
          className="h-10 rounded-xl text-sm flex-1 bg-card"
        />
        <button
          type="button"
          onClick={onRemove}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-card pressable shrink-0"
          aria-label="삭제"
        >
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-16 shrink-0">
          <Input
            value={selection.unit}
            onChange={(e) => onUpdate({ unit: e.target.value })}
            className="h-10 text-center text-sm rounded-xl bg-card"
            placeholder="단위"
          />
        </div>
        <div className="flex-1">
          <NumberStepper
            value={String(selection.quantity)}
            onChange={(v) => onUpdate({ quantity: parseFloat(v) || 0 })}
            min={0} max={9999} step={1}
            unit={selection.unit}
          />
        </div>
        <span className="text-xs text-muted-foreground">×</span>
        <div className="relative w-24 shrink-0">
          <Input
            type="number" inputMode="numeric"
            value={selection.unitPrice}
            onChange={(e) => onUpdate({ unitPrice: parseInt(e.target.value) || 0 })}
            className="h-12 pr-7 text-right text-sm tabular-nums rounded-2xl bg-card"
            placeholder="단가"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">원</span>
        </div>
      </div>
      <div className="text-right text-[11px] font-semibold text-primary tabular-nums">
        = {(selection.quantity * selection.unitPrice).toLocaleString("ko-KR")}원
      </div>
    </div>
  );
}

