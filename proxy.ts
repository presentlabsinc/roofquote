import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy (구 middleware — Next 16 에서 이름 변경) — 정적 자산을 뺀 모든 요청에서 실행.
 *
 * 하는 일:
 * 1. Supabase 세션 쿠키 갱신 (getClaims 가 만료 토큰을 refresh 하고 setAll 로 쿠키 기록)
 * 2. 미인증 요청 차단 — 페이지는 /login 리다이렉트, /api 는 401 JSON
 *
 * ⚠️ 보안 경계는 여기 하나가 아니다 (2026-09-28): 모든 페이지·라우트가 lib/auth.ts
 * requireUser() 에서 getClaims() 로 **다시 서명 검증**한다. proxy 는 UX(리다이렉트)와
 * 토큰 갱신 담당이고, 신원 판단을 하류로 넘기지 않는다. matcher 를 바꿔도 인증이 뚫리지
 * 않게 하려는 이중 방어.
 *
 * Public routes (no auth required): /login, /auth/*, /api/auth/*
 */
export async function proxy(req: NextRequest) {
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

  // getClaims: access_token 서명 검증 (비대칭 키면 로컬, 대칭 키면 Auth 서버 확인).
  // Auth 장애 시 claims 없음 → 미인증 처리 (fail-closed).
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;

  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/");

  if (!signedIn && !isPublic) {
    // API 는 로그인 HTML 로 보내지 않는다 — fetch 가 JSON 파싱에 실패해 영문 오류가 뜨던 문제.
    if (pathname.startsWith("/api/")) {
      return withCookies(res, NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return withCookies(res, NextResponse.redirect(url));
  }

  // Already signed in and visiting /login → send to home.
  if (signedIn && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.delete("next");
    return withCookies(res, NextResponse.redirect(url));
  }

  return res;
}

/** 갱신·삭제된 세션 쿠키를 리다이렉트/401 응답에도 실어 보낸다 (안 그러면 버려짐). */
function withCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => to.cookies.set(c));
  return to;
}

export const config = {
  matcher: [
    // /api 는 확장자와 무관하게 항상 proxy 통과 (구 matcher 는 /api/x.png 를 건너뛰었음).
    "/api/:path*",
    // 그 외: 정적 자산·PWA manifest·public 이미지/폰트는 제외 (Supabase 호출 낭비 + manifest 는
    // 브라우저가 쿠키 없이 요청하므로 로그인 리다이렉트되면 설치가 깨짐).
    // 점은 [.] 로 쓴다 — 백슬래시 이스케이프는 path-to-regexp 컴파일에서 빠져 '.'가 임의 문자가 되고,
    // 그러면 /sites/<id>png 처럼 확장자 글자로 끝나는 경로까지 proxy 를 건너뛰었다 (2026-09-28 리뷰).
    "/((?!api/|_next/static|_next/image|favicon[.]ico$|manifest[.]webmanifest$|.*[.](?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)$).*)",
  ],
};
