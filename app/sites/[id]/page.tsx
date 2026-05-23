import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MapPin, Phone, FileText, Plus, ChevronRight, Send } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import type { PhotoItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    include: { estimates: { orderBy: { createdAt: "desc" } } },
  });
  if (!site) notFound();

  const photos = (site.photos as unknown as PhotoItem[]) ?? [];

  return (
    <>
      <AppHeader title={site.customerName} subtitle={site.siteAddress} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-3">
        {/* Customer card */}
        <div className="bg-card rounded-2xl border border-border/60 p-5">
          <p className="text-xl font-bold text-foreground">{site.customerName}</p>
          <div className="space-y-2 mt-3">
            <div className="flex items-start gap-2 text-sm">
              <MapPin size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-foreground">{site.siteAddress}</span>
            </div>
            {site.customerPhone && (
              <a href={`tel:${site.customerPhone}`}
                className="flex items-center gap-2 text-sm pressable rounded-lg -mx-1 px-1 py-0.5">
                <Phone size={15} className="text-primary" />
                <span className="text-primary font-semibold tabular-nums">{site.customerPhone}</span>
              </a>
            )}
          </div>
          {site.generalMemo && (
            <div className="mt-4 p-3 bg-muted/60 rounded-xl text-sm text-foreground leading-relaxed">
              {site.generalMemo}
            </div>
          )}
        </div>

        {/* Photos */}
        {photos.length > 0 && (
          <div className="bg-card rounded-2xl border border-border/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground text-sm">현장 사진</h2>
              <span className="text-xs text-muted-foreground">{photos.length}장</span>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
              {photos.map((p, i) => (
                <div key={i} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.memo ?? ""} className="w-24 h-24 object-cover rounded-xl border border-border/40" />
                  {p.memo && <p className="text-[11px] text-muted-foreground mt-1.5 w-24 truncate">{p.memo}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estimates header */}
        <div className="flex items-center justify-between px-1 pt-2">
          <h2 className="font-semibold text-foreground">견적 ({site.estimates.length})</h2>
          {site.estimates.length > 0 && (
            <Link href={`/sites/${id}/estimates/new`}
              className="flex items-center gap-1 text-sm font-semibold text-primary pressable">
              <Plus size={16} />새 견적
            </Link>
          )}
        </div>

        {site.estimates.length === 0 ? (
          <div className="bg-card rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl mx-auto mb-3 flex items-center justify-center">
              <FileText size={26} className="text-primary" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">아직 견적이 없습니다</p>
            <Link href={`/sites/${id}/estimates/new`}
              className="inline-flex items-center gap-2 px-5 h-11 bg-primary text-primary-foreground text-sm font-semibold rounded-2xl pressable">
              <Plus size={17} />견적 만들기
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {site.estimates.map((est) => (
              <Link key={est.id} href={`/sites/${id}/estimates/${est.id}`}
                className="flex items-center justify-between bg-card rounded-2xl border border-border/60 p-4 pressable">
                <div className="min-w-0">
                  <p className="font-bold text-foreground tabular-nums text-[15px]">
                    {est.finalPrice.toLocaleString("ko-KR")}<span className="text-xs ml-0.5 font-medium">원</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {new Date(est.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} · 마진 {Math.round(est.marginRate * 100)}% · {est.areaM2}㎡
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {est.pdfSentAt && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 bg-green-50 text-green-700 rounded-full">
                      <Send size={10} />발송
                    </span>
                  )}
                  <ChevronRight size={18} className="text-muted-foreground/60" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
