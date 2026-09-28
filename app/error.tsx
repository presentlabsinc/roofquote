"use client"; // Error boundaries must be Client Components
import { useEffect } from "react";
import Link from "next/link";

/**
 * 화면 오류 경계 (2026-09-28) — 이전엔 오류가 나면 Next 기본 영문 화면에 갇혔다.
 * 현장에서 쓰는 앱이라 '다시 시도'와 '홈으로'만 크게. 상세는 콘솔(서버 로그)로.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[app error]", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <h1 className="text-lg font-bold text-foreground">화면을 불러오지 못했어요</h1>
        <p className="text-sm text-muted-foreground mt-2">
          잠시 후 다시 시도해 주세요. 계속되면 네트워크 연결을 확인해 주세요.
        </p>
        {error.digest && <p className="text-[11px] text-muted-foreground/70 mt-2 tabular-nums">오류 코드 {error.digest}</p>}
        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={() => retry()}
            className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold pressable"
          >
            다시 시도
          </button>
          <Link href="/" className="flex-1 h-12 rounded-2xl border border-border bg-card text-sm font-semibold flex items-center justify-center pressable">
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
