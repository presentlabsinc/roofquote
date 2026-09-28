"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 현장 삭제 — 견적·사진까지 함께 지운다 (2026-09-28 추가).
 * 이전엔 삭제 UI 가 없었고, 견적이 있는 현장은 DB 제약(RESTRICT) 때문에 API 도 실패했다.
 * 발송한 견적까지 사라지므로 개수를 보여 주고 두 단계로 확인한다.
 */
export function DeleteSiteButton({ siteId, estimateCount, sentCount }: { siteId: string; estimateCount: number; sentCount: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function doDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/sites/${siteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("현장을 삭제했습니다");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("삭제에 실패했습니다");
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-destructive/20 p-4">
      {confirming ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-destructive text-center">
            이 현장을 삭제할까요? 되돌릴 수 없습니다.
          </p>
          {(estimateCount > 0) && (
            <p className="text-[11px] text-muted-foreground text-center">
              견적 {estimateCount}건{sentCount > 0 ? ` (발송한 견적 ${sentCount}건 포함)` : ""}과 현장 사진도 함께 삭제됩니다.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={deleting} className="flex-1 h-11 rounded-xl text-sm">
              취소
            </Button>
            <Button
              onClick={doDelete}
              disabled={deleting}
              className="flex-1 h-11 rounded-xl text-sm font-semibold bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "삭제 중..." : "예, 삭제"}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-destructive/80 py-2 pressable"
        >
          <Trash2 size={15} /> 현장 삭제
        </button>
      )}
    </div>
  );
}
