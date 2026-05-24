"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileText, Share2 } from "lucide-react";

interface Props {
  estimateId: string;
  siteId: string;
  customerName: string;
  summaryText: string;
  detailLevel: "simple" | "detailed";
}

export function PreviewActions({ estimateId, siteId, customerName, summaryText, detailLevel }: Props) {
  const [loading, setLoading] = useState<"save" | "share" | null>(null);

  async function markSent() {
    await fetch(`/api/estimates/${estimateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfSentAt: new Date().toISOString() }),
    });
  }

  async function handleDownload() {
    setLoading("save");
    try {
      const res = await fetch(`/api/estimates/${estimateId}/pdf?download=1&detail=${detailLevel}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `견적서-${customerName}-${detailLevel === "detailed" ? "상세" : "간단"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF가 저장되었습니다");
    } catch {
      toast.error("PDF 저장에 실패했습니다");
    } finally {
      setLoading(null);
    }
  }

  async function handleShare() {
    setLoading("share");
    try {
      if (typeof navigator.share !== "undefined") {
        await navigator.share({ title: "지붕공사 견적서", text: summaryText });
        await markSent();
        toast.success("공유되었습니다");
      } else {
        await navigator.clipboard.writeText(summaryText);
        toast.success("카톡 요약문이 복사되었습니다");
      }
    } catch {
      /* user cancelled — silent */
    } finally {
      setLoading(null);
    }
  }

  const base = `/sites/${siteId}/estimates/${estimateId}/preview`;

  return (
    <>
      {/* Detail level toggle — switches PDF source */}
      <div className="bg-card rounded-2xl border border-border/60 p-1 mb-3 grid grid-cols-2 gap-1">
        <Link
          href={`${base}?detail=simple`}
          replace
          className={`h-10 rounded-xl text-xs font-semibold flex items-center justify-center pressable ${
            detailLevel === "simple"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
        >
          간단 내역
        </Link>
        <Link
          href={`${base}?detail=detailed`}
          replace
          className={`h-10 rounded-xl text-xs font-semibold flex items-center justify-center pressable ${
            detailLevel === "detailed"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
        >
          상세 내역
        </Link>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 safe-x bg-gradient-to-t from-background via-background/95 to-transparent pt-6 pb-4">
        <div className="max-w-lg mx-auto px-4 safe-bottom flex gap-2.5">
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={loading !== null}
            className="flex-1 h-14 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 pressable bg-card"
          >
            <FileText size={18} />
            {loading === "save" ? "저장 중..." : "PDF 저장"}
          </Button>
          <Button
            onClick={handleShare}
            disabled={loading !== null}
            className="flex-1 h-14 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 pressable"
          >
            <Share2 size={18} />
            {loading === "share" ? "공유 중..." : "카톡 보내기"}
          </Button>
        </div>
      </div>
    </>
  );
}
