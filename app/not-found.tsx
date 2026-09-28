import Link from "next/link";

/** 없는 현장·견적 (삭제됐거나 다른 계정 것) — 기본 영문 404 대신. */
export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <p className="text-4xl mb-3">🔍</p>
        <h1 className="text-lg font-bold text-foreground">찾을 수 없는 화면이에요</h1>
        <p className="text-sm text-muted-foreground mt-2">삭제된 현장·견적이거나 주소가 잘못됐어요.</p>
        <Link href="/" className="mt-6 h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center pressable">
          홈으로
        </Link>
      </div>
    </div>
  );
}
