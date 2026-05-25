import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase clients — three flavors for three contexts.
 *
 * - `supabaseBrowser()`: client component / browser code. Reads session from
 *   cookies set by middleware. Use for sign-in calls, sign-out, OAuth redirects.
 *
 * - `supabaseServer()`: server component / route handler / server action. Reads
 *   session from request cookies, writes refresh on response cookies. Use this
 *   anywhere you need `auth.getUser()` on the server. Async because it has to
 *   `await cookies()` in Next.js 15+.
 *
 * - `supabaseAdmin()`: service-role client (BYPASSES RLS). Only for trusted
 *   server-side ops that the user themselves couldn't do — e.g. photo uploads
 *   that write into the public bucket on behalf of the user. Never use this to
 *   bypass per-user data scoping; always pass userId into the query yourself.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/** Browser client — reads session from cookies. Safe in client components. */
export function supabaseBrowser() {
  return createBrowserClient(url, anonKey);
}

/** Server client — pulls session from Next's cookies(). Use in RSC, route handlers, actions. */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — set is unavailable. Middleware
          // refreshes the session in that case, so this is safe to swallow.
        }
      },
    },
  });
}

/**
 * Service-role client (BYPASSES RLS). Server-only. Use only for trusted ops
 * that need to write data the user couldn't write themselves (e.g. Storage
 * uploads into public buckets).
 */
export function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const PHOTO_BUCKET = "site-photos";
