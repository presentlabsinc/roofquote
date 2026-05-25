import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-only entry point.
 *
 * ⚠️ This file MUST NOT import anything that pulls in "next/headers" or other
 * server-only APIs — it's loaded by client components (e.g. LoginForm), and
 * any server-only import here will fail the production build with
 * "You're importing a module that depends on 'next/headers'".
 *
 * Server-side clients live in `lib/supabase-server.ts` (Node-only: cookies()
 * and service-role admin). Import from there in route handlers / RSC / server
 * actions.
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

export const PHOTO_BUCKET = "site-photos";
