"use client";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightSlot?: React.ReactNode;
  /** When true the header is solid (used for plain pages); otherwise translucent with blur */
  solid?: boolean;
}

export function AppHeader({ title, subtitle, showBack = true, rightSlot, solid = false }: Props) {
  const router = useRouter();
  return (
    <header
      className={`sticky top-0 z-40 safe-top ${solid ? "bg-background" : "glass"} border-b border-border/60`}
    >
      <div className="max-w-lg mx-auto h-14 px-2 flex items-center gap-1">
        {showBack ? (
          <button
            onClick={() => router.back()}
            aria-label="뒤로"
            className="w-10 h-10 -ml-1 flex items-center justify-center rounded-full text-foreground active:bg-muted pressable"
          >
            <ChevronLeft size={26} strokeWidth={2.4} />
          </button>
        ) : (
          <div className="w-2" />
        )}
        <div className="flex-1 min-w-0 px-1">
          <h1 className="text-base font-semibold text-foreground truncate leading-tight">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground truncate leading-tight">{subtitle}</p>}
        </div>
        {rightSlot ? <div className="shrink-0 pr-1">{rightSlot}</div> : <div className="w-10" />}
      </div>
    </header>
  );
}

interface LargeProps {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

/** Large home-style title — no back button, no sticky behavior */
export function LargeTitle({ title, subtitle, rightSlot }: LargeProps) {
  return (
    <div className="px-5 pt-6 pb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
      </div>
      {rightSlot}
    </div>
  );
}
