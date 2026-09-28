import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase-server";
import { prisma } from "./prisma";
import { DEFAULT_NOTICE_TEXT, FACTORY_DEFAULTS, PLACEHOLDER_COMPANY_NAME } from "./defaults";

/**
 * Auth helpers — single source of truth for "who is the logged-in user, and
 * what's their PricingSettings row?" Every server-side caller (page, route
 * handler, server action) that needs per-user data flows through here.
 *
 * Why an auth.ts (vs. inlining at each call site): keeps the
 * "redirect to /login if not signed in" rule in one place, and gives us a
 * single hook for "create the user's PricingSettings on first sight" so we
 * never have to deal with a "user exists in auth.users but not in our schema"
 * race in callers.
 */

/** 검증된 사용자 신원 — 서명 검증을 통과한 access token claims 에서만 만든다. */
export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * 현재 요청의 사용자를 **검증된 토큰에서** 읽는다 (2026-09-28 보안 수정).
 *
 * ⚠️ `getSession().session.user` 를 쓰면 안 된다: 그 객체는 쿠키 JSON 을 서명 검증 없이
 * 그대로 돌려준다. 쿠키의 user.id 만 남의 UUID 로 바꾸면 다른 테넌트로 행세할 수 있었다
 * (proxy 는 access_token 만 검증하고, 검증된 id 를 하류로 넘기지 않음).
 *
 * `getClaims()` 는 access_token 의 서명을 검증한 뒤 claims 를 돌려준다 —
 * 비대칭 키(RS256/ES256)면 JWKS 로 로컬 검증(네트워크 0, JWKS 캐시),
 * 대칭 키(HS256)면 Auth 서버 getUser() 로 확인. 만료 토큰은 getSession 단계에서 갱신된다.
 * 신원은 오직 `claims.sub` 에서 — 쿠키의 user 객체는 신뢰하지 않는다.
 */
async function verifiedUser(): Promise<AuthUser | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}

/**
 * Return the authenticated user. If there is no verified session, redirect to
 * /login. Throws redirect — call it as the first thing in any RSC / route.
 */
export async function requireUser(redirectTo: string = "/login"): Promise<AuthUser> {
  const user = await verifiedUser();
  if (!user) {
    redirect(redirectTo);
  }
  return user;
}

/** Non-redirecting variant — returns null if not signed in. */
export async function getUser(): Promise<AuthUser | null> {
  return verifiedUser();
}

/**
 * Look up (or lazily create) the PricingSettings row for the current user.
 * On first call after signup, this writes a row populated with hard-coded
 * "blank slate" defaults — the user fills in their own company info / prices
 * via the /settings page. Returns the row.
 *
 * 단가·계수 값은 lib/defaults.ts FACTORY_DEFAULTS (설정 화면 '공장 기본값'과 같은 출처).
 */
export async function getOrCreatePricingSettings(userId: string) {
  let settings = await prisma.pricingSettings.findUnique({ where: { userId } });
  if (settings) return settings;

  // First-time user — create a default row. companyName seeded with an
  // obvious placeholder (NOT the email — email isn't a sensible company name)
  // so the "회사 정보 입력 필요" banner on the home page reliably picks it up.
  settings = await prisma.pricingSettings.create({
    data: {
      ...FACTORY_DEFAULTS,
      userId,
      companyName: PLACEHOLDER_COMPANY_NAME,
      companyPhone: null,
      companyAddress: null,
      noticeText: DEFAULT_NOTICE_TEXT,
      estimateNumberStart: 1,
    },
  });
  return settings;
}

/**
 * One-shot helper for routes that need both: the user and their settings.
 * Redirects to /login if not signed in.
 */
export async function requireUserAndSettings(redirectTo?: string) {
  const user = await requireUser(redirectTo);
  const settings = await getOrCreatePricingSettings(user.id);
  return { user, settings };
}

/**
 * Ownership query pattern (use directly in pages / route handlers — no helper
 * function because Prisma's `include` types don't propagate through generics
 * cleanly):
 *
 *   prisma.site.findFirst({ where: { id, userId: user.id } })
 *   prisma.estimate.findFirst({ where: { id, site: { userId: user.id } }, include: {...} })
 *
 * For mutations, use `updateMany` / `deleteMany` with the same `where` so the
 * ownership check is atomic with the write and returns 0 affected rows for
 * non-owners (no separate findFirst-then-update race).
 */
