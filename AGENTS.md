<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# RoofQuote — agent context

This file is auto-loaded by Claude Code (via `CLAUDE.md`). It captures the non-obvious context a fresh session needs to be productive without re-deriving it.

## What this is

Mobile-first web app for Korean roofing contractors (지붕공사 / 옥상 스틸방수 / 옥상지붕). Field salespeople use it on phones to capture site info, build estimates, and send customer-facing PDFs via KakaoTalk. Built incrementally with a single real user (포스코지붕공사) as the validator.

The full product spec lives in [roofing_app_spec.md](roofing_app_spec.md) (Korean). It is the **source of truth**. The user maintains it; do not edit it. When code and spec disagree, the spec wins.

[README.md](README.md) is the human-facing setup + architecture guide. Refer to it before duplicating explanations.

## Stage

**v0 MVP only.** The spec has an explicit "v0에 들어가지 않는 것" list — do not implement any of:
- CRM, invoices, status pipelines, follow-up reminders
- Sales dashboards, conversion rates, lost-deal tracking
- Multi-user roles, permissions, manager approval
- AI features (image generation, OCR, satellite measurement)
- Pricing plans / billing / subscriptions
- Construction-after-render simulations, color comparisons

If the user asks for any of these, push back gently and confirm — they may have intentionally widened scope, or they may have forgotten the rule.

## Tech stack snapshot

- Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui
- Prisma 6 → Supabase Postgres (Seoul `ap-northeast-2`)
- `@prisma/client` (not the Prisma 7 generated-client path — we downgraded)
- Supabase Storage for photos (`site-photos` bucket, uploaded via service-role key)
- `@react-pdf/renderer` for customer PDFs
- Pretendard font (Korean app standard), loaded via `<link>` in `app/layout.tsx`
- PWA manifest at `app/manifest.ts`, icon at `public/icon.svg`

## ⚠️ Inviolable invariants

These are real constraints. Violating them silently corrupts past quotes — a user-trust disaster.

### 1. PricingSettings is live config — NEVER FK-linked to Estimate
- `EstimateLineItem` stores its own `unitPrice` snapshot. It does not look up the current price at render time.
- Changing today's `PricingSettings.materialPricePerSqm` must NOT change yesterday's quote.
- Verification: `prisma/schema.prisma` has no `@relation` between these two models. If you ever add one, you've broken the rule.

### 2. Estimate snapshots company info
- `Estimate.companyNameSnapshot` / `companyPhoneSnapshot` / `companyAddressSnapshot` are populated at creation from `PricingSettings`. Never re-fetch from `PricingSettings` when displaying or re-rendering a PDF.

### 3. Customer PDF shows snapshot data only
- [components/EstimatePDF.tsx](components/EstimatePDF.tsx) renders only from `Estimate` + `EstimateLineItem` fields.
- No internal cost breakdown, no margin, no per-line unit prices, no labor/meal/lodging itemization in the customer PDF. The customer sees the work scope, the area, the total price, payment terms.
- Internal-only data (margin, line costs, etc.) is shown only in the in-app `EstimateDetail` UI for the salesperson.

## Where to find what

| Concern | File |
|---|---|
| DB schema | [prisma/schema.prisma](prisma/schema.prisma) |
| Pricing / calc logic | [lib/calculations.ts](lib/calculations.ts) — `buildLineItems`, `calcTotals`, `calcFromFinalPrice`, `THICKNESS_MULT` |
| Type defs (ConstructionType, MaterialType, ScopeFlags, GutterMode, SubstructureType, ExtraCost, color presets, scope maps) | [lib/types.ts](lib/types.ts) |
| Catalog defaults + helpers | [lib/catalog.ts](lib/catalog.ts) — `DEFAULT_CATALOG`, `CATALOG_CATEGORIES`, `groupCatalog`, `categoryToLineItemCategory` |
| Prisma client | [lib/prisma.ts](lib/prisma.ts) — singleton, no adapter |
| Supabase clients | [lib/supabase.ts](lib/supabase.ts) — `supabase` (anon, browser-safe) and `supabaseAdmin()` (service role, server-only) |
| Estimate creation API | [app/api/sites/[id]/estimates/route.ts](app/api/sites/[id]/estimates/route.ts) |
| Estimate edit API (9 actions) | [app/api/estimates/[eid]/route.ts](app/api/estimates/[eid]/route.ts) — see "Estimate-detail line-item actions" below |
| PDF generation (inline / download) | [app/api/estimates/[eid]/pdf/route.ts](app/api/estimates/[eid]/pdf/route.ts) — `?download=1` for attachment, otherwise inline for iframe |
| Photo upload | [app/api/upload/route.ts](app/api/upload/route.ts) — uses `supabaseAdmin()` to bypass RLS |
| Main mobile UI screens | `app/{page,settings,sites/...}/*.tsx` |
| Shared chrome | `components/AppHeader.tsx`, `components/BottomNav.tsx` |
| Reusable widgets | `components/CatalogPicker.tsx`, `components/ui/number-stepper.tsx` |
| PDF document component | [components/EstimatePDF.tsx](components/EstimatePDF.tsx) — `EstimatePDFDoc`, helpers: `buildWorkTitle`, `scopeLabel`, `constructionTypeLabel`, `materialLabel` |
| PWA shell | `app/layout.tsx`, `app/manifest.ts`, `app/globals.css` |

## Convention notes

- All money fields are `Int` (Korean Won — no decimals). Format with `formatKRW()` from `lib/calculations.ts` or `.toLocaleString("ko-KR")`.
- Korean text is the user-facing default. Code comments may be English. Commit messages: either is fine but match what nearby commits use.
- Mobile-first. Max width container is `max-w-lg`. All touch targets ≥ 44px. Use the `pressable` utility from `globals.css` for tactile feedback.
- All input fields have `font-size: 16px` minimum to prevent iOS Safari from auto-zooming on focus.
- Korean numerals: prefer `tabular-nums` Tailwind class wherever money or counts are displayed so digits align.
- Photo URLs in `Site.photos` are Supabase Storage public URLs. The hostname must be present in `next.config.ts` `images.remotePatterns` if you ever use `<Image>` (we currently use `<img>`).

## Working on this repo

### Adding a new field to Estimate
1. Update [prisma/schema.prisma](prisma/schema.prisma) — make new fields nullable or add a default for backward compat
2. `npx prisma migrate dev --name short_description`
3. `npx prisma generate` (usually auto-runs; if the dev server is up it'll hold the DLL — stop node first)
4. Update the API route that creates/updates Estimate
5. Update the form + the EstimateDetail UI
6. Update [components/EstimatePDF.tsx](components/EstimatePDF.tsx) if it should appear on the PDF
7. Type check: `npx tsc --noEmit`. Build: `npm run build`

### Adding a new construction type / scope item
- Construction types: extend `ConstructionType` and `CONSTRUCTION_TYPES` in [lib/types.ts](lib/types.ts), then handle in `buildLineItems` ([lib/calculations.ts](lib/calculations.ts)), `SCOPE_BY_TYPE`, the form, and the PDF helpers (`buildWorkTitle`, `scopeLabel`, `constructionTypeLabel`).
- Scope items: extend `ScopeFlags`, add to `SCOPE_LABELS`, add to `SCOPE_BY_TYPE` under the right construction type, and add the calculation branch in `buildLineItems`.
  - If the item is an "이미 시공면적에 포함됨" annotation (like 난간/두겁, 창고, 계단실, 옥탑방), add a hint to `SCOPE_HINTS` instead — the form shows the hint below the label so the user knows it doesn't add to the calculation.
  - If two scope items are mutually exclusive (like 덧씌우기 ↔ 철거), add an entry to `SCOPE_MUTEX` mapping each to the other — `toggleScope` auto-unchecks the partner.
  - If one scope item *requires* another (like 난간 → 두겁 — water leaks without the cap), add an entry to `SCOPE_FORCES` — `toggleScope` auto-checks the required partner.
  - **Do not add multipliers** that auto-inflate the material area based on scope flags. User feedback: they prefer to enter the actual 시공면적 themselves and use these flags as annotations only.

### Special non-scope-flag pickers
- **물받이** uses its own `GutterMode` enum (`none | full | front | back`) with a 4-button radio in the 공사 범위 section. Length input appears when not "none". Stored on `Estimate.gutterMode` + `gutterLengthM`.
- **하지작업** uses `SubstructureType` (`wood | steel`) plus a "없음" UI option. Priced per ㎡ of construction area using `PricingSettings.substructureWoodPricePerSqm` / `substructureSteelPricePerSqm`.
- **폐기물** uses `wasteTruckCount` (defaults 1). When 폐기물 scope is checked, a stepper appears. Cost = `wasteDisposalCost × wasteTruckCount`. (The `wasteDisposalCost` field is now interpreted as "per truck" — default updated to ₩1,000,000.)
- **비계** uses two inputs (days + area in ㎡) → `area × days × scaffoldPricePerSqmDay`. If area is 0, falls back to legacy `scaffoldDailyCost × days` lump-sum model.
- **두겁 (cap)** is a scope flag with inline length input. When 난간 (handrail) is checked, `SCOPE_FORCES` auto-checks 두겁 (water leaks otherwise). Cost = `capLengthM × capBendingPricePerM`. Stored on `Estimate.capLengthM`.
- **새 배수구 타공 (drainHole)** is a scope flag with inline count stepper. Cost = `drainHoleCount × drainHolePrice`. Stored on `Estimate.drainHoleCount`.

### Numeric stepper
- `<NumberStepper>` ([components/ui/number-stepper.tsx](components/ui/number-stepper.tsx)) — round −/+ buttons flanking a typeable input. Use for fields with a small natural range (1-30 ish): 작업 일수, 인원, 장비 사용 일수, 카탈로그 항목 수량.
- Don't use for wide-range numerics (면적, 가격) — plain inputs are better.

### Catalog system (부자재 / 마감재 / 물받이 부속 / 절곡)
Each catalog category has **two modes** — the user toggles per category:

**심플 모드 (default)** — one auto-calculated line per category:
- `simpleType` is one of: `percent` (자재비 %), `perSqm` (㎡당), `perM` (m당 — gutter length), `total` (총금액)
- `simpleValue` is the multiplier or amount
- Defaults in `lib/catalog.ts` `DEFAULT_CATEGORY_MODES`:
  - finishing → perSqm 5,000원/㎡
  - gutter → perM 3,000원/m
  - accessory → percent 15%  (replaces the old auto-added 부자재 line)
  - bending → total 0원 (user fills in if needed)
- Settings override: `PricingSettings.catalogDefaults` (Json), merged on top of `DEFAULT_CATEGORY_MODES` via `resolveCategoryDefaults()`.

**상세 모드** — itemized from [lib/catalog.ts](lib/catalog.ts) `DEFAULT_CATALOG` (~30 prepopulated items):
- Each row in [components/CatalogPicker.tsx](components/CatalogPicker.tsx) has a quantity stepper + inline-editable unit price snapshot (so a job-specific price override doesn't change the defaults).
- "+ 직접 추가" per category creates a custom row (key starts with `custom_`).

**Snapshot storage** (both modes coexist on `Estimate`):
- `Estimate.catalogSelections Json @default("[]")` — itemized picks (used when mode === "detailed")
- `Estimate.catalogModes Json @default("{}")` — per-category mode + simple value (used when mode === "simple")

**Calculation flow** (`buildLineItems` in `lib/calculations.ts`):
- For each of the 4 categories, look up effective mode (estimate override → settings default → built-in default)
- Simple mode → emit one `EstimateLineItem` via `simpleModeLineItem()` (returns null if value ≤ 0)
- Detailed mode → emit one item per `catalogSelections[]` row in that category with quantity > 0
- `categoryToLineItemCategory()` maps catalog categories to line-item categories (finishing/gutter/accessory → "material", bending → "other") so colors + customer PDF grouping work consistently.

**Note:** The old auto-added 부자재 line (materialTotal × accessoryRate) has been removed — it's now expressed as the accessory category's simple-mode percent. `PricingSettings.accessoryRate` is left in the DB for back-compat but no longer drives calculations.

**Settings catalog editor** is still TODO. For now, defaults are configured per-estimate inline.

**Auto-fill for detailed mode** (per user request, deferred): each catalog item could carry a `perSqm` coefficient so switching to 상세 모드 auto-populates quantities based on construction area. Needs industry-standard data the user said they'd supply.

### Estimate edit API — 9 actions total
`PATCH /api/estimates/[eid]` dispatches on the request body shape. Order in the route handler matters (first match wins):

1. `{ lineItemId, total }` — manual edit on a line (`isUserEdited = true`)
2. `{ lineItemId, action: "undo" }` — restore `total = quantity × unitPrice`, clear `isUserEdited`
3. `{ lineItemId, action: "delete" }` — remove the line
4. `{ action: "add", newLineItem: { name, quantity, unit, unitPrice, category } }` — append a free-form line (`isUserEdited = true`)
5. `{ marginRate }` — set rate, recompute margin amount / supply / final
6. `{ marginAmount }` — set amount, back-derive rate, mode → `'amount'`
7. `{ finalPrice }` — back-calc from final, mode → `'finalPrice'` (line items untouched)
8. `{ vatIncluded }` — toggle, recompute totals
9. `{ paymentTerms / validityDays / pdfUrl / pdfSentAt }` — whitelist meta update

Actions 1-4 (line item changes) and 8 (VAT) all call `recalcAndReturn(eid, estimate)`:
- If `estimate.marginMode === "finalPrice"`, the user's `finalPrice` is held fixed and `marginRate / marginAmount` are re-derived from the new `totalCost`. This preserves "I promised the customer 850만원" through subsequent edits.
- Otherwise margin stays fixed and `finalPrice` is recomputed.

### Client-safe view
- The estimate detail UI has a "고객 보기" toggle that hides line items, margin controls, and the cost breakdown. Used when the salesperson hands the phone to the customer. Toggle lives in `EstimateDetail.tsx` (`clientView` state).

### PDF preview flow
- Estimate detail → "견적서 미리보기" button navigates to `/sites/[id]/estimates/[eid]/preview`
- That page embeds `/api/estimates/[eid]/pdf` (no `?download=1`) in an iframe — the PDF route returns `inline` disposition by default.
- The preview page has its own sticky action bar with PDF 저장 + 카톡 보내기. Only the share action marks `pdfSentAt`.

### Visual polish
- Default font is Pretendard. Don't reintroduce Geist for body text.
- BottomNav auto-hides on focused task flows (currently `/sites/new`, `/sites/[id]/estimates/new`, and routes ending in `/preview`). Check `components/BottomNav.tsx` if adding new focused flows.
- Sticky bottom action bars come in two flavors:
  - **BottomNav hidden** (focused flows): use the `StickySubmit` pattern from `app/sites/new/NewSiteForm.tsx` (sits at `bottom-0` with a gradient backdrop).
  - **BottomNav visible** (e.g. estimate detail, settings): position at `bottom-24` (or `bottom-28` for settings) so the button clears the nav pill. Bump the page's `pb-` accordingly (`pb-48` on estimate detail, `pb-32` elsewhere).

### Don't
- Don't add `pdfUrl` permanence yet — we record `pdfSentAt` but the PDF is regenerated on demand from snapshot data, not stored. (The spec says we *should* store it long-term; that's a future task.)
- Don't add base64 image storage. Use Supabase Storage via `/api/upload`.
- Don't run `git push` from this shell with a fresh clone — it'll fail auth. The user has a PAT embedded in the remote URL locally; tell them if creds break.

## Known gotchas / paper cuts

- **Windows + Prisma client regeneration:** if the dev server is running, `npx prisma generate` fails because Node has `query_engine-windows.dll.node` locked. Stop node processes first.
- **Prisma 6 vs 7:** we deliberately use Prisma 6. Supabase docs target it, and it avoids the Prisma 7 adapter setup. Don't run `npm i prisma@latest` without rewriting the schema/client/adapter setup.
- **PowerShell here-strings:** the closing `'@` must be at column 0 on its own line. For multi-line git commit messages, write to `.git/COMMIT_MSG_TEMP` and use `git commit -F`. PowerShell can't pipe to git well.
- **`.env` is gitignored** — when env keys rotate, you have to ask the user for new values; nothing in the repo has them.

## Documentation hygiene (you reading this)

When you make changes that affect setup, architecture, or invariants:

- Update **README.md** when: a new env var is needed, a new directory is added, the data model changes, a new top-level concept is introduced, deployment instructions change.
- Update **this file (AGENTS.md)** when: a new file becomes important enough to know where to find, a new convention is established, a new gotcha is discovered, a new "don't do this" rule emerges.
- Update **.env.example** any time `.env` gains a new key.
- Update **prisma migrations** by running `npx prisma migrate dev --name <description>` — never edit migration SQL by hand.
- Do **not** update **roofing_app_spec.md** — that's the user's living spec.

Add a short note to the commit message when you've touched docs. Future sessions trust docs over guessing.
