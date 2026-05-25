import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Server-only Supabase clients.
 *
 * - `supabaseServer()` — session-aware. Reads session from request cookies,
 *   writes refreshed cookies on the response. Use in RSC, route handlers,
 *   server actions. Async because Next.js 15+ `cookies()` is async.
 *
 * - `supabaseAdmin()` — service-role. BYPASSES RLS. Only for trusted
 *   operations the user themselves couldn't do (e.g. uploading into a public
 *   Storage bucket). Never use this to bypass per-user data scoping —
 *   always pass userId into the query yourself.
 *
 * The `"server-only"` import at the top is a compile-time guard: if any
 * client component or shared module accidentally imports from here, the
 * build fails immediately instead of producing a broken bundle.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/** Server client — pulls session from Next's cookies(). */
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
 * Service-role client (BYPASSES RLS). Use only for trusted ops that need to
 * write data the user couldn't write themselves (e.g. Storage uploads into
 * public buckets).
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
