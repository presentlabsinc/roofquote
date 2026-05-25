import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* App logo + name */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground grid place-items-center text-2xl font-black mb-3">
              지
            </div>
            <h1 className="text-xl font-bold text-foreground">지붕견적</h1>
            <p className="text-xs text-muted-foreground mt-1">현장에서 바로 쓰는 지붕공사 견적</p>
          </div>

          <Suspense fallback={<div className="text-sm text-muted-foreground text-center">로딩중…</div>}>
            <LoginForm />
          </Suspense>

          <p className="text-[11px] text-muted-foreground text-center mt-6 leading-relaxed">
            가입은 관리자가 직접 만들어 드립니다.<br />
            카카오 ID 또는 회사 이메일을 알려주세요.
          </p>
        </div>
      </div>
    </div>
  );
}
