import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

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
      fail.searchParams.set("error", error.message);
      return NextResponse.redirect(fail);
    }
  }

  const dest = new URL(next.startsWith("/") ? next : "/", url.origin);
  return NextResponse.redirect(dest);
}
