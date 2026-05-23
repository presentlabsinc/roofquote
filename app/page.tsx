import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MapPin, Phone, ChevronRight, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [sites, settings] = await Promise.all([
    prisma.site.findMany({
      include: { estimates: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pricingSettings.findFirst(),
  ]);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">현장 목록</h1>
          {settings?.companyName && (
            <p className="text-sm text-gray-500 mt-0.5">{settings.companyName}</p>
          )}
        </div>
        <span className="text-sm text-gray-400">{sites.length}건</span>
      </div>

      {!settings && (
        <Link href="/settings" className="block mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          ⚠️ 단가 설정이 없습니다. 먼저 단가를 설정해 주세요. →
        </Link>
      )}

      {sites.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FileText size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">현장이 없습니다</p>
          <p className="text-sm mt-1">아래 + 버튼을 눌러 새 현장을 추가해 보세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sites.map((site) => {
            const estimate = site.estimates[0];
            return (
              <Link key={site.id} href={`/sites/${site.id}`}
                className="block bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:border-blue-200 transition-colors active:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-base">{site.customerName}</p>
                    <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
                      <MapPin size={13} />
                      <span className="truncate">{site.siteAddress}</span>
                    </div>
                    {site.customerPhone && (
                      <div className="flex items-center gap-1 mt-0.5 text-sm text-gray-400">
                        <Phone size={13} />
                        <span>{site.customerPhone}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    {estimate && (
                      <div className="text-right">
                        <p className="text-base font-bold text-blue-600">
                          {estimate.finalPrice.toLocaleString("ko-KR")}원
                        </p>
                        <p className="text-xs text-gray-400">
                          마진 {Math.round(estimate.marginRate * 100)}%
                        </p>
                      </div>
                    )}
                    <ChevronRight size={18} className="text-gray-300" />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>{new Date(site.createdAt).toLocaleDateString("ko-KR")}</span>
                  {estimate ? (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">견적 {site.estimates.length}건</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full">견적 없음</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
