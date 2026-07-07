import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase-server";
import { prisma } from "./prisma";

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

/**
 * Return the authenticated user. If there is no session, immediately redirect
 * to /login (with ?next=... so the user lands back where they tried to go).
 * Throws redirect — call it as the first thing in any RSC / route / action.
 */
export async function requireUser(redirectTo: string = "/login") {
  const supabase = await supabaseServer();
  // getSession() parses the JWT from the request cookie — NO network call.
  // Safe here because middleware.ts already ran getUser() (full server-side
  // signature verification + token refresh) on this very request before any
  // page/route executes; a forged or expired cookie never gets past the
  // middleware redirect. Calling getUser() again here (the old behavior)
  // added a second Supabase Auth roundtrip to EVERY page render — one of the
  // main reasons navigation felt slow (2026-06-12 perf pass).
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    redirect(redirectTo);
  }
  return user;
}

/** Non-redirecting variant — returns null if not signed in. Use for pages that
 *  show different UI for guests vs. signed-in users (we don't have any yet
 *  but the auth callback uses this). Cookie-parse only (no network) — see
 *  requireUser comment for why that's safe behind the middleware. */
export async function getUser() {
  const supabase = await supabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

/**
 * Look up (or lazily create) the PricingSettings row for the current user.
 * On first call after signup, this writes a row populated with hard-coded
 * "blank slate" defaults — the user fills in their own company info / prices
 * via the /settings page. Returns the row.
 *
 * The "blank slate" values mirror SettingsForm DEFAULTS — keep them in sync.
 */
export async function getOrCreatePricingSettings(userId: string, _email?: string | null) {
  let settings = await prisma.pricingSettings.findUnique({ where: { userId } });
  if (settings) return settings;

  // First-time user — create a default row. companyName seeded with an
  // obvious placeholder (NOT the email — email isn't a sensible company name)
  // so the "회사 정보 입력 필요" banner on the home page reliably picks it up.
  settings = await prisma.pricingSettings.create({
    data: {
      userId,
      companyName: "회사명을 설정에서 입력하세요",
      companyPhone: null,
      companyAddress: null,
      // Pricing — sensible Korean industry defaults
      materialPricePerSqm: 12000,
      // 자재 타입별 m당 단가 (천보 도매가, VAT포함, 0.45t, 100원 올림)
      materialPriceSlatePerM: 8100,
      materialPriceV250PerM: 8100,
      materialPriceZinc250PerM: 8100,
      materialPriceGeneralTilePerM: 8600,
      materialPriceTraditionalTilePerM: 8600,
      materialPriceRealZincPerM: 12000,
      materialPriceParapetPerM: 12200,
      materialPriceOverlayPanelPerM: 13300,
      materialPriceTambourPerM: 0,
      accessoryRate: 0.03,
      ridgePricePerM: 25000,
      eavePricePerM: 20000,
      gutterPricePerM: 5000,
      removalPricePerSqm: 8000,
      wasteDisposalCost: 1000000,
      dailyWage: 300000,
      defaultWorkerCount: 3,
      skyliftDailyCost: 500000,
      ladderTruckDailyCost: 150000,
      scaffoldDailyCost: 150000,
      scaffoldPricePerSqmDay: 3000,
      substructureMode: "wood",
      substructureWoodPricePerSqm: 30000,
      substructureSteelPricePerSqm: 40000,
      drainHolePrice: 0,
      capBendingPricePerM: 5000,
      endCapPrice: 3500,
      stainlessDrainPricePerM: 32000,
      downspoutUnitPrice: 50000,
      denjoPricePerUnit: 700000,
      parapetMultiplier: 1.4,
      defaultLossRate: 0.10,
      useLossRateByDefault: false,
      baseTransportCost: 250000,
      mealCostPerPersonMeal: 20000,   // 점심 1만 + 음료·간식 1만 (1인 1일)
      lodgingCostPerPersonNight: 35000, // 2인실 7만 ÷ 2 (1인 1박)
      defaultMarginRate: 0.30,
      vatIncludedByDefault: true,
      estimateNumberStart: 1,
      marginMaterialRatio: 0.5,
      marginLaborRatio: 0.25,
      marginProfitRatio: 0.25,
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
  const settings = await getOrCreatePricingSettings(user.id, user.email);
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
