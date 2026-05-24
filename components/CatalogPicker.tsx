"use client";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/number-stepper";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import {
  type CatalogCategory,
  type CatalogItem,
  type CatalogSelection,
  type CategoryMode,
  type CategoryModesMap,
  type SimpleType,
  CATALOG_CATEGORIES,
  DEFAULT_CATALOG,
  DEFAULT_CATEGORY_MODES,
  SIMPLE_TYPE_LABELS,
  groupCatalog,
  resolveCategoryDefaults,
} from "@/lib/catalog";

interface Props {
  selections: CatalogSelection[];
  onChange: (sel: CatalogSelection[]) => void;
  modes: CategoryModesMap;
  onModesChange: (m: CategoryModesMap) => void;
  /** Construction area + gutter length used for live-cost preview in simple mode */
  areaM2?: number;
  gutterLengthM?: number;
  /** Rough material total used for the "percent" simple type live preview */
  materialTotalEstimate?: number;
  catalog?: CatalogItem[];
  defaults?: CategoryModesMap;
}

/**
 * Catalog picker — 4 collapsible category cards. Header has an iOS-style
 * on/off toggle (enable/disable the whole category). When enabled, the body
 * shows a small simple/detailed chip toggle + the mode-specific inputs.
 * Live "예상 비용" preview shows the calculated total based on current form
 * values (area, gutter length, material price).
 */
export function CatalogPicker({
  selections, onChange, modes, onModesChange, catalog = DEFAULT_CATALOG, defaults,
  areaM2 = 0, gutterLengthM = 0, materialTotalEstimate = 0,
}: Props) {
  const grouped = useMemo(() => groupCatalog(catalog), [catalog]);
  const resolved = useMemo(() => resolveCategoryDefaults({ ...defaults, ...modes }), [modes, defaults]);

  function setMode(cat: CatalogCategory, patch: Partial<CategoryMode>) {
    onModesChange({ ...modes, [cat]: { ...resolved[cat], ...patch } });
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
      {CATALOG_CATEGORIES.map((cat) => {
        const m = resolved[cat.value];
        const enabled = m.enabled !== false;
        const items = grouped[cat.value];
        const customItems = selections.filter((s) => s.category === cat.value && s.key.startsWith("custom_"));

        return (
          <CategoryCard
            key={cat.value}
            label={cat.label}
            icon={cat.icon}
            enabled={enabled}
            onToggleEnabled={() => setMode(cat.value, { enabled: !enabled })}
          >
            {enabled && (
              <>
                {/* Compact mode switch (much smaller than before) */}
                <ModeSwitch mode={m.mode} onChange={(mode) => setMode(cat.value, { mode })} />

                {m.mode === "simple" ? (
                  <SimpleModeBlock
                    mode={m}
                    onChange={(patch) => setMode(cat.value, patch)}
                    areaM2={areaM2}
                    gutterLengthM={gutterLengthM}
                    materialTotalEstimate={materialTotalEstimate}
                  />
                ) : (
                  <div className="space-y-1.5 mt-3">
                    {items.map((item) => (
                      <CatalogRow
                        key={item.key}
                        item={item}
                        selection={selectionForKey(item.key)}
                        onUpdate={(patch) => updateSelection(item.key, item, patch)}
                      />
                    ))}
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
                      onClick={() => addCustom(cat.value)}
                      className="w-full h-10 rounded-xl text-xs font-medium border-dashed border-primary/40 text-primary pressable mt-2"
                    >
                      <Plus size={14} className="mr-1" /> 직접 추가
                    </Button>
                  </div>
                )}
              </>
            )}
          </CategoryCard>
        );
      })}
    </div>
  );
}

function CategoryCard({
  label, icon, enabled, onToggleEnabled, children,
}: {
  label: string; icon: string; enabled: boolean;
  onToggleEnabled: () => void; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bg-card rounded-2xl border ${enabled ? "border-border/60" : "border-border/40 opacity-70"} overflow-hidden`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-3 pressable text-left"
        >
          <span className="text-xl">{icon}</span>
          <span className="text-sm font-semibold text-foreground flex-1">{label}</span>
          {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </button>
        <ToggleSwitch checked={enabled} onChange={onToggleEnabled} />
      </div>
      {open && enabled && (
        <div className="px-3 pb-3 pt-1 border-t border-border/40">{children}</div>
      )}
    </div>
  );
}

/** iOS-style on/off toggle switch */
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors pressable shrink-0 ${
        checked ? "bg-primary justify-end" : "bg-muted justify-start"
      }`}
    >
      <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

/** Compact 심플/상세 pill switch — much smaller than the previous 50/50 buttons */
function ModeSwitch({ mode, onChange }: { mode: "simple" | "detailed"; onChange: (m: "simple" | "detailed") => void }) {
  return (
    <div className="inline-flex bg-muted rounded-full p-0.5 mt-2 text-[11px]">
      <button
        type="button"
        onClick={() => onChange("simple")}
        className={`px-3 py-1 rounded-full font-semibold transition-colors pressable ${
          mode === "simple" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
        }`}
      >
        심플
      </button>
      <button
        type="button"
        onClick={() => onChange("detailed")}
        className={`px-3 py-1 rounded-full font-semibold transition-colors pressable ${
          mode === "detailed" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
        }`}
      >
        상세
      </button>
    </div>
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
  // For percent, the user enters whole numbers (e.g. 15) representing 15%.
  // Internally we store 0.15.
  const displayValue = simpleType === "percent"
    ? Math.round(simpleValue * 1000) / 10
    : simpleValue;

  // Live cost preview based on current form values
  const previewCost = (() => {
    if (!simpleValue || simpleValue <= 0) return 0;
    switch (simpleType) {
      case "percent": return Math.round(materialTotalEstimate * simpleValue);
      case "perSqm":  return Math.round(areaM2 * simpleValue);
      case "perM":    return Math.round(gutterLengthM * simpleValue);
      case "total":   return Math.round(simpleValue);
      default:        return 0;
    }
  })();

  const quantityLabel = (() => {
    switch (simpleType) {
      case "percent": return materialTotalEstimate > 0 ? `자재비 ${materialTotalEstimate.toLocaleString("ko-KR")}원 기준` : "자재비 입력 후 계산";
      case "perSqm":  return areaM2 > 0 ? `시공면적 ${areaM2}㎡` : "시공면적 입력 후 계산";
      case "perM":    return gutterLengthM > 0 ? `물받이 길이 ${gutterLengthM}m` : "물받이 길이 입력 후 계산";
      case "total":   return "총금액";
      default:        return "";
    }
  })();

  return (
    <div className="space-y-2 mt-2">
      <p className="text-[11px] text-muted-foreground">계산 방식 선택 + 값 입력하면 자동 계산됩니다</p>
      <div className="grid grid-cols-4 gap-1">
        {(["percent", "perSqm", "perM", "total"] as SimpleType[]).map((t) => (
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
      {/* Live preview row */}
      <div className="flex items-center justify-between text-[11px] pt-1">
        <span className="text-muted-foreground">{quantityLabel}</span>
        <span className="font-semibold text-primary tabular-nums">
          {previewCost > 0 ? `예상 ${previewCost.toLocaleString("ko-KR")}원` : ""}
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

  return (
    <div className={`rounded-xl p-2.5 ${isActive ? "bg-primary/5 border border-primary/20" : "bg-muted/30 border border-transparent"}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-foreground">{item.label}</span>
        <span className="text-[10px] text-muted-foreground">{item.unit}당</span>
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
      {isActive && (
        <div className="text-right text-[11px] font-semibold text-primary tabular-nums mt-1.5">
          = {(quantity * unitPrice).toLocaleString("ko-KR")}원
        </div>
      )}
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

// Suppress unused-export lint for DEFAULT_CATEGORY_MODES which is re-imported by other consumers
export const _keepDefaultsExportLive = DEFAULT_CATEGORY_MODES;
