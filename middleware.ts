import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Middleware — runs on every request EXCEPT static assets / images / favicon.
 *
 * Does two things:
 * 1. Refresh the Supabase session cookie (calling getUser() under the hood)
 *    so server components downstream see a fresh session.
 * 2. Redirect unauthenticated users to /login for protected routes.
 *
 * Public routes (no auth required):
 *   - /login                  the sign-in page itself
 *   - /auth/callback          OAuth + magic-link return URL
 *   - /api/auth/*             auth-related API routes
 *
 * Everything else requires a logged-in session.
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            req.cookies.set(name, value);
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/");

  // Not signed in and trying to access a protected page → bounce to /login.
  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Preserve where they were trying to go so we can send them back after login.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Already signed in and visiting /login → send to home.
  if (user && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // Exclude:
  //   _next/static, _next/image, favicon, public assets (svg/png/jpg/webp)
  //   so we don't waste a Supabase call on every static asset request.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)$).*)"],
};
