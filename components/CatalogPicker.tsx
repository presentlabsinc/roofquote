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
  CATALOG_CATEGORIES,
  DEFAULT_CATALOG,
  groupCatalog,
} from "@/lib/catalog";

interface Props {
  selections: CatalogSelection[];
  onChange: (sel: CatalogSelection[]) => void;
  /** Optional override of the catalog (e.g. from PricingSettings.catalog if we add an editor) */
  catalog?: CatalogItem[];
}

/**
 * Catalog picker — 4 collapsible category cards (마감재 / 물받이 부속 / 부자재 / 절곡).
 * Each card lists its items with quantity steppers + inline editable unit prices.
 * Items with quantity > 0 are included in `selections`.
 * "+ 직접 추가" lets the user add items not in the catalog.
 */
export function CatalogPicker({ selections, onChange, catalog = DEFAULT_CATALOG }: Props) {
  const grouped = useMemo(() => groupCatalog(catalog), [catalog]);

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

  function updateCustom(key: string, patch: Partial<CatalogSelection>) {
    onChange(selections.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  return (
    <div className="space-y-2">
      {CATALOG_CATEGORIES.map((cat) => {
        const items = grouped[cat.value];
        const customItems = selections.filter((s) => s.category === cat.value && s.key.startsWith("custom_"));
        const activeCount = selections.filter(
          (s) => s.category === cat.value && s.quantity > 0,
        ).length;

        return (
          <CategoryCard
            key={cat.value}
            label={cat.label}
            icon={cat.icon}
            activeCount={activeCount}
          >
            <div className="space-y-1.5">
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
          </CategoryCard>
        );
      })}
    </div>
  );
}

function CategoryCard({
  label, icon, activeCount, children,
}: {
  label: string; icon: string; activeCount: number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 pressable"
      >
        <span className="text-xl">{icon}</span>
        <span className="text-sm font-semibold text-foreground flex-1 text-left">{label}</span>
        {activeCount > 0 && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary tabular-nums">
            {activeCount}개 선택
          </span>
        )}
        {open ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-3 pb-3 pt-1 border-t border-border/40">{children}</div>}
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
