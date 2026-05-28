"use client";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label?: string;
  className?: string;
}

/**
 * Mobile-friendly numeric stepper — round − / + buttons flanking a typeable
 * number input. Pattern used by Airbnb, Booking.com, etc. The user can either
 * tap the buttons (small adjustments) or type directly (large jumps).
 */
export function NumberStepper({
  value, onChange, min = 0, max = 999, step = 1, unit, label, className,
}: Props) {
  const numeric = parseFloat(value);
  const current = Number.isFinite(numeric) ? numeric : 0;

  function bump(delta: number) {
    const next = Math.max(min, Math.min(max, current + delta));
    // Preserve a clean string — show "3" not "3.0", "0.5" not "0.50"
    const rounded = Math.round(next * 100) / 100;
    onChange(String(rounded));
  }

  const canDec = current > min;
  const canInc = current < max;

  return (
    <div className={className}>
      {label && (
        <label className="text-xs text-muted-foreground mb-1.5 block font-medium">{label}</label>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => bump(-step)}
          disabled={!canDec}
          aria-label="감소"
          className={cn(
            "shrink-0 w-11 h-11 rounded-full border-2 flex items-center justify-center pressable",
            canDec
              ? "border-border bg-card text-foreground active:bg-muted"
              : "border-border/40 bg-muted/40 text-muted-foreground/40"
          )}
        >
          <Minus size={18} strokeWidth={2.5} />
        </button>

        <div className="flex-1 relative">
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            // pr-8 pl-2 — 가운데 정렬 텍스트가 우측 단위 라벨과 겹치지 않게 좌우 공간 확보.
            // 좁은 모바일 (grid-cols-2 안 등) 에서 숫자/단위 시각적 겹침 방지.
            className={cn(
              "w-full h-12 text-center text-lg font-bold tabular-nums rounded-2xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
              unit ? "pl-2 pr-8" : "px-2"
            )}
          />
          {unit && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">
              {unit}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => bump(step)}
          disabled={!canInc}
          aria-label="증가"
          className={cn(
            "shrink-0 w-11 h-11 rounded-full border-2 flex items-center justify-center pressable",
            canInc
              ? "border-border bg-card text-foreground active:bg-muted"
              : "border-border/40 bg-muted/40 text-muted-foreground/40"
          )}
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
