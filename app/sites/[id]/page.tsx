import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MapPin, Phone, FileText, Plus, ChevronRight } from "lucide-react";
import type { PhotoItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    include: { estimates: { orderBy: { createdAt: "desc" } } },
  });
  if (!site) notFound();

  const photos: PhotoItem[] = JSON.parse(site.photos as string);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
      {/* Back */}
      <Link href="/" className="text-sm text-blue-600 mb-4 block">← 목록으로</Link>

      {/* Site header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
        <h1 className="text-xl font-bold text-gray-900">{site.customerName}</h1>
        <div className="flex items-center gap-1 mt-2 text-sm text-gray-500">
          <MapPin size={14} />
          <span>{site.siteAddress}</span>
        </div>
        {site.customerPhone && (
          <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
            <Phone size={14} />
            <a href={`tel:${site.customerPhone}`} className="text-blue-600">{site.customerPhone}</a>
          </div>
        )}
        {site.generalMemo && (
          <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{site.generalMemo}</p>
        )}
      </div>

      {/* Photos */}
      {photos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
          <h2 className="font-semibold text-gray-800 mb-3">현장 사진 ({photos.length}장)</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {photos.map((p, i) => (
              <div key={i} className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.memo ?? ""} className="w-24 h-24 object-cover rounded-xl" />
                {p.memo && <p className="text-xs text-gray-500 mt-1 w-24 truncate">{p.memo}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estimates */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800">견적 목록</h2>
          <Link href={`/sites/${id}/estimates/new`}
            className="flex items-center gap-1 text-sm text-blue-600 font-medium">
            <Plus size={16} />새 견적
          </Link>
        </div>

        {site.estimates.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
            <FileText size={36} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-400 mb-4">견적이 없습니다</p>
            <Link href={`/sites/${id}/estimates/new`}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl">
              <Plus size={16} />견적 만들기
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {site.estimates.map((est) => (
              <Link key={est.id} href={`/sites/${id}/estimates/${est.id}`}
                className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-blue-200 transition-colors">
                <div>
                  <p className="font-semibold text-gray-900">
                    {est.finalPrice.toLocaleString("ko-KR")}원
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(est.createdAt).toLocaleDateString("ko-KR")} · 마진 {Math.round(est.marginRate * 100)}% · {est.areaM2}㎡
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {est.pdfSentAt && (
                    <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full">발송완료</span>
                  )}
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
