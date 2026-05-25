import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserAndSettings } from "@/lib/auth";
import { MapPin, FileText, ChevronRight, Building2, Send } from "lucide-react";
import { LargeTitle } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { user, settings } = await requireUserAndSettings();
  const sites = await prisma.site.findMany({
    where: { userId: user.id },
    include: { estimates: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-lg mx-auto">
      <LargeTitle
        title="현장 목록"
        subtitle={settings.companyName || "지붕공사 견적"}
        rightSlot={
          <span className="text-sm font-semibold text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
            {sites.length}건
          </span>
        }
      />

      <div className="px-4 pb-4">
        {/* Onboarding banner — shown when companyName looks unfilled:
            - empty / null
            - still the placeholder seeded by getOrCreatePricingSettings
            - looks like an email (legacy seed before we switched to placeholder) */}
        {(!settings.companyName ||
          settings.companyName.includes("설정에서") ||
          settings.companyName.includes("@")) && (
          <Link
            href="/settings"
            className="block mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl pressable"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">⚙️</div>
              <div className="flex-1">
                <p className="font-semibold text-amber-900 text-sm">설정이 필요합니다</p>
                <p className="text-xs text-amber-700 mt-0.5">먼저 회사 정보와 기본 단가를 입력해 주세요</p>
              </div>
              <ChevronRight size={18} className="text-amber-600" />
            </div>
          </Link>
        )}

        {sites.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2.5">
            {sites.map((site) => {
              const est = site.estimates[0];
              return (
                <Link
                  key={site.id}
                  href={`/sites/${site.id}`}
                  className="block bg-card rounded-2xl border border-border/60 p-4 pressable"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-[15px] leading-tight">
                        {site.customerName}
                      </p>
                      <div className="flex items-start gap-1 mt-1.5 text-[13px] text-muted-foreground">
                        <MapPin size={13} className="mt-0.5 shrink-0" />
                        <span className="truncate">{site.siteAddress}</span>
                      </div>
                    </div>
                    {est ? (
                      <div className="text-right shrink-0">
                        <p className="text-[15px] font-bold text-primary tabular-nums leading-tight">
                          {(est.finalPrice / 10000).toFixed(0)}<span className="text-xs font-medium ml-0.5">만</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          마진 {Math.round(est.marginRate * 100)}%
                        </p>
                      </div>
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground px-2 py-1 bg-muted rounded-full shrink-0">
                        견적 없음
                      </span>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">
                      {new Date(site.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                    </span>
                    {est && (
                      <div className="flex items-center gap-1.5">
                        {est.pdfSentAt && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium">
                            <Send size={10} />발송완료
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          견적 {site.estimates.length}건
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 rounded-3xl bg-primary/10 mx-auto mb-5 flex items-center justify-center">
        <Building2 size={36} strokeWidth={1.8} className="text-primary" />
      </div>
      <p className="text-base font-semibold text-foreground">아직 등록된 현장이 없습니다</p>
      <p className="text-sm text-muted-foreground mt-1.5 mb-6">
        아래 <span className="inline-block w-5 h-5 align-middle rounded-full bg-primary text-white text-xs font-bold leading-5">＋</span> 버튼을 눌러<br />새 현장을 추가해 보세요
      </p>
      <FileText size={0} aria-hidden />
    </div>
  );
}
