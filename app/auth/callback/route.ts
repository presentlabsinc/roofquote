import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { safeNextPath } from "@/lib/safe-redirect";

/**
 * OAuth + magic-link callback.
 *
 * Supabase redirects here with `?code=...` after the user authenticates with
 * Kakao / Google. We exchange the code for a session (which Supabase plants
 * into our cookies via the SSR client), then forward to the original `next`
 * URL.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Don't expose detail to the URL; just send back to /login with a flag.
      const fail = new URL("/login", url.origin);
      // 고정 코드만 넘긴다 — URL 의 임의 문구를 로그인 화면에 띄우면 피싱 문구 주입에 쓰인다.
      console.error("[auth/callback] exchange failed", error.message);
      fail.searchParams.set("error", "oauth");
      return NextResponse.redirect(fail);
    }
  }

  // 외부 URL 로 튕기는 오픈 리다이렉트 차단 (//evil.com, /\evil.com 등).
  const dest = new URL(safeNextPath(next), url.origin);
  return NextResponse.redirect(dest);
}
