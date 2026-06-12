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

## ⭐ Product north star (read this before touching estimation logic)

**The goal is NOT an objectively "correct" quote. It's that each user can easily
tune the app to *their own* way of quoting and get a satisfying quote out fast.**

Every roofer prices differently — different unit prices, different material
quantities, different methods (목재 vs 철재 하지, 붙임 vs 띄움), different crew
sizes and schedules, and a different gut number for the same building. We do not
try to be right for all of them. We give a *reasonable starting point* and make
it frictionless to bend toward the user's own numbers. After a few quotes the
output converges to that user's style.

This reorders priorities — keep them in this order when making tradeoffs:
1. **Adjustability** — easy to change anything, anywhere, and the change sticks (per-user).
2. **Good defaults** — close-enough out of the box so there's less to change.
3. **Precision** — least important. The user overrides to their own number anyway;
   don't chase ±5% in the engine when the override lever already exists.

The app is built as a **5-layer adjustment stack** (all already implemented):
1. **설정** — per-user defaults (prices, margin, loss rate, methods). Fully tenant-isolated.
2. **견적별 단가 override** (`Estimate.pricingOverrides`) — special pricing for one estimate.
3. **라인아이템 직접 수정/추가/삭제** — fix any auto-generated quantity/amount in place.
4. **마진 / 평당가 / 최종가 직접 입력** — "I want this to be 850만원" → back-calculated.
5. **고객 PDF는 원가 숨기고 마진 분배** — internal cost vs customer-facing number kept separate.

When in doubt: make it editable and give a sane default, rather than hard-coding
a "true" value. Auto-estimation exists to fill the blank with something plausible,
not to be authoritative.

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

## Authentication (Supabase Auth)

Multi-tenant. Every page + API route requires a signed-in user; data is scoped by `userId` (the Supabase `auth.users.id` UUID stored as a string column).

- **Provider**: `@supabase/ssr` for cookie-based session in App Router.
- **Login methods**: Kakao OAuth, Google OAuth, email/password. Signup is closed during beta — admin creates accounts in the Supabase dashboard.
- **Files**:
  - `lib/supabase.ts` — `supabaseBrowser()`, `supabaseServer()` (async), `supabaseAdmin()` (service role).
  - `lib/auth.ts` — `requireUser()`, `requireUserAndSettings()`, `getOrCreatePricingSettings()`.
  - `middleware.ts` — session refresh + redirect unauthed users to `/login`.
  - `app/login/` — sign-in page + form.
  - `app/auth/callback/route.ts` — OAuth return URL → exchange code for session → forward to `next`.
  - `app/api/auth/logout/route.ts` — POSTs sign out, redirects to /login.

### Data ownership rules
- `PricingSettings.userId` is `@unique` — exactly one settings row per user. Created lazily on first request via `getOrCreatePricingSettings()`.
- `Site.userId` is indexed; `Estimate` ownership flows through `Site` (no own column).
- All queries use either `findFirst({ where: { id, userId } })` or `findFirst({ where: { id, site: { userId } } })`. Never plain `findUnique({ id })` — that leaks across users.
- Mutations use `updateMany`/`deleteMany` with the ownership filter so the check is atomic with the write (avoids find-then-update race).

### Adding a new model
Any new model that holds user-owned data must:
1. Have a `userId String` column (or join through one that does).
2. Be queried/mutated only via the patterns above.
3. Not be returned from any route without first verifying ownership.

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

### Material auto-estimation engine (lib/calculations.ts)

**Concept** — fill the quote with plausible material quantities from minimal input,
as a *starting point* the user then edits (see north star at top). Spec'd in
`MATERIAL_ESTIMATION_UPDATE.md` (in user's Downloads, not in repo) as a **two-layer**
system:
- **Layer 1 — baseline data** (`PricingSettings.baselineData`, JSON): real per-size
  job history. Takes priority when present. **Currently empty** → never fires yet.
  `findAndScaleBaseline()` looks up nearest 평수 + 형태 and scales by area.
- **Layer 2 — geometric estimation** (`estimateGeometrically()`): always-on fallback.
  building shape (ㅁ/ㄱ/ㄷ) → `BUILDING_SHAPE_FACTORS` (perimeter factor, corner count);
  roof shape (박공/모임/팔작/외쪽/멘사드/기타) → `ROOF_SHAPE_FACTORS` (ridge/eave ratio, loss rate).

**Perimeter is type-specific** — `estimateBasePerimeter(constructionType, ...)`:
- `roof`: √(시공면적÷1.4) × shapeFactor **+ 8×처마돌출**(eaveOverhangCm). 기존 지붕 재시공.
- `rooftopRoof`: √(시공면적) × shapeFactor — **no ÷1.4, no overhang** (새로 짓는 지붕이라
  시공면적 자체가 외곽 footprint). 처마 돌출 입력 폼에서 숨김.
- `steelWaterproof`: **no auto-estimate** — user directly inputs 난간 둘레(`railPerimeterM`)
  + 옥탑 둘레(`rooftopStructurePerimeterM`). 옥탑 변수가 커서 면적 추정이 신뢰 불가.

**Bending cost** = `calcBendingCost(widthMm, lengthM, pricePerMmPer3m)` = `width × unit × (length/3)`.
Widths per 부재 in settings (`bendingWidthRidge` 등), unit `bendingPricePerMmPer3m` (기본 36).

**Per-type line generation** (all gated on scope flags; user edits after):
- roof / rooftopRoof: 용마루 마감+절곡(**유일한 마감+절곡 쌍** — OPEN DECISION 참조), 처마/덴조 **건당 시공(labor)** (구 "처마 마감 m당" 라인은 6/1 리팩토링에서 제거 — `eavePricePerM` 은 현재 미사용, `bendingWidthEave` 는 옥탑 트림 넓이로만 재사용), 프래싱 절곡(꺾인 건물), 물받이 OR 엔드캡, 하지, 철거(roof만).
- steelWaterproof: 두겁/미시/프래싱 절곡, 파라펫 강판(난간둘레×높이), 옥탑 외벽 강판(옥탑둘레×옥탑높이),
  옥탑 문/창 트림(개수×평균둘레), 처마/덴조, 스테인리스 배수로, 홈통, 배수구 타공.
- 공통 소모품 (buildingShape 있을 때만): 스크류 대(면적×2/㎡), 스크류 소(절곡길이×3.3/m), 실리콘(접합부÷6m).
- 단열재(insulationTypes multi-select), PE폼(hasPeFoam, 기본 ON — 강판/바닥에 ㎡당 추가).

**Loss rate** — `resolveEffectiveLossRate(lossRateMode, roofShape, manualRate)`:
`PricingSettings.lossRateMode` = `"auto"` (지붕형태별 ROOF_SHAPE_FACTORS lossRate) | `"manual"`
(항상 defaultLossRate). 강판 + 하지 자재에만 적용 (소모품 제외). 토글 off면 0.

**Measurement-first hybrid** (the practical philosophy): big-money quantities
(면적/둘레/용마루·처마·물받이·난간 길이/절곡 m) should be **direct input with a
geometric auto-fill default the user can override**; small consumables
(스크류/실리콘) stay coefficient-based. Don't derive everything from area — it stacks error.

**Planned upgrade (awaiting 포스코 data) — spec-driven engine:**
- Replace guessed coefficients with real consumption rules ("방수스크류 50cm 간격",
  "하지 2×4 @ 60cm 격자 + 서포트 격자", 강판 겹침/로스) stored as **settings constants** (global, set once).
- Use real 30/50/80/100평 job data to **calibrate/verify** the constants — NOT as the
  primary engine (only 4 points, real jobs are 37·63·112평). Plug a real job's dims in,
  compare output to actual usage, tune constants + loss until they match.
- Defaults stay industry-standard so it works without the data; data just sharpens defaults.

**⚠️ OPEN DECISION — 2026-06-12 사용자 확인으로 대부분 해소. 남은 건 절곡 단가 구성 1개.**

**현장 실태 (사용자 확인):** 마감 방식은 자재 타입에 따라 갈린다.
- **징크250 코루게이티드 (현재 주류):** 용마루·미시·후레싱(현장 용어 "페이샤") 전부 **절곡 제작**.
  기성품(멀티용마루·미시)을 쓰는 경우도 일부 있음.
- **기와형 (일반기와/전통기와):** 기성품 사용 — 용마루·하우마끼·대봉·소봉. 단 시골 외엔 수요 감소 추세.
- 기성품 단가는 카탈로그에 이미 있음: `finishing` (용마루 고전/일자/멀티, 용마루캡),
  `roofingExtras` (대봉/소봉/양면소봉) — 천보 실단가.

**확정된 설계 방향 — `finishingMethod: "bending" | "ready"` (견적별, 자재 타입으로 default):**
- default: `materialType ∈ {generalTile, traditionalTile}` → `ready`, 그 외 → `bending`.
  폼에서 칩 토글로 override 가능 (기와도 절곡으로, 코루게이티드도 기성품으로 가능해야 함).
- `bending` 모드: 용마루/미시/페이샤 **절곡 라인만** emit — `용마루 마감`(ridgePricePerM) 라인 제거.
  → 이중 계산 구조적으로 소멸.
- `ready` 모드: 절곡 라인 suppress, `용마루 (기성품)` m당 라인 유지(ridgePricePerM = 기성품 단가로 재해석,
  설정 라벨 변경). 하우마끼/대봉/소봉은 카탈로그 상세 모드에서 선택 (현행 유지).
  개선 옵션: 용마루 개수 = ceil(추정 길이 ÷ 3m 규격) 자동 환산 (`lengthMm` 필드 활용).

**남은 확인 1개 (사장님):** 절곡 단가(`bendingPricePerMmPer3m` 기본 36원)에 **무엇이 포함**되나 —
강판 자재값+가공비인지, 가공비만인지(자재는 본 강판 발주에 포함?), 시공 인건비는 별도(인건비 라인)인지.
이 답이 나와야 절곡 라인의 단가·라벨이 확정되고 단가표 마감 가능.

정확한 범위 (2026-06-12 코드 확인):
- **실제 이중 계산 가능 지점은 용마루 한 곳뿐** — `용마루 마감` (length × ridgePricePerM) 과
  `용마루 절곡` (같은 length 에 절곡 공식) 이 둘 다 emit 되는 유일한 마감+절곡 쌍.
  단가가 all-in 이면 절곡분이 두 번 청구됨.
- 절곡 라인은 **buildingShape 입력 시에만** 자동 생성 — 건물형태를 안 쓰면 발현 안 함.
- 두겁/미시/프래싱/옥탑 트림은 **절곡 라인만** 있음 (마감 짝 없음) → 이중은 아니지만,
  사장님 답이 이 라인들의 의미도 결정함: 단가에 절곡 포함(all-in)이라면 이 절곡-only
  라인들이 해당 부재의 유일한 라인으로서 단가·라벨을 all-in 으로 재해석해야 함.
- 처마는 건당 시공(labor)으로 재정의되어 이 문제에서 빠짐.

### Special non-scope-flag pickers
- **물받이** is multi-select (front / back / left / right). Stored on `Estimate.gutterMode` as a comma-separated string. Helpers in [lib/types.ts](lib/types.ts):
  - `GutterSide`, `GUTTER_SIDES`, `GUTTER_SIDE_LABELS`
  - `parseGutterSides(stored)` → `Set<GutterSide>`. Back-compat: `"none"` → empty set, `"full"` → all 4.
  - `serializeGutterSides(set)` → string. Empty → `"none"`. All 4 → `"full"`. Subset → `"front,back"`.
  - `gutterSidesLabel(set)` for the PDF label: empty → "안함", all → "전체", subset → "앞, 좌" etc.
  - Form shows 4 toggle chips with the length input appearing when ≥1 side is selected.
  - Calculation: if `sides.size > 0` and `gutterLengthM > 0`, emit one line with the formatted label.
  - **스틸방수 예외:** for `constructionType === "steelWaterproof"` the gutter UI is hidden and replaced with the 스테인리스 배수로 input (see below). `buildLineItems` also skips the gutter line for that type.
- **물받이 / 배수로는 시공 범위의 일부** — 폼에서 공사 범위 Section 바로 뒤에 배치 (자재 itemize 가 아니라 설치 여부/길이 결정이라서). 물받이 부속 자재(걸쇠/코너/마감캡 등)는 별개로 추가 자재 카탈로그 `gutter` 카테고리에 있음.
  - 지붕/옥상지붕: 물받이 Section — 4면 칩 + 길이(자동: 처마외곽둘레 × 면가중치 앞30/뒤30/좌20/우20%).
  - steelWaterproof: "배수로 / 물받이" Section — 스테인리스 배수로 길이 + 홈통 개수(`downspoutCount`) + **차양 물받이(옵션, gutterLength 재사용)**. 배수로 길이 0 이면 confirm.
  - 카탈로그 `gutter` 카테고리 라벨은 steelWaterproof 에서 "배수로 / 물받이 부속" 으로 override (`CatalogPicker categoryLabels` prop).
- **물받이 라인은 더 이상 type-gated 아님** — `buildLineItems` 가 `gutterLengthM>0 && gutterMode!=none` 이면 유형 무관 emit (스틸방수 gutterMode="full" → 라벨 "차양"). 스테인리스 배수로 라인은 steelWaterproof 전용으로 별도.
- **엔드캡** — 기와지붕 외엔 거의 안 써서(보통 접어 마감) 별도 UI 제거. 필요 시 카탈로그 finishing 에서 선택.
- **난간 / 두겁** (steelWaterproof) — `handrail` 토글 시 `SCOPE_FORCES`로 `cap` 자동 ON. 토글 아래 **파라펫 높이 + 난간 둘레** 직접 입력. 두겁/미시/파라펫강판 = 난간(+옥탑) 둘레 기반. (옛 `capLengthM` 직접입력은 deprecated — 둘레로 계산.)
- **옥탑 구조물** (steelWaterproof) — `rooftopStructure` 토글 시 아래 **둘레 / 높이(`rooftopStructureHeightCm`) / 출입문 수 / 창문 수** 입력. 옥탑 외벽 강판 + 문/창 트림 절곡 생성.
- **하지작업** uses `SubstructureType` (`wood | steel`) plus a "없음" UI option (없음 = 하지 없이 덧방). Priced per ㎡ of construction area, **로스율 적용**. 목재=붙임, 철재=띄움(아래 창고 공간). 띄움 측면 강판은 자동 X — 필요 시 수동 추가.
- **폐기물** uses `wasteTruckCount` (defaults 1). Cost = `wasteDisposalCost × wasteTruckCount` (per truck, 기본 ₩1,000,000).
- **비계** = `area × days × scaffoldPricePerSqmDay`. area 0 이면 legacy `scaffoldDailyCost × days`.
- **새 배수구 타공 (drainHole)** scope flag + count stepper. Cost = `drainHoleCount × drainHolePrice`.
- **PE폼 (hasPeFoam, 기본 ON)** — 강판 종류 섹션 체크박스. 강판 면적 × `peFoamPricePerSqm`. 견적서 PDF에선 강판 라인에 합산 표시(`mergePeFoamIntoMaterial`), 내부는 별도 라인.
- **단열재 (insulationTypes, multi-select)** — 스티로폼(EPS)/아이소핑크(XPS)/경질우레탄폼(PIR)/열반사단열재/기타. 기타 선택 시 `insulationNote`. 면적 × `insulationPricePerSqm`.

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

**내 단가 프리셋 저장/불러오기** (deferred — post-v0): user wants to be able to save their pricing settings as multiple named snapshots and switch between them (e.g. "표준", "겨울 비수기", "프리미엄"). Plus a "기본설정으로 리셋" button that's available immediately. Probably one new model `PricingPreset { id, userId, name, snapshotJson, createdAt }` and a dropdown in settings header. ~~Wait until auth is in place since presets are per-user.~~ (auth ✅ 완료) **지금 미루는 이유: 기본 단가표가 미확정** (절곡 OPEN DECISION 포함) — 단가표 확정 후 착수.
- **snapshotJson 범위 (2026-06-12 확정):** 단가·계수 필드만. 제외: 회사정보 (`companyName`, `companyPhone`, `companyAddress`, `businessRegistrationNumber`, `sealImageUrl`, `bankAccount`, `noticeText`), `estimateNumberStart`, `baselineData`. 프리셋 전환이 회사 정보·채번·시공 이력을 건드리면 안 된다.
- 프리셋 전환 × 과거 견적 재수정의 동작은 "Pricing overrides" 섹션의 절대값 assertion 참조.

### Estimate edit API — 10 actions total
`PATCH /api/estimates/[eid]` dispatches on the request body shape. Order in the route handler matters (first match wins):

1. `{ lineItemId, total }` — manual edit on a line (`isUserEdited = true`)
2. `{ lineItemId, action: "undo" }` — restore `total = quantity × unitPrice`, clear `isUserEdited`
3. `{ lineItemId, action: "delete" }` — remove the line
4. `{ action: "add", newLineItem: { name, quantity, unit, unitPrice, category } }` — append a free-form line (`isUserEdited = true`)
5. `{ action: "replace", ...allEstimateFields }` — **full edit** — wipes existing line items, re-runs `buildLineItems` with submitted inputs, re-snapshots company info from current `PricingSettings`. Used by edit mode (`?edit=eid` on new-estimate form). Preserves `estimateNumber` and `pdfSentAt`. Resets `marginMode` to "percent".
6. `{ marginRate }` — set rate, recompute margin amount / supply / final
7. `{ marginAmount }` — set amount, back-derive rate, mode → `'amount'`
8. `{ finalPrice }` — back-calc from final, mode → `'finalPrice'` (line items untouched)
9. `{ vatIncluded }` — toggle, recompute totals
10. `{ paymentTerms / validityDays / pdfUrl / pdfSentAt }` — whitelist meta update

Actions 1-4 (line item changes) and 8 (VAT) all call `recalcAndReturn(eid, estimate)`:
- If `estimate.marginMode === "finalPrice"`, the user's `finalPrice` is held fixed and `marginRate / marginAmount` are re-derived from the new `totalCost`. This preserves "I promised the customer 850만원" through subsequent edits.
- Otherwise margin stays fixed and `finalPrice` is recomputed.

### Client-safe view
- The estimate detail UI has a "고객 보기" toggle that hides line items, margin controls, and the cost breakdown. Used when the salesperson hands the phone to the customer. Toggle lives in `EstimateDetail.tsx` (`clientView` state).

### Margin distribution on the customer PDF (50/25/25 default, configurable)
- **The problem this solves:** the customer PDF used to show line items summing to `totalCost`, with a bigger 최종 견적 금액 below — math didn't add up and customers would ask why.
- **The fix:** `distributeMarginForDisplay(items, marginAmount, ratios)` in [lib/calculations.ts](lib/calculations.ts) returns a NEW array of `DisplayLineItem`s with the margin baked into the line totals + a synthetic "이윤" line at the end. Sum of returned items == `cost + marginAmount` == 공급가액.
- **Split** is per-user in PricingSettings:
  - `marginMaterialRatio` (default 0.5) — distributed proportionally across material lines (each line's `total` and `unitPrice` scale by the same factor)
  - `marginLaborRatio` (default 0.25) — across labor/meals/lodging lines (rolled up by `groupForDetailed` into one 인건비 row)
  - `marginProfitRatio` (default 0.25) — emitted as a separate "이윤" line (표준품셈 형식, customer doesn't find it strange)
- **Empty-bucket fallback:** no material lines → material's share spills into labor → labor full → spills into the profit line. Math never breaks.
- **Normalization:** ratios are renormalized inside `distributeMarginForDisplay` so the saved settings can be e.g. 60/30/30 without over-distributing.
- **Rounding sweep** at the end adjusts the last item by ±1원 so the displayed sum is exactly `cost + marginAmount` (no visible drift).
- **Internal data is never modified.** `EstimateLineItem` rows stay cost-only (snapshot rule). This is purely a presentation transform applied at PDF render time. In-app `EstimateDetail` still shows the true cost breakdown + margin separately for the salesperson.
- **Wiring:** `app/api/estimates/[eid]/pdf/route.ts` reads the current user's ratios from PricingSettings and passes them to `EstimatePDFDoc` as `marginRatios`. Settings UI: `MarginDistributionCard` at the bottom of `SettingsForm.tsx` with three % inputs + live sum check + "기본값 (50/25/25)" reset button.
- **Ratios are read live**, not snapshotted — changing the split re-renders existing estimates' PDFs with the new distribution. Line item totals don't change, only the presentation does.
- **⚠️ 외부 감사 (2026-06-12) — live read 는 분쟁 시나리오에서 결함:** 사용자가 분배 비율을 바꾼 뒤 과거 견적 PDF를 재다운로드하면, 고객이 원래 받은 PDF와 라인별 단가가 다른 사본이 나온다 (총액은 동일). 고객이 두 사본을 비교하면 신뢰 문제. live read 는 유연성을 위한 의도적 결정이었지만 invariant #2 의 정신("PDF 재렌더 시 PricingSettings 재조회 금지")과 모순. **Fix (백로그):** 비율 3개를 견적 생성 시 `Estimate` 에 스냅샷 (replace 시 재스냅샷 — replace 의미론과 일치), 마이그레이션 이전 행은 live 폴백. 컬럼 3개 + 폴백.

### Margin is revenue-based (매출 대비), not cost-based
`calcTotals`: **`supplyPrice = totalCost / (1 - marginRate)`**, `marginAmount = supplyPrice - totalCost`.
i.e. marginRate = 마진 / 공급가 (매출 대비), NOT 마진 / 원가. Example: 원가 800만 + 마진율 20%
→ 공급가 1,000만, 마진 200만. `calcFromFinalPrice` back-derives `marginRate = marginAmount / supplyPrice`.
Clamped at 99% (denominator). Negative rate (손해) allowed. EstimateDetail labels say "매출 대비".
**Old estimates** keep their stored marginRate (computed the old 원가-대비 way) until re-saved — not migrated.

### Margin adjustment — 4 editable inputs in `EstimateDetail`
Order in the margin card (most-used → least-used):
1. **평당가** (highlighted) — 평당가 × 평수 → finalPrice. Most natural for Korean contractors. 1평 = 3.3058㎡. Disabled when `areaM2 === 0`. Patches via existing `{ finalPrice }` action — backend doesn't know "평당" exists.
2. **최종 견적가 직접** — sets finalPrice, marginMode → `'finalPrice'`, marginRate auto-derived.
3. **마진율** — sets marginRate, recomputes everything.
4. **마진 금액** — sets marginAmount, back-derives marginRate.
All four are mutually derived: editing one updates the other three. The hero card chip row also displays 평당가 in both internal and client-view modes (it's customer-friendly information).

### Pricing overrides (per-estimate price changes)
- `Estimate.pricingOverrides Json @default("{}")` — shape: `Partial<PricingOverrides>` with only the price fields the user changed for this specific estimate.
- `applyOverrides(settings, overrides)` in `lib/calculations.ts` returns a merged `PricingSettings`-shaped object. `buildLineItems` calls this on `input.settings + input.pricingOverrides` and uses the merged object everywhere internally.
- `lib/types.ts` defines `PricingOverrides` type and `PRICING_OVERRIDE_GROUPS` (UI structure for the form — 자재 / 하지·스틸방수 / 인건·체류 / 장비·운송).
- Form: `PricingOverridesSection` at the end of the new-estimate form (collapsed by default, badge shows N개 변경됨 when any). Empty field = use settings default; filled = override for this estimate.
- Inline price hints in the form (e.g. "트럭 수 (1,000,000원/차)") use `eff` = `applyOverrides(settings, pricingOverrides)` so they reflect the override live.
- **Critical:** `PricingSettings` itself is never modified by an override — the snapshot rule still holds. Old estimates with no overrides keep the original behavior.
- **Assertion — overrides 는 절대값(absolute)이다 (2026-06-12 확정):** `pricingOverrides` 는 저장 당시 설정에 대한 상대값(delta)이 아니라 절대 단가다. `applyOverrides` 는 shallow merge 로 값을 그대로 덮어쓴다. 따라서 (프리셋 기능 도입 후) 프리셋 전환 뒤 과거 견적을 `?edit → replace` 하면 override 는 **새 프리셋 base 위에 절대값으로** merge 된다 — 이것이 정의된 동작이며, delta 방식으로 바꾸지 말 것.
- API: POST + PATCH replace both accept `pricingOverrides` and persist it. Edit-mode prefills from the existing estimate's `pricingOverrides`.

### Edit mode (full edit of an existing estimate)
- Triggered from EstimateDetail → "입력값 수정" button (with confirmation explaining what gets reset).
- Navigates to `/sites/[id]/estimates/new?edit={eid}`.
- `NewEstimateForm` accepts optional `existing?: Estimate` prop. When set:
  - All useState initializers prefill from `existing.*` instead of defaults
  - Form header shows "견적 수정"
  - Submit button shows "수정 저장"
  - PATCH `{ action: "replace", ... }` instead of POST
- **What's reset:** line item inline edits, margin/finalPrice overrides, manually added line items (the rebuild starts fresh from `buildLineItems`).
- **What's preserved:** `estimateNumber`, `pdfSentAt`.
- **What's re-snapshotted:** all company info from current PricingSettings (so if user updated company phone after the original create, the edited estimate picks up the new phone).
- **What's NOT preserved:** the `extraCosts` array — those became line items at create time and are wiped + must be re-entered if needed. (We don't store the original extraCosts on the Estimate.)
- **Invariant — replace = 전체 재산정 (intended, 2026-06-12 외부 감사로 확정):** replace 는 단가를 **현재** PricingSettings(+제출된 overrides) 기준으로 다시 스냅샷한다. 그 사이 설정 단가가 바뀌었으면 수정 저장 시 새 단가를 흡수한다 — 이것이 정의된 동작. UI 도 고지함 (EstimateDetail `EditEstimateButton` 확인 다이얼로그: "회사 정보와 단가는 현재 단가 설정값으로 다시 snapshot 됩니다"). 이 문구를 약화시키지 말 것. 결제조건/유효기간 같은 메타만 고칠 땐 replace 가 아니라 action 10 (whitelist meta update) 경로를 쓴다 — 재산정 없음.

### PDF preview flow
- Estimate detail → "견적서 미리보기" button navigates to `/sites/[id]/estimates/[eid]/preview?detail=simple` (default).
- Preview page embeds `/api/estimates/[eid]/pdf?detail=simple|detailed` in an iframe — the PDF route returns `inline` disposition by default, `?download=1` forces attachment.
- A 간단/상세 toggle at the top of the preview switches `?detail=` query — Next router replaces the URL so back-button doesn't pile up history. The iframe `key={detailLevel}` forces a reload on toggle.
- The preview page has its own sticky action bar with PDF 저장 + 카톡 보내기. Save respects the current detail level (filename suffix 간단/상세). Only the share action marks `pdfSentAt`.

### Customer PDF layout (components/EstimatePDF.tsx) — v4
- **Header (dark navy `#1e2530`)**: company name + 사업자등록번호 + phone + address on left; 견적 번호 (`No. YYYY-NNN` auto-generated) + 발행일 + "X일간 유효" on right.
- **Customer + Site row** (two columns): 고객명 / 공사위치 on left; 시공면적 / 건물면적 / 공사일정 on right.
- **공사 범위**: single line of text joined by " · " (e.g. "칼라강판 지붕공사 (기존 지붕 덧씌우기) · 용마루 및 처마 마감 · 물받이 교체 · 폐기물 처리"). Built by `scopeOneLine()` which combines title + ridge/eave merge + gutter mode + scope flags + equipment blurb.
- **자재 spec pills**: pill row under scope — 제품명 / 두께 / 텍스처 / 색상.
- **견적 내역**: two modes (toggle via `?detail=` on the PDF route):
  - **simple** (`groupForSimple()`) — flat list of 5 buckets (자재 및 마감 / 시공비 / 장비 및 운송 / 철거 및 폐기 / 기타).
  - **detailed** (`groupForDetailed()`) — table with group subheaders: **자재공사 → 노무비 → 기타경비** (Korean industry-standard 3-category structure). Material items shown individually with 품명 / 규격 / 수량 / 금액 columns. Labor + meals + lodging rolled into one "인건비 (기공·조공)" line under 노무비. Subtotal row at bottom: "소계 (부가세 별도/포함)".
- **최종 견적 금액** card (`#f5f7fa` background): single line "최종 견적 금액 · 부가세 포함/별도" + amount on right.
- **결제 조건**: `parsePaymentStages()` parses the free-text paymentTerms into structured stages (e.g. "계약금 30% · 계약 시 / 잔금 70% · 완공 시"). When 2+ stages parsed, renders as side-by-side cards with derived amount + percent. Otherwise plain text fallback. Bank account (`bankAccountSnapshot`) appears below.
- **안내 + 서명**: numbered list of `noticeTextSnapshot` lines (auto-numbered 1, 2, …). Bottom-right: company name above + dashed 48px seal circle. If `sealImageUrlSnapshot` set, image renders inside; otherwise "(인)" placeholder text.

### Seal image upload
- Settings page → `SealAndNoticeCard` component → file picker → POSTs to `/api/upload` (same as photo upload, uses `supabaseAdmin()` to bypass RLS) → returned URL stored in `PricingSettings.sealImageUrl`.
- PDF embeds via `@react-pdf/renderer`'s `<Image src={url}>`. Must be a publicly accessible URL (Supabase Storage public bucket OK).
- User can clear the seal by clicking the X overlay (sets URL to empty string, server stores null).

### Estimate number auto-generation
- API: `POST /api/sites/[id]/estimates` counts the **current user's** estimates this year and assigns `YYYY-NNN` (3-digit pad). Count scoped via `site: { userId }` so number sequences don't leak between accounts.
- Formula: `seq = PricingSettings.estimateNumberStart + countThisYearForUser`. Default start = 1 → first estimate is `YYYY-001`. User can shift the start in 설정 → 견적서 (e.g. set to 100 when migrating from another system → first new estimate becomes `YYYY-100`).
- **Not reset on Jan 1** — user must manually set `estimateNumberStart` back to 1 if they want to restart numbering each year. (Auto-reset is a possible v0.1 add if anyone asks.)
- Low race-condition risk for v0 single-user-per-account app. Could add a unique constraint + retry later if it becomes an issue.
- Stored in `Estimate.estimateNumber` (snapshot — does not regenerate on edit).

### 공사 일정 field
- `Estimate.constructionMonth` is a `YYYY-MM` string snapshot (e.g. "2026-06"). PDF renders as "2026년 6월 중" via `formatMonth()`. No precise start/end dates — roofing is too weather-dependent.

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
- **react-pdf fonts must be full-coverage TTF/OTF, not Google Fonts chunks.** A URL like `fonts.gstatic.com/s/notosanskr/v36/...woff2` is a *subset* covering ~100 codepoints — render any Hangul outside the subset and react-pdf v4 will misbehave. Use a self-contained font. We use **Pretendard OTF** from `cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-{Regular,Bold}.otf`. Note the **`.otf`** extension — the same repo does NOT serve `.ttf` files (a 404 on the font URL surfaces as `Failed to fetch font from ...: 404 Not Found` and 500s the whole PDF route). Always wrap `Font.register` in try/catch and call `Font.registerHyphenationCallback((w) => [w])` to disable hyphenation (its default also returns null for unknown chars and contributes to the same crash class).
- **Never put `"use client"` on a component that's only imported by a server route.** `components/EstimatePDF.tsx` is rendered by the server-side PDF route through react-pdf's reconciler. With `"use client"`, Next.js replaces the export with a client-reference proxy when imported in a server module — the proxy doesn't execute the function during reconciliation, so the `<Document>` host node never appears, `container.document` stays null, and react-pdf throws `Cannot read properties of null (reading 'props')` at `react-pdf.js:139`. Same applies to any component that's only ever called from a route handler / server action / RSC.
- **react-pdf and `: null` JSX conditionals.** Patterns like `{cond ? <X/> : null}` inside a `<View>` can occasionally cause the same "null props" crash because react-pdf's children flattener doesn't strip `null` as cleanly as React DOM does. Prefer building child arrays via `.filter(Boolean).map(...)` or `.flatMap(...)` when conditionally including elements. `{cond && <X/>}` (without the `: null`) is also OK because react-pdf strips `false`.

## 우선순위 백로그 (2026-06-12 — 외부 감사 반영, 순서 고정)

이 순서는 의존성이다. 건너뛰면 되돌아오게 된다.

1. **절곡 포함/별도 확정** — 2026-06-12 대부분 해소 (자재 타입별 `finishingMethod` 설계 확정 — OPEN DECISION 참조). 남은 것: ① 절곡 단가 구성(자재 포함 여부) 사장님 확인, ② `finishingMethod` 구현.
2. **calculations.ts 핵심 함수 vitest** — 1번에서 확정된 수식 기준. 대상: `calcTotals`, `calcFromFinalPrice`, `distributeMarginForDisplay` (라운딩 스윕 ±1원, 빈 버킷 spill-over), `buildLineItems` 절곡 경로, `resolveEffectiveLossRate` 모드. **편의 기능보다 먼저** — 이후 작업들이 돈 계산 엔진을 건드릴 때의 안전망.
3. **마진 분배 비율 스냅샷** — "Margin distribution" 섹션의 외부 감사 fix. 컬럼 3개 + live 폴백. 작음 — 2번 직후 또는 2번과 같이.
4. **현장 즉시성 묶음** (calc 엔진 안 건드림 — 2번과 병행 가능): ① 폼 초안 localStorage 자동 저장, ② 빠른 견적 입구 (유형·면적·평당가 3입력 → finalPrice 역산으로 즉시 생성, 같은 Estimate 객체), ③ 견적 복사.
5. **override → 기본값 승격** — 견적 저장 시 "바꾼 단가 N개를 기본값으로 저장할까요?". 기본 단가표 수렴의 엔진.
6. **단가표 확정 → 프리셋** — 위 "내 단가 프리셋" 노트의 범위 규칙 준수.
7. **이력 기반 baseline / 포스코 데이터 보정** — 견적 이력이 쌓인 뒤.

## Documentation hygiene (you reading this)

When you make changes that affect setup, architecture, or invariants:

- Update **README.md** when: a new env var is needed, a new directory is added, the data model changes, a new top-level concept is introduced, deployment instructions change.
- Update **this file (AGENTS.md)** when: a new file becomes important enough to know where to find, a new convention is established, a new gotcha is discovered, a new "don't do this" rule emerges.
- Update **.env.example** any time `.env` gains a new key.
- Update **prisma migrations** by running `npx prisma migrate dev --name <description>` — never edit migration SQL by hand.
- Do **not** update **roofing_app_spec.md** — that's the user's living spec.

Add a short note to the commit message when you've touched docs. Future sessions trust docs over guessing.
