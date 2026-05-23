"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileText, Share2 } from "lucide-react";

interface Props {
  estimateId: string;
  customerName: string;
  summaryText: string;
}

export function PreviewActions({ estimateId, customerName, summaryText }: Props) {
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
      const res = await fetch(`/api/estimates/${estimateId}/pdf?download=1`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `견적서-${customerName}.pdf`;
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

  return (
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
  );
}
