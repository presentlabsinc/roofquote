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
- PWA manifest at `app/manifest.ts` (proxy matcher 에서 제외 — 쿠키 없이 받아야 설치 가능), icons `public/icon.svg` + `icon-192/512.png` + `apple-touch-icon.png`

## Authentication (Supabase Auth)

Multi-tenant. Every page + API route requires a signed-in user; data is scoped by `userId` (the Supabase `auth.users.id` UUID stored as a string column).

- **Provider**: `@supabase/ssr` for cookie-based session in App Router.
- **Login methods**: Kakao OAuth, Google OAuth, email/password. Signup is closed during beta — admin creates accounts in the Supabase dashboard.
- **Files**:
  - `lib/supabase.ts` — `supabaseBrowser()` + `PHOTO_BUCKET` (browser-safe). `lib/supabase-server.ts` — `supabaseServer()` (async, cookies) + `supabaseAdmin()` (service role, server-only).
  - `lib/auth.ts` — `requireUser()`, `requireUserAndSettings()`, `getOrCreatePricingSettings()`.
  - `proxy.ts` (Next 16 — 구 `middleware.ts`) — session refresh + redirect unauthed pages to `/login`, 401 JSON for `/api`.
  - `lib/safe-redirect.ts` — `safeNextPath()`: 로그인 후 `next` 는 같은 사이트 내부 경로만 (오픈 리다이렉트 차단).
  - `app/login/` — sign-in page + form.
  - `app/auth/callback/route.ts` — OAuth return URL → exchange code for session → forward to `next`.
  - `app/api/auth/logout/route.ts` — POSTs sign out, redirects to /login.

### 🔐 인증 검증 패턴 (2026-09-28 보안 수정) — 신원은 검증된 토큰의 `sub` 에서만
- `requireUser()` / `getUser()` (lib/auth.ts) 는 `supabase.auth.getClaims()` — access token **서명 검증** 후
  `claims.sub` 로 신원 결정 (비대칭 키면 JWKS 로컬 검증 = 네트워크 0, 대칭 키면 Auth 서버 확인).
- **⚠️ `getSession().session.user` 로 신원을 정하지 말 것.** 그 객체는 쿠키 JSON 을 서명 검증 없이 돌려준다 —
  2026-06-12 성능 패스에서 그렇게 바꿨다가, 정상 계정 보유자가 쿠키의 user.id 만 남의 UUID 로 바꾸면 다른
  테넌트로 행세할 수 있는 구멍이 됐다 (9/27 점검 #57). proxy 는 토큰만 검증하고 신원을 하류로 넘기지 않는다.
- `proxy.ts` 도 `getClaims()` — 만료 토큰 갱신(setAll 로 쿠키 기록) + 미인증 리다이렉트/401. **이중 방어:**
  proxy matcher 를 잘못 고쳐도 라우트가 스스로 검증한다. matcher 는 `/api/:path*` 를 확장자와 무관하게 항상 포함
  (구 matcher 는 `/api/x.png` 같은 경로를 건너뛰었다).
- 리다이렉트/401 응답에도 갱신된 세션 쿠키를 실어 보낸다 (`withCookies`).
- 페이지 내 독립 쿼리는 `Promise.all` 병렬 (home: 설정+현장목록, 견적상세/PDF: 견적+설정).
- `next.config.ts` `experimental.staleTimes.dynamic: 30` — 클라이언트 라우터 캐시 30초.
  탭 이동/뒤로가기가 30초 내 재방문이면 서버 왕복 없음. 변경 직후 화면은 폼들이
  `router.refresh()` 를 호출하므로 stale 안 보임.

### Data ownership rules
- `PricingSettings.userId` is `@unique` — exactly one settings row per user. Created lazily on first request via `getOrCreatePricingSettings()`.
- `Site.userId` is indexed; `Estimate` ownership flows through `Site` (no own column).
- All queries use either `findFirst({ where: { id, userId } })` or `findFirst({ where: { id, site: { userId } } })`. Never plain `findUnique({ id })` — that leaks across users.
- Mutations use `updateMany`/`deleteMany` with the ownership filter so the check is atomic with the write (avoids find-then-update race).
- **본문으로 들어온 하위 ID 도 소속 확인** — 예: 견적 PATCH 의 `lineItemId` 는 그 견적의 라인인지 확인하고
  `updateMany/deleteMany({ id, estimateId })` 로 쓴다 (2026-09-28 — URL 의 견적만 확인하고 라인 ID 는 안 봐서
  다른 사용자의 라인을 고칠 수 있었다).
- **입력 검증:** 견적 생성·전체 수정은 `lib/estimate-input.ts` `parseEstimateBody()` (타입·범위 → 400 한국어 메시지),
  설정 저장·프리셋 적용은 `lib/settings-input.ts` `sanitizeSettingsData()` (Prisma DMMF 기준 화이트리스트).
- **RLS:** 모든 public 테이블에 Row Level Security 켜짐 (정책 없음 — migration `20260928030100_enable_rls`).
  앱은 Prisma(테이블 소유자)로만 접근해서 영향 없고, 브라우저에 공개된 anon 키의 Data API 접근은 차단.
  **새 테이블을 만드는 마이그레이션은 반드시 `ENABLE ROW LEVEL SECURITY` 를 같이 넣을 것.** FORCE 는 쓰지 말 것 (Prisma 도 막힘).
- **스토리지:** 업로드 경로는 `<userId>/<uuid>.<ext>` (`/api/upload` — 라우트 인증 + 매직 바이트로 형식 판별).
  사진 삭제·현장 삭제 시 `lib/storage.ts` `removeOwnedObjects()` 가 **본인 폴더 파일만** 지운다. 직인 이전 파일은
  과거 견적 스냅샷이 가리키므로 지우지 않는다. 발송 PDF 는 별도 **비공개** 버킷 — 아래 '발송 PDF 보관'.

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

### 2. Estimate snapshots company **and customer** info
- `Estimate.company*Snapshot` (회사명·연락처·주소·사업자번호·직인·계좌·안내문) are populated at creation from `PricingSettings`.
- 2026-09-28~: `customerNameSnapshot` / `siteAddressSnapshot` / `margin{Material,Labor,Profit}RatioSnapshot` / `issuedAt`
  도 생성 시 박제 (`lib/estimate-input.ts` `snapshotColumns()`). 전체 수정(replace = 재발행)만 다시 스냅샷한다.
  기존 견적은 마이그레이션 백필로 그날 값을 박제. Never re-fetch from `PricingSettings`/`Site` when re-rendering a PDF
  (스냅샷 null 인 경우만 라이브 폴백).

### 3. Customer PDF shows snapshot data only
- [components/EstimatePDF.tsx](components/EstimatePDF.tsx) renders only from `Estimate` + `EstimateLineItem` fields (+ 라우트가 미리 받은 직인 버퍼).
- No internal cost, no margin, no labor/meal/lodging itemization. 간단 PDF 는 5버킷 + 공급가액/부가세.
  상세 PDF 는 표준품셈 형식이라 품목별 **마진 분배 후** 단가·이윤 줄을 보여준다 (원가가 아님 — 2026-06-16 사용자 결정).
  직접 고친 라인처럼 단가×수량 ≠ 금액이면 단가 칸은 '—'.
- Internal-only data (margin, line costs, etc.) is shown only in the in-app `EstimateDetail` UI for the salesperson.

## Where to find what

| Concern | File |
|---|---|
| DB schema | [prisma/schema.prisma](prisma/schema.prisma) |
| Pricing / calc logic | [lib/calculations.ts](lib/calculations.ts) — `buildLineItems`, `calcTotals`, `calcFromFinalPrice`, `calcFromSupplyPrice`(평당가·번개 견적 공용), `THICKNESS_MULT` |
| Type defs (ConstructionType, MaterialType, ScopeFlags, GutterMode, SubstructureType, ExtraCost, color presets, scope maps) | [lib/types.ts](lib/types.ts) |
| Catalog defaults + helpers | [lib/catalog.ts](lib/catalog.ts) — `DEFAULT_CATALOG`, `CATALOG_CATEGORIES`, `groupCatalog`, `categoryToLineItemCategory` |
| Prisma client | [lib/prisma.ts](lib/prisma.ts) — singleton, no adapter |
| Supabase clients | [lib/supabase.ts](lib/supabase.ts) (browser) · [lib/supabase-server.ts](lib/supabase-server.ts) (`supabaseServer`, `supabaseAdmin`) |
| 공장 기본값 (유일한 출처) | [lib/defaults.ts](lib/defaults.ts) — `FACTORY_DEFAULTS` (신규 계정·설정 '공장 기본값'·옛 프리셋 채우기 공용, 스키마 @default 와 테스트로 일치 검사) |
| 견적 입력 검증·계산·스냅샷 | [lib/estimate-input.ts](lib/estimate-input.ts) — POST·replace 공용 (`assertMoneyFitsDb` = 금액 32비트 범위 → 400) |
| 새 견적 기본값·자동값 (폼·번개 견적 공용) | [lib/estimate-defaults.ts](lib/estimate-defaults.ts) — 면적 자동값(`autoBasePerimeter` 등), `constructionTypeDefaults`, `NEW_ESTIMATE_DEFAULTS`, `EstimateFormPayload`(폼 제출 모양), `defaultEstimatePayload` |
| 견적 생성 공용 (번호·라인·합계·스냅샷) | [lib/estimate-create.ts](lib/estimate-create.ts) (server-only) — `createEstimate`, `companyNameError` — 일반 POST·번개 견적 공용 |
| 번개 견적 | [lib/quick-estimate.ts](lib/quick-estimate.ts) (본문 검증·공급가·미리보기, 순수) · `app/api/sites/[id]/estimates/quick/route.ts` · `app/sites/[id]/estimates/quick/` (화면) |
| 설정 저장 검증 | [lib/settings-input.ts](lib/settings-input.ts) |
| 스토리지 경로·정리 | [lib/storage.ts](lib/storage.ts) (서버) · [lib/upload-photo.ts](lib/upload-photo.ts) (폰에서 줄여 업로드, EXIF 제거) |
| 프리셋 스냅샷 범위/헬퍼 | [lib/presets.ts](lib/presets.ts) — `PRESET_EXCLUDE`, `extractPresetSnapshot`, `applyPresetSnapshot` |
| 프리셋 API | `app/api/presets/route.ts` (생성) + `app/api/presets/[id]/route.ts` (activate/overwrite/undo/rename/delete) |
| 견적 폼 초안 자동 저장 | [lib/estimate-draft.ts](lib/estimate-draft.ts) (키·저장·만료·payload→초기값·자동 저장 규칙 `DraftAutosaver`, React 없음) · `app/sites/[id]/estimates/new/use-draft-autosave.ts` (디바운스·즉시 저장) · `EstimateFormWithDraft.tsx` (복원 배너) |
| 테스트 | `lib/__tests__/calculations.test.ts` + `presets.test.ts` + `hardening.test.ts`(9/28 보안·신뢰 회귀) + `estimate-draft.test.ts` + `pdf-render.test.ts`(저장소 폰트로 오프라인 PDF 렌더) + `sent-pdf*.test.ts`(발송 PDF 경로·버킷·라우트·공유 후 기록 — 가짜 Supabase/Prisma/fetch, `vi.mock("server-only")`) + `quick-estimate.test.ts`(번개 견적 기본 payload·공급가 합계·검증·면적 상한·저장 범위·생성 라우트) — `npm test` (vitest, 257케이스, `vitest.config.mts` = `@/` 별칭). CI: `.github/workflows/ci.yml` (tsc·test·lint) |
| Estimate creation API | [app/api/sites/[id]/estimates/route.ts](app/api/sites/[id]/estimates/route.ts) (일반) · `estimates/quick/route.ts` (번개 견적) — 둘 다 `lib/estimate-create.ts` |
| Estimate edit API (11 actions) | [app/api/estimates/[eid]/route.ts](app/api/estimates/[eid]/route.ts) — see "Estimate edit API" below |
| PDF generation (inline / download) | [app/api/estimates/[eid]/pdf/route.ts](app/api/estimates/[eid]/pdf/route.ts) — `?download=1` for attachment, otherwise inline for iframe |
| Photo upload | [app/api/upload/route.ts](app/api/upload/route.ts) — requireUser + 매직 바이트 판별(JPEG·PNG·WebP·GIF·HEIC) + 4MB, `supabaseAdmin()` |
| 발송 PDF 보관 | [lib/sent-pdf.ts](lib/sent-pdf.ts) (server-only, 비공개 버킷 입출력) · [lib/sent-pdf-path.ts](lib/sent-pdf-path.ts) (경로 규칙·검증, 순수) · `app/api/estimates/[eid]/sent-pdf/` (POST 보관·GET 목록) + `sent-pdf/[name]/` (GET 열람) |
| PDF 응답 파일명 | [lib/content-disposition.ts](lib/content-disposition.ts) — RFC 5987 한글 파일명 (PDF·보관본 라우트 공용) |
| 오류 화면 | `app/error.tsx` (Next 16.3: `retry` prop), `app/global-error.tsx`, `app/not-found.tsx` |
| Main mobile UI screens | `app/{page,settings,sites/...}/*.tsx` |
| Shared chrome | `components/AppHeader.tsx`, `components/BottomNav.tsx` |
| Reusable widgets | `components/CatalogPicker.tsx`, `components/ui/number-stepper.tsx` |
| PDF document component | [components/EstimatePDF.tsx](components/EstimatePDF.tsx) — `EstimatePDFDoc`, helpers: `buildWorkTitle`, `scopeOneLine`, `materialLabel`, `customerName`(내부 표기 제거), `formatDateKST` |
| PWA shell | `app/layout.tsx`, `app/manifest.ts`, `app/globals.css` |

## Convention notes

- All money fields are `Int` (Korean Won — no decimals). Format with `formatKRW()` from `lib/calculations.ts` or `.toLocaleString("ko-KR")`.
- Korean text is the user-facing default. Code comments may be English. Commit messages: either is fine but match what nearby commits use.
- Mobile-first. Max width container is `max-w-lg`. All touch targets ≥ 44px. Use the `pressable` utility from `globals.css` for tactile feedback.
- All input fields have `font-size: 16px` minimum to prevent iOS Safari from auto-zooming on focus.
- Korean numerals: prefer `tabular-nums` Tailwind class wherever money or counts are displayed so digits align.
- **UI 도움말 문구 원칙 (2026-06-12 사용자 피드백): 도메인 지식을 설명하지 말 것.** 사용자는 지붕 전문가다 — "절곡 단가에 자재비 포함" 같은 업계 상식 설명은 노이즈(그건 개발자 자신을 위한 메모). 도움말은 **앱이 무엇을 하는지**(예: "길이 ÷ 3m 규격 → 개수로 자동 환산", "여기서 고르면 자동 라인 대신 적용")만 안내한다.
- Photo URLs in `Site.photos` are Supabase Storage public URLs rendered with `<img>`. `images.remotePatterns` 는 **일부러 비워 둠** (2026-09-28) — 공개 버킷을 허용하면 `/_next/image` 가 인증 없이 우리 파일을 sharp 로 처리하는 입구가 된다. next/image 도입 시에만 추가.
- **숫자 입력칸은 `components/ui/buffered-number-input.tsx`** — 입력 중엔 친 글자 그대로(소수점 %·빈 칸 가능), 값만 부모에 올림. 매 키 입력마다 반올림해 다시 그리는 입력칸을 새로 만들지 말 것.

## Working on this repo

### ⚠️ 로컬 `.env` = 운영 DB — 마이그레이션 절차 (2026-09-28)
로컬 `.env` 의 DATABASE_URL/DIRECT_URL 은 **운영 Supabase** 다. `npx prisma migrate dev` / `db push` 를 로컬에서
돌리면 운영 스키마가 즉시 바뀐다 (개발용 DB 분리 전까지 금지). 대신 **오프라인 diff** 로 마이그레이션을 만든다:
1. `git show HEAD:prisma/schema.prisma > <temp>/schema_head.prisma`
2. `npx prisma migrate diff --from-schema-datamodel <temp>/schema_head.prisma --to-schema-datamodel prisma/schema.prisma --script`
   → 출력(Prisma 가 생성한 SQL)을 `prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql` 로 저장. 백필·RLS 같은
   스키마로 표현 못 하는 SQL 은 그 아래에 주석과 함께 덧붙인다 (Prisma 문서의 custom migration 방식).
3. `npx prisma generate` (오프라인). 운영 적용은 `npm run build` → [scripts/build.mjs](scripts/build.mjs) 가 한다:
   `VERCEL_ENV=production` 일 때만 `prisma migrate deploy` 후 `next build` (migrate 실패 = 빌드 실패).
   프리뷰 배포·로컬·CI 빌드는 migrate 하지 않는다. Vercel 대시보드 Build Command 를 따로 지정하면 이 분기가
   우회되니 비워 둘 것.

### Adding a new field to Estimate
1. Update [prisma/schema.prisma](prisma/schema.prisma) — make new fields nullable or add a default for backward compat
2. 위 오프라인 diff 로 마이그레이션 생성 + `npx prisma generate` (dev server 가 떠 있으면 DLL 잠김 — node 먼저 종료)
3. `lib/estimate-input.ts` 의 `parseEstimateBody`(검증) + `estimateColumns`(저장) — POST·replace 가 같이 씀
4. Update the form + the EstimateDetail UI. 폼 payload 에 칸을 더하면 `lib/estimate-defaults.ts` 의 `EstimateFormPayload` 와
   `defaultEstimatePayload`(번개 견적 — 새 견적 기본값)도 같이 (타입이 빠진 쪽을 컴파일 오류로 알려 줌)
5. Update [components/EstimatePDF.tsx](components/EstimatePDF.tsx) if it should appear on the PDF (스냅샷 필드만!)
6. Type check: `npx tsc --noEmit`. Test: `npm test`. Lint: `npx eslint .`. Build: `npm run build` (DB 안 건드림)

### Adding a new construction type / scope item
- Construction types: extend `ConstructionType` and `CONSTRUCTION_TYPES` in [lib/types.ts](lib/types.ts), then handle in `buildLineItems` ([lib/calculations.ts](lib/calculations.ts)), `SCOPE_BY_TYPE`, the form, and the PDF helpers (`buildWorkTitle`, `scopeOneLine`).
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
  **건물형태 미선택 = ㅁ자 기본 (2026-07-07)** — `buildLineItems` 가 `buildingShape ?? "rectangle"` 로
  geom 을 **항상** 계산 (구 √면적×0.8 원시 폴백 제거). ㄱ/ㄷ 선택 시 둘레·프래싱이 커짐.
  폼도 새 견적에서 ㅁ자 기본 선택. 지붕형태 미선택은 박공(gable) 기본 (기존 동작).

**Perimeter is type-specific** — `estimateBasePerimeter(constructionType, ...)`:
- `roof`: √(시공면적÷1.4) × shapeFactor **+ 8×처마돌출**(eaveOverhangCm). 기존 지붕 재시공.
- `rooftopRoof`: √(시공면적) × shapeFactor — **no ÷1.4, no overhang** (새로 짓는 지붕이라
  시공면적 자체가 외곽 footprint). 처마 돌출 입력 폼에서 숨김.
- `steelWaterproof`: 난간 둘레(`railPerimeterM`)는 폼이 **바닥 기준 역산 자동값**을 채우고 사용자가 고칠 수 있음
  (아래 '면적 → 전체 자동 채움'), 옥탑 둘레(`rooftopStructurePerimeterM`)는 직접 입력.

**Bending cost** = `calcBendingCost(widthMm, lengthM, pricePerMmPer3m)` = `width × unit × (length/3)`.
Widths per 부재 in settings (`bendingWidthRidge` 등), unit `bendingPricePerMmPer3m` (기본 36).

**Per-type line generation** (all gated on scope flags; user edits after):
- roof / rooftopRoof: 용마루 — **마감 방식에 따라 절곡 라인 또는 기성품 개수 라인 중 하나만** (`finishingMethods`, 아래 RESOLVED 섹션), 처마/덴조 **건당 시공(labor)** (구 "처마 마감 m당" 라인은 6/1 리팩토링에서 제거 — `eavePricePerM` 은 미사용, `bendingWidthEave` 는 옥탑 트림 넓이로만 재사용), 프래싱 절곡(꺾인 건물), 물받이 OR 엔드캡, 하지, 철거(roof만).
- steelWaterproof: 두겁/미시/프래싱 절곡, 파라펫 강판(난간둘레×높이), 옥탑 외벽 강판(옥탑둘레×옥탑높이),
  옥탑 문/창 트림(개수×평균둘레), 처마/덴조, 스테인리스 배수로, 홈통, 배수구 타공.
- 공통 소모품 (**항상 자동 — 건물형태 불필요**, 2026-06-17): 스크류 대(면적×2/㎡), 스크류 소(절곡길이×3.3/m), 실리콘(접합부÷6m). 길이 기반은 절곡 라인 없으면 0 → 라인 생략.
- 단열재(insulationTypes multi-select), PE폼(hasPeFoam, 기본 ON — 강판/바닥에 ㎡당 추가).

**Loss rate** — `resolveEffectiveLossRate(lossRateMode, roofShape, manualRate)`:
`PricingSettings.lossRateMode` = `"auto"` (지붕형태별 ROOF_SHAPE_FACTORS lossRate) | `"manual"`
(항상 defaultLossRate). **적용 대상: 본 강판·파라펫·PE폼·스크류(대)** — 하지·절곡·부자재 미적용. 토글 off면 0.
**사용자가 폼에서 로스율을 직접 고치면(`lossRateManual`) 그 값이 자동 모드보다 우선** (2026-09-28 — 이전엔 자동 모드가
입력값을 조용히 덮어씀). 새 견적의 토글 초기값은 설정 `useLossRateByDefault` (공장값 true — 9/28 전엔 폼이 설정을 무시하고 항상 켰음).

**소비 계수는 설정에서 조정 가능 (2026-06-15) — 자재마다 자연 단위:**
- 하지: 개/㎡ (목재 1.4, 철재 0.76) + 개당단가. 면적 기반.
- 스크류 대: `screwLargePerSqm`(개/㎡, 면적 기반). 스크류 소: `screwSmallPerBendM`(개/절곡m, 길이 기반).
- 실리콘: `siliconeCoverageM`(1개 커버 m, 길이 기반).
- 설정 카드에 평당 갯수·평당 금액 표시 (업자가 감으로 검증하는 정보 — 사용자 피드백).
- **driver 2종**: 면적 기반(시공면적 ㎡ — 항상 입력) vs 길이 기반(부재 길이 — 형태에서 기하 추정 + √면적 폴백).
  길이 기반은 평당으로 우기지 않음(정사각/길쭉 건물이 같은 평수라도 길이 천차). 단가만 설정, 길이는 자동/직접입력.

**면적 → 전체 자동 채움 (2026-06-17 사용자 요구: "면적만 넣고 계산 눌러도 근사 견적"):**
- 폼이 면적 입력 시 자동 채움 (사용자가 만진 필드는 touched ref 로 보존, 수정 모드는 기존값):
  난간 둘레 (스틸방수) = **바닥 기준 역산** (2026-07-08): 시공면적 A 에 난간 벽 양면(2Ph)이 포함되는
  측정 관행이라 P = −f²h + f·√(f²h² + A) (f = 형태계수 ㅁ4.2/ㄱ5.0/ㄷ5.5, h = 파라펫 높이 m).
  √A×f 그대로 쓰면 ~20% 과대. 형태 바꾸면 수동 입력도 갱신 (둘레 자동 채움과 동일 규칙).
  배수로 = max(10, √면적) — **건물 한 면 길이** (사용자 룰:
  30평 건물 한 면 ≈ 10m), 작업일수 = max(2, ceil(면적/90)) (샘플 실측: 215㎡=3일, ~100㎡=2일).
  물받이 길이는 건물형태 없어도 rectangle 폴백으로 자동.
- 스틸방수 기본 scope 에 handrail+cap 포함 (옥상엔 파라펫이 사실상 항상 있음 — 없는 현장만 해제).
- % 심플 라인 표시: 수량 = 12(%), 단가 = 자재비의 1% (구 0.12 표시 버그 수정).

**설정 노브 전면 개방 (2026-07-09) — "엔진이 쓰는 돈 숫자는 전부 설정에서":**
- 신규 컬럼 6종: `catalogPrices`(카탈로그 아이템 단가 override, 기성품 자동 라인+상세 모드 공용),
  `thicknessMultipliers`(두께 배수), `roofShapeLossRates`(형태별 자동 로스율),
  `constructionToBuildingRatio`(1.4), `workDaysAreaDivisor`(90), `drainageWorkCost`(배수구 처리 —
  구 폐기물×0.5 파생 폐기). `catalogDefaults` 는 그룹 심플 기본값 편집기(GroupDefaultsCard)로 노출.
- 설정 카드: 두께 배수 / 추가 자재 기본값 / 카탈로그 단가표(접힘, N개 변경 뱃지) / 형태별 로스율.
  JSON override 는 전부 "빈 칸 = 공장 기본(placeholder 표시)" 패턴 — 프리셋에도 자동 포함.
- **의도적으로 하드코딩 유지 (B급 기하 상수)**: 형태 둘레계수(4.2/5.0/5.5), ridge/eave ratio,
  장단비 1.5, 옥탑 문 6m/창 4m, 여유율 1.10, 물받이 면 가중치 — 물리 근사라 만질 일이 드물고
  설정 폭발 방지. 필요해지면 그때 개방.

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

**✅ RESOLVED + 구현 완료 (2026-06-12) — 절곡 이중 계산 해소. `finishingMethods` 시스템:**

**현장 실태 (사용자 확인):** 마감 방식은 자재 타입에 따라 갈린다.
- **징크250 코루게이티드 (현재 주류):** 용마루·미시·후레싱(현장 용어 "페이샤") 전부 **절곡 제작**.
  기성품(멀티용마루·미시)을 쓰는 경우도 일부 있음.
- **기와형 (일반기와/전통기와):** 기성품 사용 — 용마루·하우마끼·대봉·소봉. 단 시골 외엔 수요 감소 추세.
- 기성품 단가는 카탈로그에 이미 있음: `finishing` (용마루 고전/일자/멀티, 용마루캡),
  `roofingExtras` (대봉/소봉/양면소봉) — 천보 실단가.

**구현된 설계 — `finishingMethods` 부재별 JSON (혼합 사용 지원, 견적 단위 → 부재 단위):**
- 저장: `Estimate.finishingMethods Json @default("{}")` — `{ ridge: "bending"|"ready", mishi: ..., fascia: ... }`.
  helpers: `lib/types.ts` `defaultFinishingMethod` / `resolveFinishingMethod` / `FINISHING_MEMBER_LABELS`.
- default: `materialType ∈ {generalTile, traditionalTile}` → 전 부재 `ready`, 그 외 → 전 부재 `bending`.
  사용자가 명시적으로 고른 부재만 JSON 에 저장 — 자재를 바꾸면 안 고른 부재는 default 따라감.
- 폼 UI: **5번 추가 자재 섹션 맨 위** "용마루 마감 방식" 세그먼트 칩 (지붕/옥상지붕 + scope.ridge 일 때만).
  공사 범위(자재 선택보다 앞)에 두면 자재 기반 기본값이 의미를 잃고 위쪽에서 몰래 바뀌는 문제
  (2026-06-12 피드백) — 반드시 자재 선택(3번) 뒤, 마감재 카드 바로 위에 둘 것.
  **미시 칩은 폼에 안 둠** — 스틸방수에서 기성품 미시는 거의 안 씀 (사용자 확인 2026-06-12);
  엔진은 `finishingMethods.mishi` 를 지원하므로 필요 시 칩만 복원. fascia 는 자동 라인이
  아직 없어 UI 미노출 (키만 예약).
- 라인 생성 규칙: **부재당 정확히 한 라인.**
  - `bending` → 절곡 라인 (현행 공식, **단가에 자재비 포함**). `용마루 마감`(ridgePricePerM) 라인 삭제됨.
    구 buildingShape 가드도 제거 — 건물형태 없어도 √면적 추정 길이로 절곡 라인 생성.
  - `ready` (용마루) → 개수 라인: ceil(추정 길이 ÷ 3m) × 카탈로그 천보가. 기와형 → `ridgeClassic`(14,300),
    그 외 → `multiRidge`(13,200). **중복 가드**: 카탈로그 상세에서 용마루 본체(`READY_RIDGE_KEYS`)를
    이미 골랐으면 자동 라인 생략. 하우마끼/대봉/소봉은 카탈로그 현행 유지.
  - `ready` (미시) → 자동 절곡 라인 생략, 사용자가 카탈로그에서 기성품 선택 (폼에 힌트 표시).
- **레거시 정리**: `ridgePricePerM`/`eavePricePerM`/`capBendingPricePerM` 은 엔진 미사용 —
  설정 카드·override UI 에서 행 제거 (DB 컬럼은 구버전 호환으로 유지). override 그룹에
  `bendingPricePerMmPer3m`(절곡 단가) 추가 — 이제 이게 마감 부재들의 실질 단가 노브.
- 테스트: `lib/__tests__/calculations.test.ts` (vitest, `npm test`) — 마감 방식 분기 + 이중 계산
  회귀 방지 + calcTotals/calcFromFinalPrice/마진 분배 라운딩 스윕/로스율 (2026-10-01 기준 전체 257케이스).

**✅ RESOLVED (2026-06-12 사용자 확인):** 절곡 단가(`bendingPricePerMmPer3m` 기본 36원)는
**자재비 + 절곡 가공비 모두 포함.** 함의:
- 절곡 라인은 self-contained 자재 라인이다 — 절곡 부재의 강판 자재가 본 강판 면적 라인과 겹치지 않음.
- 시공(설치) 인건비는 별도 — 공통 인건비 라인이 커버 (현행 구조 그대로).
- 로스율이 절곡 라인에 안 붙는 현행 동작도 유지 (단가가 이미 완성품 가격).

(과거 이중 계산 지점은 용마루 하나였음 — `용마루 마감` m당 라인과 `용마루 절곡` 라인이
같은 길이에 둘 다 emit. 아래 구현으로 삭제됨. 두겁/미시/프래싱/트림은 원래 절곡-only,
처마는 건당 시공이라 무관.)

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
  - 지붕/옥상지붕: 물받이 Section — 4면 칩(기본 **앞·뒤 2면**, 2026-07-08) + 길이(자동: 처마외곽둘레 × 면가중치 앞30/뒤30/좌20/우20%) + **선홈통 개수(기본 4개, 단가 표시)**. 선홈통 라인은 이제 전 유형 공통 (`downspoutCount × downspoutUnitPrice`).
  - steelWaterproof: "배수로 / 물받이" Section — 스테인리스 배수로 길이 + 홈통 개수(`downspoutCount`) + **차양 물받이(옵션, gutterLength 재사용)**. 배수로 길이 0 이면 confirm.
  - 카탈로그 `gutter` 그룹 라벨은 전 유형 동일 "물받이 부속" (구 스틸방수 override 는 2026-07-07 제거).
- **물받이 라인은 더 이상 type-gated 아님** — `buildLineItems` 가 `gutterLengthM>0 && gutterMode!=none` 이면 유형 무관 emit (스틸방수 gutterMode="full" → 라벨 "차양"). 스테인리스 배수로 라인은 steelWaterproof 전용으로 별도.
- **엔드캡** — 기와지붕 외엔 거의 안 써서(보통 접어 마감) 별도 UI 제거. 필요 시 카탈로그 finishing 에서 선택.
- **난간 / 두겁** (steelWaterproof) — `handrail` 토글 시 `SCOPE_FORCES`로 `cap` 자동 ON. 토글 아래 **파라펫 높이 + 난간 둘레** 직접 입력. 두겁/미시 = 난간(+옥탑) 둘레 기반. (옛 `capLengthM` 직접입력은 deprecated — 둘레로 계산.)
  - **파라펫 분리 (2026-06-16 사용자 확인): 시공면적엔 난간(벽 양면) 면적까지 포함해 측정하는 관행.** 벽 안쪽 면(둘레×높이)은 파라펫 자재("parapet" 단가), 바깥 면은 일반 강판. 그래서 `파라펫 (난간 안쪽)` 라인은 **추가가 아니라 본 강판 면적에서 분리** — `buildLineItems` 상단 `parapetFaceArea` 를 본 라인에서 빼고 파라펫 라인으로 발행 (areaM2/2 클램프). 구 "파라펫 강판 (난간) = 둘레×높이×1.1 추가" 모델은 이중 계산이라 폐기.
- **옥탑 구조물** (steelWaterproof) — `rooftopStructure` 토글 시 아래 **둘레 / 높이(`rooftopStructureHeightCm`) / 출입문 수 / 창문 수** 입력. 옥탑 외벽 강판 + 문/창 트림 절곡 생성.
- **하지작업** uses `SubstructureType` (`wood | steel`) plus a "없음" UI option (없음 = 하지 없이 덧방). **개수 × 개당단가 모델 (2026-06-15)**: 자재 = `시공면적 × 개/㎡ 계수 × 개당 매입단가`, 개수 올림(발주 단위), 로스율 미적용(계수가 곧 소비 규칙). 목재 30×60 격자 → 1.4개/㎡ × 3,333원, 철재 30×80 → 0.76개/㎡ × 14,000원(업자용 단가, 2026-07-07). 설정 `SubstructurePricingCard`(개당단가 × 개/㎡ → ㎡당 환산, 평당 표시). 단가는 매입원가 — 고객 부풀림은 마진 분배. 레거시 `substructureWoodPricePerSqm`/`Steel` 컬럼은 미사용(호환 유지). 목재=붙임, 철재=띄움.
- **부대비용 (경비) — 2026-06-16:** 운송·식대는 항상, 숙박·팀경비·제경비는 토글 (`Estimate.includeLodging`/`includeTeamExpense`/`includeInsurance`, 폼 노무비 섹션).
  - **식대·간식**: 인원×일수×`mealCostPerPersonMeal`(기본 20,000 = 점심1만+음료/간식1만). 항상.
  - **숙박**: `includeLodging`(기본 OFF — 로컬은 숙박 없음). 박수 = `Estimate.lodgingNights` 직접 입력 우선, null 이면 작업일수−1 자동. 인원×박수×`lodgingCostPerPersonNight`(기본 35,000 = 2인실 7만÷2).
  - **경비 3종 모두 폼에서 인라인 조정 (2026-07-08)**: 제경비 %·팀경비 금액은 `pricingOverrides` 로 (견적별 절대값), 숙박 박수는 `lodgingNights`. 단가 자체는 설정에서.
  - **팀 경비(잡비)**: `includeTeamExpense`(기본 OFF). `teamExpenseAmount`(기본 150,000) lump sum, 인력 직접비. category "other".
  - **제경비(산재·고용보험)**: `includeInsurance`(기본 ON). 노무비(labor category 합)×`insuranceRateOfLabor`(기본 0.05 = 산재3.73+고용1.01≈4.74 반올림). 일용직에도 산재·고용은 적용 → 소규모도 포함. 건강/연금/퇴직(정규직)·안전관리비(대형)는 제외(샘플 견적이 그렇게 함). category "other".
  - **회계 구분**: 운송·식대·숙박·팀경비·제경비 = 모두 "경비(기타경비)", 노무비 아님. 회사 일반관리비(overhead)는 마진에 포함(별도 분리 안 함 — 대형 공사 아닌 소규모 대상이라 단순 유지).
  - **고객 PDF 노출 (2026-06-16)**: 숙박비(category lodging)·팀경비(name "팀 경비")는 고객 견적서에 별도 라인으로 안 나오고 **시공비/인건비에 녹임** (내부 EstimateDetail 엔 그대로 보임). 제경비(보험)는 정식 항목이라 노출 유지.
- **폐기물** uses `wasteTruckCount` (defaults 1). Cost = `wasteDisposalCost × wasteTruckCount` (per truck, 기본 ₩1,000,000).
- **비계** = `area × days × scaffoldPricePerSqmDay`. area 0 이면 legacy `scaffoldDailyCost × days`.
- **새 배수구 타공 (drainHole)** scope flag + count stepper. **원가 0(다 마진)이 기본** (2026-06-16 사용자 확인) — `drainHolePrice` 기본 0, 단가 설정 시에만 원가 라인. 청구는 마진/최종가로.
- **PE폼 (hasPeFoam, 기본 ON)** — 강판 종류 섹션 체크박스. 강판 면적 × `peFoamPricePerSqm`. 견적서 PDF에선 강판 라인에 합산 표시(`mergePeFoamIntoMaterial`), 내부는 별도 라인.
- **단열재 (insulationTypes, multi-select)** — 스티로폼(EPS)/아이소핑크(XPS)/경질우레탄폼(PIR)/열반사단열재/기타. 기타 선택 시 `insulationNote`. 면적 × `insulationPricePerSqm`.

### Numeric stepper
- `<NumberStepper>` ([components/ui/number-stepper.tsx](components/ui/number-stepper.tsx)) — round −/+ buttons flanking a typeable input. Use for fields with a small natural range (1-30 ish): 작업 일수, 인원, 장비 사용 일수, 카탈로그 항목 수량.
- Don't use for wide-range numerics (면적, 가격) — plain inputs are better.

### Catalog system — 4그룹 카드 (2026-06-12 재설계 → 2026-06-16 절곡 분리)
**UI/심플모드는 4그룹** (마감재·부자재·물받이부속·절곡), 천보 8분류는 상세 모드 안의 소제목으로만
유지. 사용자 피드백: "8개 카드는 도매상 단가표 구조지 현장 멘탈 모델이 아니다."
절곡은 기성품 고르기가 아니라 치수 계산이라 마감재에서 분리 (2026-06-16).

`lib/catalog.ts` `CATALOG_GROUPS` (2026-06-16 절곡 분리 후 4그룹):
- **finishing "마감재 (기성품)"** = finishing + roofingExtras 분류. 기성품 제품 고르기만.
- **accessory "부자재 (피스·실링 등)"** = fastener + sealing + substructure + translucent 분류.
- **gutter "물받이 부속"** = gutter 분류. 라벨은 전 유형 동일 (구 스틸방수 "배수로/물받이 부속" override 제거 — 배수로는 시공 범위 섹션에 별도, 이 그룹은 추가 물받이 부속용. 2026-07-07). 스틸방수는 기본 체크 해제.
- **bending "절곡"** = bending 분류. **상세 모드가 특수** — 아이템 목록이 아니라 "총 넓이(mm)" 한 칸
  입력 → `넓이 × bendingPricePerMmPer3m`. 모든 절곡은 3m 본 단위(더 긴 건 이어붙임)라 길이는
  단가(원/mm·3m)에 이미 포함, 넓이만 입력. 넓이는 `catalogModes.bending.simpleQty` 에 저장.
  횟수별(1회/2회/3회) 아이템 제거됨. buildLineItems 와 CatalogPicker 에 각각 특수 분기.
  (용마루/미시/페이샤 절곡은 여전히 '마감 방식'이 자동 계산 — 이 그룹은 그 외 추가 절곡용.)

Each group has **two modes** — the user toggles per group (+ enabled 체크박스):

**심플 모드 (default)** — one auto-calculated line per group:
- `simpleType`: `percent` (자재비 %), `perSqm` (㎡당), `perM` (m당 — gutter length), `total` (총금액)
- Defaults are **공사 유형별** — `defaultGroupModes(constructionType)` (2026-06-16 사용자 확정):
  - 지붕/옥상지붕: **절곡 perSqm 3,000 + 기성품 perSqm 1,000, 둘 다 체크 — 절곡 > 기성품**
    ("기성품보다 절곡이 더 많이 들어"). **절곡은 %가 아니라 ㎡당 (2026-07-07 전환)** — 사용자 지적:
    %(자재비 기준)는 멘탈("총액 대비")과 어긋나고 총액은 라인 생성 단계에 없음. 샘플 후레싱류
    고객가 3,200/6,900/9,300원/㎡ (215/72/50㎡ — 작을수록 높음) → 원가 기본 3,000, 마진 30% 후
    ~4,300원/㎡ = 샘플 중간. 용마루 절곡은 '마감 방식' 자동이므로 이 기본가는 그 외
    후레싱(하부·페이샤·하우)분. 카드 접힘 시 "마감 방식에서 자동 계산 중" `autoNote` 유지.
  - 바닥형 스틸방수: **bending enabled + perSqm 3,000** (표본 없음 — 지붕 준용), finishing(기성품) 해제.
  - accessory → percent **8%** 공통 (포스코 샘플 체결부속+실리콘 = 재료비의 9.7/7.4/17.6%).
    gutter → perM 2,000원/m, **지붕/옥상지붕만 기본 체크** (물받이 사방 기본과 세트, 길이 0 이면 라인 없음).
    스틸방수는 해제 — 배수로가 시공 범위에서 별도라 이 그룹은 추가 물받이용.
  - **percent 기준 = 카탈로그 그룹 이전까지의 전체 자재 라인 합** (강판+PE폼+하지+절곡자동+물받이+
    단열재 등, 2026-06-17 — 구 기준은 강판+PE폼만이라 샘플 %와 안 맞았음). 폼 미리보기
    `materialTotalEstimate` 도 `getMaterialPriceSqm` 기반 (legacy ㎡가 30,000 아님).
  - `resolveGroupDefaults(saved, constructionType)` — 유형별 built-in 위에 settings/estimate 병합.
    CatalogPicker 도 `constructionType` prop 받아 동일 기본값 표시.
- Settings override: `PricingSettings.catalogDefaults` (Json, 그룹 키), merged via `resolveGroupDefaults()`.

**상세 모드** — itemized from `DEFAULT_CATALOG` (56 천보 실단가 items, 단가는 설정 `catalogPrices` override), 8분류 소제목으로 그룹핑:
- Each row in [components/CatalogPicker.tsx](components/CatalogPicker.tsx) has a quantity stepper + inline-editable unit price snapshot.
- "+ 직접 추가" per group creates a custom row (key starts with `custom_`, category = 그룹 첫 분류).
- **마감 방식과의 싱크**: scope.ridge 켜진 지붕 견적에선 마감재 카드 상단에 `finishingAutoHint` 안내
  ("용마루는 마감 방식에서 자동 계산 중 …") — 자동 라인과 카탈로그 선택의 관계를 명시.

**Snapshot storage** (both modes coexist on `Estimate`):
- `Estimate.catalogSelections Json @default("[]")` — itemized picks (item 분류 키 유지)
- `Estimate.catalogModes Json @default("{}")` — **그룹 키** mode + simple value.
  Back-compat: 구 8분류 키 중 "finishing"/"gutter" 는 그룹 키와 동명이라 자연 호환, 나머지 키는 무시.

**Calculation flow** (`buildLineItems`):
- For each of the 4 groups, look up effective mode (estimate override → settings default → built-in default)
- enabled === false → 그룹 전체 스킵 (상세 선택 항목 포함)
- Simple mode → emit one line via `simpleModeLineItem()` (returns null if value ≤ 0)
- Detailed mode → emit one item per `catalogSelections[]` row whose item-category ∈ group with quantity > 0
- `categoryToLineItemCategory()` maps item categories to line-item categories so colors + customer PDF grouping work consistently.

**Note:** The old auto-added 부자재 line (materialTotal × accessoryRate) has been removed — it's now expressed as the accessory category's simple-mode percent. `PricingSettings.accessoryRate` is left in the DB for back-compat but no longer drives calculations.

**Settings catalog editor** ✅ 완료 (2026-07-09 노브 개방): 그룹 심플 기본값은 `GroupDefaultsCard`,
아이템 단가는 `CatalogPricesCard`(접힘, `catalogPrices` JSON) — 둘 다 설정 화면에.

**Auto-fill for detailed mode** (per user request, deferred): each catalog item could carry a `perSqm` coefficient so switching to 상세 모드 auto-populates quantities based on construction area. Needs industry-standard data the user said they'd supply.

### 내 단가 프리셋 (2026-06-16 구현) — "활성 프리셋" 모델
사용자가 단가표를 이름 붙여 여러 개 저장하고 전환 ("표준" / "겨울 비수기" / "프리미엄").
**핵심 모델: 현재 설정 = 활성 프리셋.** 전환할 데가 없어도 "버전 세이브 포인트"로 가치 있음.

- **모델**: `PricingPreset { id, userId, name, snapshotJson Json, createdAt, updatedAt }` + `PricingSettings.activePresetId String?` (활성 추적).
- **불변식 유지**: `PricingSettings` 는 계속 **라이브 행** (견적이 스냅샷하는 그것). 프리셋은 거기에 값을 채워넣는 역할 — **견적 스냅샷 로직 안 건드림.** 프리셋 전환 = 프리셋 값을 PricingSettings 에 복사.
- **저장 흐름** (사용자 확정): 공장 기본값에서 시작 → 설정 바꿔 **[저장]** → 활성 프리셋 없으면 "이름 정하기" → 프리셋 생성+활성. 이후 [저장] = **활성 프리셋 덮어쓰기**(기본), 별도 **"다른 이름으로 저장"** = 새 프리셋. 드롭다운으로 불러오기(=활성 전환).
- **공장 기본값 = 불러오기 목록의 항목** (2026-06-16 통합): 별도 리셋 버튼 없앰. 불러오기 목록에
  "공장 기본값"(맨 위, **삭제 불가**) + 내 프리셋(삭제 가능). 공장 기본값 선택 = 폼에 DEFAULTS 채움 +
  activeId=null (비파괴, 저장해야 적용). 프리셋 선택 = 서버 activate + 새로고침.
- **UI 배치 (앱 표준 패턴)**: 불러오기/전환은 상단 바, 저장은 하단 sticky. **매 저장 팝업은 안 함**(안티패턴) —
  대신 저장 버튼이 `저장 · '표준' 갱신` 으로 대상 표시. 저장 옆에 [다른 이름으로]. 활성 프리셋 없으면(공장 기본값
  상태) 저장 시 이름 입력(선택) 노출. 이름 입력은 하단 sticky 에 인라인.
- **실수 덮어쓰기 보호 (2026-09-28 사용자 결정: '되돌리기 토스트'):** [저장]이 활성 프리셋을 덮어쓰면 직전 값을
  `PricingPreset.prevSnapshotJson` 에 보관하고, 10초 토스트의 [되돌리기] → PATCH `{ action: "undo" }` 가 프리셋과
  현재 설정을 모두 이전 값으로 (1단계). 저장 안 한 변경이 있으면 프리셋 전환·페이지 이탈 시 확인.
- **공장 기본값 불러와 저장 = 서버 `activePresetId` 도 해제** (`activePresetId: null` 전송). 이전엔 서버에 활성 프리셋이 남아
  다음 [저장]이 예전 프리셋을 공장값으로 조용히 덮어썼다.
- **옛 프리셋 활성화:** 스냅샷에 없는 필드(프리셋 이후 추가된 컬럼)는 공장 기본값으로 채우고, 없어진 컬럼·잘못된
  값은 `sanitizeSettingsData({ lenient: true })` 가 조용히 버린다 — 옛 프리셋도 항상 불러올 수 있게.
- **snapshotJson 범위 (불변):** 단가·계수 필드만 (`materialWidths`/`accessoryLengths`/`insulationUnitAreas`/`catalogDefaults` JSON 포함). 제외: 회사정보(`companyName`/`companyPhone`/`companyAddress`/`businessRegistrationNumber`/`sealImageUrl`/`bankAccount`/`noticeText`), `estimateNumberStart`, `baselineData`, `activePresetId`. 헬퍼 `lib/presets.ts` `PRESET_EXCLUDE` + `extractPresetSnapshot`/`applyPresetSnapshot`.
- 프리셋 전환 × 과거 견적 재수정의 동작은 "Pricing overrides" 섹션의 절대값 assertion 참조.

### Estimate edit API — 11 actions total
`PATCH /api/estimates/[eid]` dispatches on the request body shape. Order in the route handler matters (first match wins):

모든 라인 액션은 `lineItemId` 가 **이 견적의 라인인지 확인**한 뒤 `updateMany/deleteMany({ id, estimateId })` 로 쓴다.

1. `{ lineItemId, total }` — manual edit on a line (`isUserEdited = true`)
2. `{ lineItemId, action: "undo" }` — restore `total = quantity × unitPrice`, clear `isUserEdited`
3. `{ lineItemId, action: "delete" }` — remove the line
4. `{ action: "add", newLineItem: { name, quantity, unit, unitPrice, category } }` — append a free-form line (`isUserEdited = true`)
5. `{ action: "replace", ...allEstimateFields }` — **full edit = 재발행** — `parseEstimateBody` 로 검증, 라인 전체 재생성, 회사·고객·마진 분배 비율·발행일 재스냅샷. Preserves `estimateNumber` and `pdfSentAt`. Resets `marginMode` to "percent".
6. `{ marginRate }` — set rate (-100% ~ 99%, 범위 밖 400), recompute margin amount / supply / final
7. `{ marginAmount }` — set amount, back-derive rate, mode → `'amount'`
8. `{ supplyPrice }` — **평당가 입력용**: 공급가 지정, 마진은 서버의 현재 원가 기준 역산, mode → `'amount'` (클라이언트가 마진 차액을 계산해 보내면 화면이 오래됐을 때 틀렸다). 계산은 `calcFromSupplyPrice` — 번개 견적 생성과 공용
9. `{ finalPrice }` — back-calc from final, mode → `'finalPrice'` (line items untouched)
10. `{ vatIncluded }` — toggle: **공급가 유지**, VAT·최종가만 다시 (vat = round(공급가×0.1)). marginMode 는 안 바꾼다
   (finalPrice 모드에서 최종가를 고정하면 토글할 때마다 공급가·마진이 10%씩 흔들렸다).
11. `{ paymentTerms / validityDays / pdfSentAt }` — 타입 검증 후 meta update. **`pdfUrl` 은 받지 않는다** (서버 `/sent-pdf` 만 기록 — 2026-10-01).
    `pdfSentAt` 은 공유 직후 발송 시각 기록용 (보관이 실패해도 남게).

Actions 1-4 (line changes) call `recalcAndReturn(eid, estimate)` — 사용자가 고정한 기준 유지:
- `finalPrice` 모드 → 최종가 고정, 마진 역산 ("850만원 약속").
- `amount` 모드 → **마진 금액 고정** (2026-09-28 — 이전엔 마진율 기준으로 재계산돼 평당가·마진 금액이 풀렸다).
- `percent` 모드 → 마진율 고정.
- 견적 상세 UI 는 요청 중 다른 변경을 막고(`busy`), 성공 후 `router.refresh()` (라우터 캐시 갱신 — 뒤로가기·미리보기 stale 방지).

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
- **Rounding sweep** adjusts the **largest** item by ±1원 so the displayed sum is exactly `cost + marginAmount` (2026-09-28 — 마지막 라인이 작으면 음수가 될 수 있었다).
- **손해 견적(마진 < 0):** 버킷 규칙 대신 모든 라인을 같은 비율로 줄이고 이윤 줄은 만들지 않는다 (고객 PDF 에 음수 라인 금지).
- **Internal data is never modified.** `EstimateLineItem` rows stay cost-only (snapshot rule). This is purely a presentation transform applied at PDF render time. In-app `EstimateDetail` still shows the true cost breakdown + margin separately for the salesperson.
- **Wiring:** PDF 라우트와 견적 상세 page 가 `Estimate.margin*RatioSnapshot` 을 읽어 `marginRatios` 로 넘긴다 (스냅샷 null 인 구 견적만 현재 설정 폴백). Settings UI: `MarginDistributionCard` (설정 화면의 마진 섹션).
- **✅ 비율 스냅샷 완료 (2026-09-28, 백로그 3번):** 생성·재발행 시 박제, 기존 견적은 마이그레이션 백필. 분배 비율이나 프리셋을 바꿔도 이미 보낸 견적서의 라인별 금액은 그대로.
- **공급가액·부가세 행:** 간단·상세 모두 라인 아래 '공급가액'(= 표시 라인 합) + 부가세 포함이면 '부가세 (10%)' = 최종가 − 공급가액 → 최종 금액과 원 단위까지 일치 (이전 '소계 (부가세 포함)' 에 공급가가 찍혀 10% 어긋났다).

### Margin is revenue-based (매출 대비), not cost-based
`calcTotals`: **`supplyPrice = totalCost / (1 - marginRate)`**, `marginAmount = supplyPrice - totalCost`.
i.e. marginRate = 마진 / 공급가 (매출 대비), NOT 마진 / 원가. Example: 원가 800만 + 마진율 20%
→ 공급가 1,000만, 마진 200만. `calcFromFinalPrice` back-derives `marginRate = marginAmount / supplyPrice`.
Clamped at 99% (denominator). Negative rate (손해) allowed. EstimateDetail labels say "매출 대비".
**Old estimates** keep their stored marginRate (computed the old 원가-대비 way) until re-saved — not migrated.

### Margin adjustment — 4 editable inputs in `EstimateDetail`
Order in the margin card (most-used → least-used):
1. **평당가** (highlighted) — 평당가 × 평수(소수 2자리) = 공급가 → `{ supplyPrice }` 액션 (mode 'amount', VAT 토글해도 평당가 유지). 1평 = 3.3058㎡. Disabled when `areaM2 === 0`.
2. **마진율** — sets marginRate (99% 초과 입력은 막음), recomputes everything.
3. **마진 금액** — sets marginAmount, back-derives marginRate.
4. **최종 견적가 직접** — sets finalPrice, marginMode → `'finalPrice'`, marginRate auto-derived.
편집 중 Esc/✕ = 취소, 빈 값 = 취소 (0원 저장 방지). 라인 추가는 '항목 직접 추가' 폼 (action 4).
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
  - All useState initializers prefill from `existing.*` instead of defaults (정확히는 `src = initial ?? existing` — 아래 '초기값 출처')
  - Form header shows "견적 수정"
  - Submit button shows "수정 저장"
  - PATCH `{ action: "replace", ... }` instead of POST
- **What's reset:** line item inline edits, margin/finalPrice overrides, manually added line items (the rebuild starts fresh from `buildLineItems`).
- **What's preserved:** `estimateNumber`, `pdfSentAt`, **기타 비용** (`Estimate.extraCosts` 원본 저장 — 2026-09-28~, 그 전 견적은 원본이 없어 다시 입력).
- **What's re-snapshotted (재발행):** 회사 정보·고객명/주소·마진 분배 비율·발행일(`issuedAt`) — 현재 값 기준.
- **자동 채움 (2026-09-28 재설계):** 둘레·난간 둘레·배수로·작업일수·물받이 길이·로스율은 effect 로 상태에 복사하지 않고
  **렌더 시 계산**한다 — "사용자가 만진 칸(`touched`)은 그 값, 아니면 자동값". 수정 모드는 저장값이 자동값과 다른 칸만
  touched 로 시작 (그래서 진입 즉시 저장값이 바뀌지 않고, 면적을 바꾸면 안 만진 칸은 새 면적 기준으로 따라감).
  건물형태를 바꾸면 둘레·난간은, 물받이 면을 바꾸면 길이는 다시 자동값으로. 칸을 비우고 나가면 자동값 복귀.
  제출·자동 저장 payload 도 같은 규칙 — 비운 배수로·물받이 칸은 자동값(`drainNum`·`roofGutterNum`), 직접 친 0 만 0.
- **초기값 출처 ≠ 수정 모드 (2026-09-30):** 폼은 `initial ?? existing` (`src`) 에서 초기값을 읽고, 수정 모드(헤더·버튼·PATCH)는
  `existing` 만 본다. `initial` = 복원한 초안 (`EstimateFormInitial` = `estimateColumns` 모양). 새 값 칸을 추가하면 `src.x` 로 읽을 것.
- **폼 초안 자동 저장 (2026-09-30, 백로그 4-①):** 폼이 제출하는 `payload`(`buildPayload()`) 그대로 localStorage 에 저장 —
  키 `roofquote:draft:v1:<userId>:<siteId>:<견적id|new>`. 입력이 멈추고 0.8초 뒤 + 앱 전환·탭 닫기·화면 이동 시 즉시.
  열기만 한 상태(처음 값 그대로)·서버 검증(`parseEstimateBody`)을 못 넘는 상태(유형·면적 없음 등)는 저장 안 함.
  다시 열면 배너 "작성 중이던 견적이 있어요 (N분 전)" → [이어서 작성] = payload → `parseEstimateBody` → `estimateColumns` →
  `initial` 로 폼 remount (수정 모드와 같은 초기화·touched 규칙), [버리기] = 삭제 (10초 '되돌리기' 토스트). 제출 성공 시
  이동 전에 삭제. 14일 지난·깨진 초안은 지움. 수정 모드는 초안의 `baseUpdatedAt` ≠ 견적 `updatedAt` 이면 지우고
  "저장된 견적이 바뀌어 이전 초안은 지웠어요". 초안은 하이드레이션 후에만 읽는다 (`useSyncExternalStore` 플래그).
  payload 에 없는 UI 상태(접힘·펼침, 이름·금액 중 하나만 채운 기타 비용 줄, 꺼진 항목 아래 숫자 등)는 복원되지 않는다.
  - **배너가 묻는 동안의 규칙 (저장 규칙은 `DraftAutosaver` — 테스트 있음):** 배너 밑의 새 폼은 같은 키에 쓰므로, 만졌다
    되돌리기만 하면 저장소를 건드리지 않고(처음 상태로 돌아왔을 때 지우는 건 **그 폼이 저장했던** 초안뿐), 저장할 만한 새 입력이
    생기면 덮어쓰기 **직전에** 배너를 닫고 "새 입력을 저장해서 이전 초안은 지웠어요 [되돌리기]" (`DraftTarget.offerRef`).
    [버리기]·만료 정리는 `clearDraftIfUnchanged` — 읽었던 그 초안(`savedAt`)일 때만 지워 지금 입력을 남긴다.
    '되돌리기'는 초안을 저장소에 먼저 다시 쓴다 (폼을 떠난 뒤 눌러도 다음에 다시 제안).
    배너는 언마운트 때 핸들러 해제를 `queueMicrotask` 로 미룬다 — React 가 배너 정리를 폼의 마지막 저장보다 먼저 돌려서,
    바로 해제하면 화면을 떠나는 순간 제안 중인 초안이 토스트 없이 덮였다. 제출(`markSubmitted`)은 이 폼이 한 번도 저장하지
    않았고 배너가 아직 묻는 중이면 그 이전 초안을 지우지 않는다 (0.8초 안에 제출해도 다음에 다시 제안).
  - **직접 넣은 0 (2026-09-30 해결):** 폼은 null 을 '안 만진 칸'(= 자동 길이)으로 보므로, `estimateColumns` 가 **해당될 때의 0 은
    0 으로** 저장한다 — 스틸방수 배수로 '0 = 안함', 물받이 면을 고른 채 길이 0. 해당 없을 때(다른 유형, 면 없음)만 null.
    수정 모드와 초안 복원이 같은 규칙을 쓴다. 계산·PDF 는 `> 0` 으로만 보므로 0 과 null 이 똑같이 '없음'.
    이 수정 전에 0 으로 저장했던 견적은 DB 에 null 이라 수정 모드에서 여전히 자동 길이로 보인다 (복구 불가, 다시 0 입력).
- **Invariant — replace = 전체 재산정 (intended, 2026-06-12 외부 감사로 확정):** replace 는 단가를 **현재** PricingSettings(+제출된 overrides) 기준으로 다시 스냅샷한다. 그 사이 설정 단가가 바뀌었으면 수정 저장 시 새 단가를 흡수한다 — 이것이 정의된 동작. UI 도 고지함 (EstimateDetail `EditEstimateButton` 확인 다이얼로그: "회사 정보와 단가는 현재 단가 설정값으로 다시 snapshot 됩니다"). 이 문구를 약화시키지 말 것. 결제조건/유효기간 같은 메타만 고칠 땐 replace 가 아니라 action 10 (whitelist meta update) 경로를 쓴다 — 재산정 없음.

### 번개 견적 (2026-10-01, 백로그 4-② · 스펙 "현장에서 1분 안에 견적 초안")
이름은 사용자 결정 (구 백로그 이름 '빠른 견적 입구'). 입구 = 현장 화면의 '새 견적'(헤더)·'견적 만들기'(빈 상태) 옆 **번개 견적** (Zap 아이콘)
→ `/sites/[id]/estimates/quick` (focused flow — BottomNav 숨김, `StickySubmit`).
- **입력 3개:** 공사 유형 · 시공면적(평↔㎡ 자동 변환, 폼과 같음) · 평당가(원 정수, **부가세 별도 = 공급가 기준** — 견적 상세 평당가와 같은 정의).
- **결과 = 일반 견적** (같은 Estimate·상세·PDF·입력값 수정). 라인은 `defaultEstimatePayload(settings, 유형, 면적)`
  ([lib/estimate-defaults.ts](lib/estimate-defaults.ts)) → `parseEstimateBody` → `computeEstimate` — 새 견적 폼에 유형·면적만 넣고
  나머지를 안 건드렸을 때 폼이 제출하는 payload 와 같은 값 (사용자 설정 기본값: 인원·하지·로스율 토글·그룹 기본값·경비 토글 +
  면적 자동값: 둘레·난간·배수로·물받이·작업일수).
- **가격:** 공급가 = round(평당가 × `sqmToPyeong(면적)`) → `calcFromSupplyPrice` (마진 = 공급가 − 원가, 매출 대비 마진율,
  marginMode `'amount'` — PATCH `{ supplyPrice }` 와 같은 함수). 부가세 포함 여부 = 설정 `vatIncludedByDefault`.
  원가보다 낮으면 손해 견적 그대로 저장 (화면 미리보기에 빨간 경고).
- **서버:** POST `/api/sites/[id]/estimates/quick` `{ constructionType, areaM2, pyeongPrice }` → 현장 소유 확인(404) → 회사명 확인(400)
  → `parseQuickEstimateBody` ([lib/quick-estimate.ts](lib/quick-estimate.ts) — 유형 3종, 면적 0.1~100,000㎡, 평당가 정수 1~1,000만 원,
  부가세 포함 최종가 ≤ 32비트 정수 → 400 한국어) → `quickEstimateInput` → `createEstimate({ supplyPrice })` → `{ id, siteId }` 201.
  생성 경로(번호·라인·합계·스냅샷)는 일반 POST 와 같은 [lib/estimate-create.ts](lib/estimate-create.ts). 404 문구도 한국어.
- **면적 상한은 설정에 따라 더 작다:** `quickMaxAreaM2` = min(100,000, 365 × 설정 '작업일수 자동 기준') — 공장값 32,850㎡.
  넘으면 작업 일수 자동값이 견적 검증 한도(365일)를 넘으므로 `QuickNeedsFullFormError` (화면에 없는 '작업 일수' 대신
  "번개 견적은 시공면적 N㎡까지 … 일반 견적으로"). 설정 기본값 자체가 검증 범위 밖이어도(예: 기본 인원 > 100) 같은 오류로 출처를 밝힌다.
- **저장 범위:** 금액 컬럼은 32비트 정수 — `assertMoneyFitsDb` ([lib/estimate-input.ts](lib/estimate-input.ts))가 라인 단가·금액과
  합계를 확인해 넘으면 InputError → 400 (`createEstimate` = 일반·번개 생성, PATCH replace 공용. 이전엔 DB 오류로 500).
- **미리보기:** `previewQuickEstimate` — 서버와 같은 계산·같은 검증 (평수·예상 원가·마진·공급가·부가세·최종 금액). 서버가 거절할
  입력이면 `{ ok: false, error }` 로 같은 문구를 보여 주고 제출을 막는다 (`QuickNeedsFullFormError` 면 '일반 견적으로 만들기' 링크).
- **오류 토스트:** `quickErrorMessage` — 401(proxy 의 영문 "Unauthorized") → 로그인 만료 문구 + [로그인] 버튼(`next` = 번개 견적),
  404 → 현장 없음, 연결 실패 → 네트워크 문구. 그 밖엔 서버의 한국어 `error`.
- **마지막 평당가:** 공사 유형별로 이 폰에 기억 — localStorage `roofquote:quick-pyeong:v1:<userId>` (`{ roof: 350000, … }`),
  생성 성공 시 저장, 유형을 고를 때 채움 (평당가를 직접 친 뒤엔 안 덮음). 저장소가 막혀도 폼은 그대로.
- **나중에 '입력값 수정'** = 일반 견적과 같은 replace — 저장된 입력이 폼에 열리고, 저장하면 마진이 **percent 모드(기본 마진율)로
  돌아간다** (평당가로 정한 공급가는 풀림 — 확인 다이얼로그가 고지). 평당가를 다시 맞추려면 상세의 평당가 칸.
- **폼과 같게 유지할 것:** 폼 `buildPayload()` 의 반환 타입이 `EstimateFormPayload` 라 키는 타입이 묶고, 자동값·유형 기본값·
  입력 기본값은 같은 모듈(`autoBasePerimeter` 등, `constructionTypeDefaults`, `NEW_ESTIMATE_DEFAULTS`)을 쓴다. 폼의 새 견적
  제출 규칙을 바꾸면 `defaultEstimatePayload` 도 같이 바꿀 것. 2026-10-01 브라우저 동등성 검사 (임시 페이지·가짜 설정, DB 없음):
  3유형 × {57.3㎡ 유형 먼저, 45평 면적 먼저, 330.58㎡} × 설정 2종(공장값·바꾼 값) = 18케이스 — 폼 초안 payload ==
  `defaultEstimatePayload` (키 순서까지), 리팩터 전(HEAD) 폼 == 리팩터 후 폼.

### PDF preview flow
- Estimate detail → "견적서 미리보기" button navigates to `/sites/[id]/estimates/[eid]/preview?detail=simple` (default).
- Preview page embeds `/api/estimates/[eid]/pdf?detail=simple|detailed` in an iframe — the PDF route returns `inline` disposition by default, `?download=1` forces attachment.
- A 간단/상세 toggle at the top of the preview switches `?detail=` query — Next router replaces the URL so back-button doesn't pile up history. The iframe `key={detailLevel}` forces a reload on toggle.
- The preview page has its own sticky action bar with PDF 저장 + 카톡 보내기. Save respects the current detail level (filename suffix 간단/상세). Only the share action records the send (아래 '발송 PDF 보관').

### 발송 PDF 보관 (2026-10-01 — 스펙 "발송한 PDF 파일 자체도 Storage에 저장")
- **버킷:** `estimate-pdfs` — **비공개**. `ensureSentPdfBucket()` 이 프로세스당 한 번 확인하고 없으면 만든다
  (public:false, 10MB, application/pdf 만). 이미 공개로 되어 있으면 보관을 거부한다. 절대 공개로 바꾸지 말 것 —
  열람은 라우트가 소유 확인 후 service-role 로 받아 돌려준다 (공개·서명 URL 을 밖에 주지 않음).
- **경로:** `<userId>/<estimateId>/<YYYYMMDDTHHmmssSSSZ>-<simple|detailed>.pdf` (UTC, 이름순 = 시간순).
  `lib/sent-pdf-path.ts` 의 `parseSentPdfName`/`isSentPdfPathFor` 가 정확한 패턴·본인 폴더만 통과시킨다 (`..`·다른 폴더·확장자 거부).
- **흐름:** 미리보기 '카톡 보내기' → `navigator.share` 성공 후 [lib/sent-pdf-client.ts](lib/sent-pdf-client.ts)
  `recordSentPdf()` 가 ① PATCH `{ pdfSentAt }` (keepalive, 10초 제한 — 화면을 떠나도 발송 시각은 남게) ②
  **공유한 그 File(같은 바이트)** 을 `POST /api/estimates/[eid]/sent-pdf?detail=` (30초 제한, 4MB 이하, `%PDF-` 시작,
  upsert 없음) → 서버가 `pdfUrl`(경로)·`pdfSentAt` 을 같은 시각으로 다시 기록. 결과 `stored | timeOnly | none | unknown` 에 맞춰
  **실제로 기록된 것만** 안내 (`sentRecordNotice`). `unknown` = 시간 제한으로 끊음 — 끊어도 서버는 처리를 마칠 수 있으니
  '못 했다'고 단정하지 않고 '보낸 견적서'에서 확인하라고 안내. none 이 아니면 `router.refresh()` — EstimateDetail 은 새
  서버 데이터(`initial` prop 변경)를 상태에 다시 반영하므로 이미 열려 있는 상세 화면도 발송 기록·'보낸 견적서' 목록이 따라온다
  (목록은 `pdfUrl` 이 바뀌면 다시 불러옴). 'PDF 저장'·카톡 인앱 경로는 보관하지 않는다.
- **pdfUrl 은 서버만 쓴다** (견적 PATCH 메타에서 제거). 재발행(replace)은 pdfUrl·pdfSentAt 유지.
- **열람:** 견적 상세(내부 보기만) '보낸 견적서' 목록 ← `GET /sent-pdf` (pdfUrl 없으면 스토리지 조회 없이 빈 목록).
  행을 누르면 `GET /sent-pdf/[name]` 이 inline PDF (`Cache-Control: private, no-store`) 를 새 탭에.
- **정리:** 견적 삭제·현장 삭제 시 `removeForEstimates(userId, ids)` (best-effort, 로그만 — 삭제 응답은 그대로 성공).

### Customer PDF layout (components/EstimatePDF.tsx) — v4
- **Header (dark navy `#1e2530`)**: company name + 사업자등록번호 + phone + address on left; 견적 번호 + 발행일(`issuedAt`, KST) + "X일간 유효" on right.
- **Customer + Site row** (two columns): 고객명 / 공사위치 (스냅샷) on left; 시공면적 / 건물면적 / 공사일정 / 예상 공사기간 on right.
- **공사 범위**: single line of text joined by " · " (e.g. "칼라강판 지붕공사 (기존 지붕 덧씌우기) · 용마루 및 처마 마감 · 물받이 교체 · 폐기물 처리"). Built by `scopeOneLine()` which combines title + ridge/eave merge + gutter mode + scope flags + equipment blurb.
- **자재 spec pills**: pill row under scope — 제품명 / 두께 / 텍스처 / 색상.
- **견적 내역**: two modes (toggle via `?detail=` on the PDF route):
  - **simple** (`groupForSimple()`) — flat list of buckets (자재 및 마감 일체 / 시공비 (현장 관리 포함) / 장비 및 운송 / 철거 및 폐기 / 현장 경비). **이윤은 심플에선 별도 표시 안 하고 시공비에 녹임** (2026-06-16 — 5줄 요약에서 이윤 줄이 튀면 거부감). 상세는 이윤 줄 유지. 빈 버킷은 자동 생략.
  - **detailed** (`groupForDetailed()`) — table with group subheaders: **자재공사 → 노무비 → 기타경비** (Korean industry-standard 3-category structure). Material items shown individually with 품명 / 규격 / 수량 / 금액 columns. Labor + meals + lodging rolled into one "인건비 (기공·조공)" line under 노무비. 아래 공급가액 (+ 부가세) 행.
- **최종 견적 금액** card (`#f5f7fa` background): single line "최종 견적 금액 · 부가세 포함/별도" + amount on right.
- **결제 조건**: `parsePaymentStages()` parses the free-text paymentTerms into structured stages (e.g. "계약금 30% · 계약 시 / 잔금 70% · 완공 시"). When 2+ stages parsed, renders as side-by-side cards with derived amount + percent. Otherwise plain text fallback. Bank account (`bankAccountSnapshot`) appears below.
- **안내 + 서명**: numbered list of `noticeTextSnapshot` lines. Bottom-right: company name + 42px seal circle. 안내·서명 블록은 `wrap={false}` (페이지 경계에서 도장만 떨어지지 않게).

### Seal image upload
- Settings page → `SealAndNoticeCard` → `uploadSeal()` ([lib/upload-photo.ts](lib/upload-photo.ts)) 가 폰에서 **PNG·긴 변 512px** 로 변환 후 `/api/upload` → URL 을 `PricingSettings.sealImageUrl` 에 (저장해야 반영). PDF 가 1MB 이하 PNG/JPEG 만 그리므로 업로드 단계에서 맞춘다 (HEIC·WebP 직인이 '(인)'으로 조용히 빠지던 문제).
- 직인 교체 시 이전 파일은 **지우지 않는다** — 과거 견적의 `sealImageUrlSnapshot` 이 그 URL 을 가리킨다.
- PDF: 라우트가 `sealImageUrlSnapshot` 을 **미리 받아 버퍼로** 넘긴다 (우리 버킷 URL 만, 1MB·3초, PNG/JPEG 매직 바이트) → `<Image src={{ data, format }}>`. 실패하면 '(인)'. URL 을 react-pdf 에 직접 주지 말 것 (렌더 중 fetch 실패가 PDF 전체를 깨뜨렸고, 임의 URL 이면 서버가 아무 주소나 가져옴).
- User can clear the seal by clicking the X overlay (sets URL to empty string, server stores null).

### Estimate number auto-generation
- API: `POST /api/sites/[id]/estimates` assigns `YYYY-NNN` (3-digit pad, **KST 연도**). Scoped via `site: { userId }`.
- Formula (2026-09-28): `seq = max(estimateNumberStart, 올해 이 사용자의 최대 번호 + 1)` — 이전 '개수 + 시작값'은 견적을 지우면 번호가 중복됐다.
- **Not reset on Jan 1** — user must manually set `estimateNumberStart` back to 1 if they want to restart numbering each year. (Auto-reset is a possible v0.1 add if anyone asks.)
- Low race-condition risk for v0 single-user-per-account app. Could add a unique constraint + retry later if it becomes an issue.
- Stored in `Estimate.estimateNumber` (snapshot — does not regenerate on edit).

### 공사 일정 field
- `Estimate.constructionMonth` is `YYYY-MM` ("2026년 6월 중") or `YYYY-MM-DD` (날짜 지정) string snapshot via `formatMonth()`. 폼 기본값은 로컬 날짜(다음 달 / 2주 뒤).

### Visual polish
- Default font is Pretendard. Don't reintroduce Geist for body text.
- BottomNav auto-hides on focused task flows (currently `/sites/new`, `/sites/[id]/estimates/new`, `/sites/[id]/estimates/quick`, and routes ending in `/preview`). Check `components/BottomNav.tsx` if adding new focused flows.
- Sticky bottom action bars come in two flavors:
  - **BottomNav hidden** (focused flows): use the `StickySubmit` pattern from `app/sites/new/NewSiteForm.tsx` (sits at `bottom-0` with a gradient backdrop).
  - **BottomNav visible** (e.g. estimate detail, settings): position at `bottom-24` (or `bottom-28` for settings) so the button clears the nav pill. Bump the page's `pb-` accordingly (`pb-48` on estimate detail, `pb-32` elsewhere).

### Don't
- 고객 견적서 PDF 를 공개 버킷(`site-photos`)에 올리지 말 것 — 발송본은 비공개 `estimate-pdfs` 에만 (위 '발송 PDF 보관').
  클라이언트가 보낸 `pdfUrl`·경로를 믿지 말 것 — 서버가 만든 경로만 쓰고, 열람은 이름 패턴 + 소유 확인 후.
- Don't add base64 image storage. Use Supabase Storage via `/api/upload`.
- Don't run `git push` from this shell with a fresh clone — it'll fail auth. 푸시 인증은 로컬 저장소 전용 credential helper 가
  gh 의 presentlabsinc 토큰을 쓴다 (2026-09-28~, 원격 URL 에 토큰을 넣지 말 것). 인증이 깨지면 사용자에게 gh 재로그인을 요청.

## Known gotchas / paper cuts

- **Windows + Prisma client regeneration:** if the dev server is running, `npx prisma generate` fails because Node has `query_engine-windows.dll.node` locked. Stop node processes first.
- **Prisma 6 vs 7:** we deliberately use Prisma 6. Supabase docs target it, and it avoids the Prisma 7 adapter setup. Don't run `npm i prisma@latest` without rewriting the schema/client/adapter setup.
- **PowerShell here-strings:** the closing `'@` must be at column 0 on its own line. For multi-line git commit messages, write to `.git/COMMIT_MSG_TEMP` and use `git commit -F`. PowerShell can't pipe to git well.
- **`.env` is gitignored** — when env keys rotate, you have to ask the user for new values; nothing in the repo has them.
- **react-pdf fonts must be full-coverage TTF/OTF, not Google Fonts chunks.** A URL like `fonts.gstatic.com/s/notosanskr/v36/...woff2` is a *subset* covering ~100 codepoints — render any Hangul outside the subset and react-pdf v4 will misbehave. Use a self-contained font. We use **Pretendard OTF** v1.3.9 **bundled in the repo** at `assets/fonts/Pretendard-{Regular,Bold}.otf` (SIL OFL 1.1, `assets/fonts/LICENSE`), read by file path (`pretendardSrc()` in EstimatePDF.tsx) and shipped to the Vercel function via `next.config.ts` `outputFileTracingIncludes` (`/api/estimates/*/pdf`). If the file is missing at runtime it logs `[PDF] bundled font missing` and falls back to the same version on jsdelivr. Note the **`.otf`** extension — upstream does NOT ship static `.ttf` files. Always wrap `Font.register` in try/catch and call `Font.registerHyphenationCallback((w) => [w])` to disable hyphenation (its default also returns null for unknown chars and contributes to the same crash class).
- **Never put `"use client"` on a component that's only imported by a server route.** `components/EstimatePDF.tsx` is rendered by the server-side PDF route through react-pdf's reconciler. With `"use client"`, Next.js replaces the export with a client-reference proxy when imported in a server module — the proxy doesn't execute the function during reconciliation, so the `<Document>` host node never appears, `container.document` stays null, and react-pdf throws `Cannot read properties of null (reading 'props')` at `react-pdf.js:139`. Same applies to any component that's only ever called from a route handler / server action / RSC.
- ~~PDF 폰트는 매 콜드스타트에 jsdelivr 에서 받는다~~ ✅ 해결 (2026-09-30) — 저장소 포함 + 추적 포함. `pdf-render.test.ts` 가 네트워크를 막고 렌더해서 CDN 의존이 되살아나면 실패한다. 새 서버 전용 파일을 fs 로 읽게 되면 같은 방식으로 `outputFileTracingIncludes` 에 추가할 것.
- **react-pdf and `: null` JSX conditionals.** Patterns like `{cond ? <X/> : null}` inside a `<View>` can occasionally cause the same "null props" crash because react-pdf's children flattener doesn't strip `null` as cleanly as React DOM does. Prefer building child arrays via `.filter(Boolean).map(...)` or `.flatMap(...)` when conditionally including elements. `{cond && <X/>}` (without the `: null`) is also OK because react-pdf strips `false`.

## 우선순위 백로그 (2026-06-12 — 외부 감사 반영, 순서 고정)

이 순서는 의존성이다. 건너뛰면 되돌아오게 된다.

1. ~~**절곡 포함/별도 확정**~~ ✅ 완료 (2026-06-12) — 절곡 단가 = 자재비+가공비 포함 확정, `finishingMethods` 부재별 시스템 구현. RESOLVED 섹션 참조.
2. ~~**calculations.ts 핵심 함수 vitest**~~ ✅ 완료 (2026-06-12) — `lib/__tests__/calculations.test.ts` 28케이스 (`npm test`). 계산 엔진 수정 시 반드시 테스트 추가/갱신.
3. ~~**마진 분배 비율 스냅샷**~~ ✅ 완료 (2026-09-28) — 고객명·주소·발행일 스냅샷과 함께. 기존 견적 백필.
4. **현장 즉시성 묶음** (calc 엔진 안 건드림): ~~① 폼 초안 localStorage 자동 저장~~ ✅ 완료 (2026-09-30 — Edit mode 섹션 '폼 초안 자동 저장'), ~~② 빠른 견적 입구~~ ✅ 완료 (2026-10-01 — '번개 견적' 섹션. finalPrice 역산이 아니라 평당가(부가세 별도) = 공급가 기준, marginMode 'amount'). ~~③ 견적 복사~~ **폐기 (2026-06-16 사용자)**: 건물 크기·모양이 다 달라 복사가 새로 만들기보다 느림 — "처음부터를 빠르게"가 방향. 다시 제안하지 말 것.
5. **override → 기본값 승격** — 견적 저장 시 "바꾼 단가 N개를 기본값으로 저장할까요?". 기본 단가표 수렴의 엔진.
6. ~~**단가표 확정 → 프리셋**~~ ✅ 완료 (2026-06-16). 실수 덮어쓰기 보호 = 저장 후 '되돌리기' 토스트로 결정·구현 (2026-09-28).
8. **남은 운영·신뢰 과제 (2026-09-28 점검 후):** ~~발송 PDF 보관(비공개 버킷)~~(2026-10-01 구현·실기기 확인 — 보관·목록·열기 정상, 위치는 견적 상세 맨 아래), ~~PDF 폰트 레포 포함~~(2026-09-30 완료), ~~폼 초안 자동 저장~~(4① 완료),
   ~~실기기 카톡 파일 공유 확인~~(2026-09-28 사용자 확인).
   **에러 추적(Sentry 등) — 보류 (2026-10-01 사용자 결정: "늘어서 필요하면 그 때 붙이자").** 실사용자 1곳이라 오류는 직접 전달되고
   서버 오류는 Vercel 로그(console.error)에 남는다. 다른 업체가 쓰기 시작하면 붙인다 — 그 전엔 다시 제안하지 말 것.
   붙일 때: 고객명·주소·금액이 오류 기록에 섞이지 않게 거르는 설정을 같이.
   **개발용 DB (2026-09-30 사용자 결정):** 상시 분리하지 않고 운영 프로젝트를 그대로 쓴다. 추가만 하는(nullable 칼럼·새 버킷)
   변경은 운영에 먼저 올려도 안전하므로 그대로 진행. 스키마를 크게 바꾸는 작업을 로컬에서 시험해야 할 때만 presentlabsinc 에
   **임시 시험용 프로젝트**를 만들었다가 지운다 (프로젝트 생성·DB 비밀번호는 사용자가 대시보드에서).
7. **이력 기반 자동 계수 (사용자 요구 — "와 대박" 수준)** — 견적 이력의 `자재수량 ÷ 면적`을 자재별로 집계해 소비 계수를 자동 보정/제안. ML 아님 — 사용자 자기 이력 평균(투명·수렴). **사용자 조건 (2026-06-15): ① 2~3개로 섣불리 발동 금지 — 통계적으로 의미 있는 큰 표본이 쌓였을 때만, ② 단순 평균 넘어 진짜 똑똑한 모델(형태·평수 구간·이상치 제외 등) 목표 — "내가 생각한 그대로 나오네" 수준.** 데이터 임계치 도달 전엔 기하 디폴트 유지. override→기본값 승격(5번)과 한 묶음.

## Documentation hygiene (you reading this)

When you make changes that affect setup, architecture, or invariants:

- Update **README.md** when: a new env var is needed, a new directory is added, the data model changes, a new top-level concept is introduced, deployment instructions change.
- Update **this file (AGENTS.md)** when: a new file becomes important enough to know where to find, a new convention is established, a new gotcha is discovered, a new "don't do this" rule emerges.
- Update **.env.example** any time `.env` gains a new key.
- Update **prisma migrations** with the offline diff procedure above ("로컬 `.env` = 운영 DB") — never hand-edit Prisma-generated SQL; custom SQL (백필·RLS) goes below it with comments.
- Do **not** update **roofing_app_spec.md** — that's the user's living spec.

Add a short note to the commit message when you've touched docs. Future sessions trust docs over guessing.

## Development calendar and work journal

- Use the `Present Labs` Google Calendar (`presentlabsinc@gmail.com`) for RoofQuote development, not the roofing-company calendars.
- Start titles with the project label: `[예정] RoofQuote: <work>` for agreed dated development and `[일지] RoofQuote: <verified outcome>` for completed work.
- Record every `[예정]` item as a true all-day calendar event, never a timed block. A midnight-to-midnight timed event is not an all-day event; if the connector cannot create one, use the calendar UI or report the limitation.
- Follow the existing project journals: one concise factual entry per actual work date, with bullet points for changes, checks, and remaining gates. Use Asia/Seoul dates; do not invent deadlines or claim unverified work as complete.
- Backfill completed work from dated repository documents and Git history after checking for existing entries. Then record substantial new work at the end of each session; update a same-day event instead of creating duplicates.
- Do not invite the connected personal account: use `self_attendance: omit` on shared-calendar events and verify no copy appears on the personal calendar.
- Do not include credentials, customer/site information, quotes, or other private business data in calendar entries.
