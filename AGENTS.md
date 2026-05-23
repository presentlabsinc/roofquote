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
| Pricing/calculation logic | [lib/calculations.ts](lib/calculations.ts) — `buildLineItems`, `calcTotals`, `calcFromFinalPrice`, `THICKNESS_MULT` |
| Construction-type definitions, scope flag shapes, material types | [lib/types.ts](lib/types.ts) |
| Prisma client | [lib/prisma.ts](lib/prisma.ts) — singleton, no adapter |
| Supabase clients | [lib/supabase.ts](lib/supabase.ts) — `supabase` (anon, browser-safe) and `supabaseAdmin()` (service role, server-only) |
| Estimate creation API | [app/api/sites/[id]/estimates/route.ts](app/api/sites/[id]/estimates/route.ts) |
| Estimate edit API (5 cases) | [app/api/estimates/[eid]/route.ts](app/api/estimates/[eid]/route.ts) |
| PDF generation | [app/api/estimates/[eid]/pdf/route.ts](app/api/estimates/[eid]/pdf/route.ts) |
| Photo upload | [app/api/upload/route.ts](app/api/upload/route.ts) — uses `supabaseAdmin()` to bypass RLS |
| Main mobile UI screens | `app/{page,settings,sites/...}/*.tsx` |
| Shared chrome | `components/AppHeader.tsx`, `components/BottomNav.tsx` |

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
  - **Do not add multipliers** that auto-inflate the material area based on scope flags. User feedback: they prefer to enter the actual 시공면적 themselves and use these flags as annotations only.

### Special non-scope-flag pickers
- **물받이** uses its own `GutterMode` enum (`none | full | front | back`) with a 4-button radio in the 공사 범위 section. Length input appears when not "none". Stored on `Estimate.gutterMode` + `gutterLengthM`.
- **하지작업** uses `SubstructureType` (`wood | steel`) plus a "없음" UI option. Priced per ㎡ of construction area using `PricingSettings.substructureWoodPricePerSqm` / `substructureSteelPricePerSqm`.
- **폐기물** uses `wasteTruckCount` (defaults 1). When 폐기물 scope is checked, a stepper appears. Cost = `wasteDisposalCost × wasteTruckCount`. (The `wasteDisposalCost` field is now interpreted as "per truck" — default updated to ₩1,000,000.)
- **비계** uses two inputs (days + area in ㎡) → `area × days × scaffoldPricePerSqmDay`. If area is 0, falls back to legacy `scaffoldDailyCost × days` lump-sum model.

### Numeric stepper
- `<NumberStepper>` ([components/ui/number-stepper.tsx](components/ui/number-stepper.tsx)) — round −/+ buttons flanking a typeable input. Use for fields with a small natural range (1-30 ish): 작업 일수, 인원, 장비 사용 일수, 카탈로그 항목 수량.
- Don't use for wide-range numerics (면적, 가격) — plain inputs are better.

### Catalog system (부자재 / 마감재 / 물받이 부속 / 절곡)
- Catalog defined in [lib/catalog.ts](lib/catalog.ts) — `DEFAULT_CATALOG` with ~30 prepopulated items spanning 4 categories. Default prices are reasonable Korean market guesses; user can override per-estimate inline.
- UI: [components/CatalogPicker.tsx](components/CatalogPicker.tsx) — 4 collapsible category cards. Each row has a quantity stepper + inline-editable unit price (so a price override on a specific job doesn't pollute the catalog defaults).
- "+ 직접 추가" per category creates a custom row (key starts with `custom_`) with user-defined label/unit/price.
- Selections flow through `Estimate.catalogSelections Json @default("[]")` as snapshots, then `buildLineItems` emits one `EstimateLineItem` per selection with quantity > 0.
- `categoryToLineItemCategory` in `lib/catalog.ts` maps catalog categories to existing line-item categories (finishing/gutter/accessory → "material", bending → "other") so the UI category colors and customer PDF grouping work consistently.
- A catalog editor in 단가 설정 is not built yet — for now the catalog is read-only at the source, but every estimate can override prices inline. When we add an editor, store the edited catalog in `PricingSettings.catalog` (Json), falling back to `DEFAULT_CATALOG` when null/empty.

### Estimate-detail line-item actions
- `/api/estimates/[eid]` PATCH supports five line-item actions via the request body:
  - `{ lineItemId, total }` — manual edit (sets `isUserEdited = true`)
  - `{ lineItemId, action: "undo" }` — restore total = quantity × unitPrice
  - `{ lineItemId, action: "delete" }` — remove the line
  - `{ action: "add", newLineItem: { name, quantity, unit, unitPrice, category } }` — add a free-form line
  - Plus the existing margin/finalPrice/VAT updates.
- All of the above call `recalcAndReturn` which re-sums totals. When `marginMode === "finalPrice"`, the user's `finalPrice` is preserved and `marginRate`/`marginAmount` are re-derived from the new `totalCost`. Otherwise margin stays fixed and `finalPrice` is recomputed.

### Client-safe view
- The estimate detail UI has a "고객 보기" toggle that hides line items, margin controls, and the cost breakdown. Used when the salesperson hands the phone to the customer. Toggle lives in `EstimateDetail.tsx` (`clientView` state).

### PDF preview flow
- Estimate detail → "견적서 미리보기" button navigates to `/sites/[id]/estimates/[eid]/preview`
- That page embeds `/api/estimates/[eid]/pdf` (no `?download=1`) in an iframe — the PDF route returns `inline` disposition by default.
- The preview page has its own sticky action bar with PDF 저장 + 카톡 보내기. Only the share action marks `pdfSentAt`.

### Visual polish
- Default font is Pretendard. Don't reintroduce Geist for body text.
- BottomNav auto-hides on focused task flows (currently `/sites/new` and `/sites/[id]/estimates/new`). Check `components/BottomNav.tsx` if adding new focused flows.
- Sticky bottom action bars (PDF / KakaoTalk on estimate detail; "현장 등록하기" on new site) use the `StickySubmit` pattern from `app/sites/new/NewSiteForm.tsx`.

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
