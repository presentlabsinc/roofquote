"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Mail, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase";

/**
 * Login form — three sign-in paths:
 *   1. Kakao OAuth (popular Korean login — single tap)
 *   2. Google OAuth (familiar fallback)
 *   3. Email + password (covers everyone else, used by admin-issued accounts)
 *
 * "Next" query param is preserved so we land back where the user originally
 * tried to go after a successful sign-in (set by middleware).
 *
 * Signup is intentionally disabled — admin creates accounts in Supabase
 * dashboard during beta. Toggling that requires only enabling signUp() here.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"kakao" | "google" | "email" | null>(null);

  async function handleOAuth(provider: "kakao" | "google") {
    setBusy(provider);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // After provider redirects back, Supabase posts to /auth/callback?code=...
        // which exchanges the code for a session and then forwards to `next`.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setBusy(null);
      toast.error(`${provider === "kakao" ? "카카오" : "구글"} 로그인 실패: ${error.message}`);
    }
    // On success, browser is redirected away — no further work here.
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("이메일과 비밀번호를 입력해 주세요");
      return;
    }
    setBusy("email");
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(null);
    if (error) {
      toast.error(`로그인 실패: ${error.message}`);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {/* Kakao — most prominent because it's the dominant Korean choice */}
      <button
        type="button"
        onClick={() => handleOAuth("kakao")}
        disabled={busy !== null}
        className="w-full h-12 rounded-2xl bg-[#FEE500] text-[#3C1E1E] font-bold text-sm flex items-center justify-center gap-2 pressable disabled:opacity-50"
      >
        {busy === "kakao" ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <span className="text-base">💬</span>
        )}
        카카오로 시작하기
      </button>

      <button
        type="button"
        onClick={() => handleOAuth("google")}
        disabled={busy !== null}
        className="w-full h-12 rounded-2xl bg-white text-foreground font-semibold text-sm flex items-center justify-center gap-2 pressable border border-border disabled:opacity-50"
      >
        {busy === "google" ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
          </svg>
        )}
        구글로 시작하기
      </button>

      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[11px] text-muted-foreground">또는 이메일</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <form onSubmit={handleEmail} className="space-y-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          className="w-full h-12 rounded-2xl border border-border px-4 text-sm bg-card focus:outline-none focus:border-primary"
          disabled={busy !== null}
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="w-full h-12 rounded-2xl border border-border px-4 text-sm bg-card focus:outline-none focus:border-primary"
          disabled={busy !== null}
        />
        <button
          type="submit"
          disabled={busy !== null}
          className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 pressable disabled:opacity-50"
        >
          {busy === "email" ? <Loader2 size={18} className="animate-spin" /> : <Mail size={16} />}
          이메일로 로그인
        </button>
      </form>
    </div>
  );
}
