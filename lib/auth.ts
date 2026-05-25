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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(redirectTo);
  }
  return user;
}

/** Non-redirecting variant — returns null if not signed in. Use for pages that
 *  show different UI for guests vs. signed-in users (we don't have any yet
 *  but the auth callback uses this). */
export async function getUser() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Look up (or lazily create) the PricingSettings row for the current user.
 * On first call after signup, this writes a row populated with hard-coded
 * "blank slate" defaults — the user fills in their own company info / prices
 * via the /settings page. Returns the row.
 *
 * The "blank slate" values mirror SettingsForm DEFAULTS — keep them in sync.
 */
export async function getOrCreatePricingSettings(userId: string, email?: string | null) {
  let settings = await prisma.pricingSettings.findUnique({ where: { userId } });
  if (settings) return settings;

  // First-time user — create a default row. Company info starts blank so the
  // user is prompted to fill it in (PDF render needs it).
  settings = await prisma.pricingSettings.create({
    data: {
      userId,
      companyName: email ?? "회사명을 설정에서 입력하세요",
      companyPhone: null,
      companyAddress: null,
      // Pricing — sensible Korean industry defaults
      materialPricePerSqm: 12000,
      accessoryRate: 0.03,
      ridgePricePerM: 25000,
      eavePricePerM: 20000,
      gutterPricePerM: 30000,
      removalPricePerSqm: 8000,
      wasteDisposalCost: 1000000,
      dailyWage: 300000,
      defaultWorkerCount: 3,
      skyliftDailyCost: 500000,
      ladderTruckDailyCost: 300000,
      scaffoldDailyCost: 150000,
      scaffoldPricePerSqmDay: 3000,
      substructureMode: "wood",
      substructureWoodPricePerSqm: 30000,
      substructureSteelPricePerSqm: 40000,
      drainHolePrice: 200000,
      capBendingPricePerM: 5000,
      endCapPrice: 3500,
      stainlessDrainPricePerM: 50000,
      parapetMultiplier: 1.4,
      defaultLossRate: 0.10,
      useLossRateByDefault: false,
      baseTransportCost: 250000,
      mealCostPerPersonMeal: 10000,
      lodgingCostPerPersonNight: 50000,
      defaultMarginRate: 0.25,
      vatIncludedByDefault: true,
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
