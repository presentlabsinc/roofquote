import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

/**
 * POST /api/auth/logout — sign the user out and redirect to /login.
 * Wired up to a button in the settings page.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  const url = new URL("/login", req.url);
  return NextResponse.redirect(url, { status: 303 });
}
