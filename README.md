# 지붕견적 — RoofQuote

현장에서 바로 쓰는 모바일 우선 지붕공사 견적 도구.

칼라강판 지붕공사 / 옥상 스틸방수 / 옥상지붕 시공 업체를 위한 견적 작성 → 고객 PDF 발송 → 카톡 공유까지 한 흐름으로 처리하는 웹앱입니다. 영업사원이 현장에서 사진을 찍고, 면적·공사 범위·자재를 입력하면 원가와 마진이 즉시 계산되고, 고객용 견적서 PDF가 생성됩니다.

> **개발 현황:** v0 MVP. 단일 사용자(포스코지붕공사)가 매일 쓸 수 있는 최소 도구. CRM, 인보이스, 대시보드, AI, 위성지도 등은 v0 이후 단계적으로 추가 예정.

> **⭐ 제품 북극성:** 목표는 "객관적으로 정확한 견적"이 아니라 **각 사용자가 자기 방식대로 쉽게 설정해서 만족스러운 견적을 빠르게 뽑는 것**입니다. 업체마다 단가·자재량·공법·인원이 다르므로, 앱은 *합리적 시작점*만 제시하고 사용자가 자기 숫자로 쉽게 바꿀 수 있게 합니다 (몇 번 쓰면 그 사용자 스타일로 수렴). 우선순위: **조정 편의성 > 괜찮은 디폴트 > 정밀도**. 자동 자재 추정은 빈칸을 그럴듯하게 채울 뿐, 절대적 정답이 아닙니다. 자세한 건 [AGENTS.md](AGENTS.md) 최상단 참고.

---

## 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 16 (App Router) | RSC + API routes |
| 언어 | TypeScript | strict |
| 스타일 | Tailwind CSS v4 + shadcn/ui | Pretendard 폰트 |
| 데이터베이스 | Supabase Postgres (Seoul ap-northeast-2) | Prisma 6 ORM |
| 스토리지 | Supabase Storage | `site-photos` 버킷 |
| PDF | @react-pdf/renderer | 서버사이드 렌더 |
| 공유 | Web Share API | 카톡 공유 → fallback: 클립보드 |
| 배포 | Vercel 권장 | 미배포 |

---

## 빠른 시작

```bash
# 1) 의존성
npm install

# 2) 환경변수 설정 — .env.example 참고
cp .env.example .env
# .env 안의 5개 Supabase 값을 채워 넣기

# 3) DB 마이그레이션 적용 (Supabase에 테이블 생성)
npx prisma migrate dev

# 4) 개발 서버 시작
npm run dev
# → http://localhost:3000
# → 모바일에서는 같은 Wi-Fi의 http://192.168.x.x:3000
```

### Supabase 사전 준비 (한 번만)

1. https://supabase.com → New project (region: Seoul `ap-northeast-2` 권장)
2. **Storage → New bucket** → `site-photos` (Public bucket 체크)
3. **Project Settings → API** 에서 3개 값 복사:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role 키 → `SUPABASE_SERVICE_ROLE_KEY` (서버 전용, 절대 노출 금지)
4. **Connect 버튼 (상단) → ORMs → Prisma** 탭에서 `DATABASE_URL` / `DIRECT_URL` 복사
   - `[YOUR-PASSWORD]` 부분에 프로젝트 생성 시 정한 DB 비밀번호 치환

---

## 아키텍처 개요

### 디렉터리 구조

```
roofquote/
├── app/
│   ├── api/                                         # API routes
│   │   ├── settings/                                # GET/POST 단가 설정
│   │   ├── sites/                                   # 현장 CRUD
│   │   │   ├── [id]/                                # 현장 상세/수정/삭제
│   │   │   └── [id]/estimates/                      # POST 새 견적 생성 (라인아이템 자동 계산)
│   │   ├── estimates/[eid]/                         # PATCH 견적 수정 (라인 / 마진 / 최종가 / 추가 / 삭제)
│   │   ├── estimates/[eid]/pdf/                     # GET PDF (inline 기본, ?download=1 로 다운로드)
│   │   └── upload/                                  # POST 사진 업로드 → Supabase Storage URL 반환
│   ├── settings/                                    # 단가 설정 페이지 (㎡당 단가 계산기 포함)
│   ├── sites/
│   │   ├── new/                                     # 새 현장 등록 폼
│   │   └── [id]/
│   │       ├── page.tsx                             # 현장 상세 (사진, 견적 목록)
│   │       └── estimates/
│   │           ├── new/                             # 새 견적 만들기 (12-section flow)
│   │           └── [eid]/
│   │               ├── page.tsx                     # 견적 상세 (내부/고객 보기 토글)
│   │               └── preview/                     # 견적서 미리보기 → 저장/카톡
│   ├── manifest.ts                                  # PWA manifest
│   ├── layout.tsx                                   # 루트 레이아웃 (Pretendard, BottomNav, Toaster)
│   └── page.tsx                                     # 홈 (현장 목록)
├── components/
│   ├── AppHeader.tsx                                # 글래스 블러 sticky 헤더 + 뒤로가기
│   ├── BottomNav.tsx                                # 플로팅 pill 하단 네비 (focused flow 에서 숨김)
│   ├── EstimatePDF.tsx                              # @react-pdf/renderer 문서 컴포넌트 (snapshot only)
│   ├── CatalogPicker.tsx                            # 마감재/물받이부속/부자재/절곡 4-카테고리 picker
│   └── ui/                                          # shadcn/ui (button, input, card, etc.) + number-stepper
├── lib/
│   ├── prisma.ts                                    # PrismaClient 싱글톤
│   ├── supabase.ts                                  # supabase (anon) + supabaseAdmin (service role)
│   ├── calculations.ts                              # buildLineItems / calcTotals / calcFromFinalPrice / THICKNESS_MULT
│   ├── types.ts                                     # ConstructionType, MaterialType, ScopeFlags, GutterMode, SubstructureType 등
│   ├── catalog.ts                                   # DEFAULT_CATALOG (~30 prepopulated items) + helpers
│   └── utils.ts                                     # cn() 유틸
├── prisma/
│   ├── schema.prisma                                # 데이터 모델
│   └── migrations/                                  # Postgres 마이그레이션 이력 (변경 금지 — prisma migrate dev 로만)
├── public/
│   └── icon.svg                                     # PWA 앱 아이콘
├── .env.example                                     # 환경변수 템플릿 (5개 키)
├── roofing_app_spec.md                              # 한국어 원본 제품 기획서 (변경 금지 — 진실 공급원)
├── README.md                                        # 이 파일 (사람 대상 가이드)
├── CLAUDE.md → AGENTS.md                            # Claude Code 가 자동 로드하는 에이전트 컨텍스트
└── AGENTS.md                                        # 에이전트가 알아야 할 비즈니스 규칙 / 컨벤션 / 패턴
```

### 데이터 모델

전체 스키마는 [prisma/schema.prisma](prisma/schema.prisma) 참고. 4개 테이블:

```
PricingSettings (live config — 절대 FK로 연결 안 함, 견적 생성 시점에 값 복사됨)
  회사 정보 (snapshot 대상)
    companyName, companyPhone, companyAddress

  주요 자재 단가
    materialPricePerSqm          # 칼라강판 ㎡당 (0.45t 기준, 두께별 배수 적용)
    accessoryRate                # 부자재 비율 (자재비의 %, 자동 계산)
    ridgePricePerM               # 용마루 m당
    eavePricePerM                # 처마 마감 m당
    gutterPricePerM              # 물받이 m당
    removalPricePerSqm           # 철거 ㎡당
    wasteDisposalCost            # 폐기물 트럭 1차당 (기본 1,000,000)

  하지 작업 단가
    substructureMode             # 새 견적 기본값: 'wood' | 'steel'
    substructureWoodPricePerSqm  # 목재 하지 ㎡당
    substructureSteelPricePerSqm # 철재 하지 ㎡당

  스틸방수 단가
    drainHolePrice               # 새 배수구 타공 1개당 (기본 200,000)
    capBendingPricePerM          # 두겁 절곡 m당 (난간 시공 시 필수, 기본 5,000)

  인건비/체류비
    dailyWage                    # 1인 1일
    defaultWorkerCount           # 기본 작업 인원
    mealCostPerPersonMeal        # 1인 1식 식비
    lodgingCostPerPersonNight    # 1인 1박 숙박비

  장비비
    skyliftDailyCost             # 스카이차 1일
    ladderTruckDailyCost         # 사다리차 1일
    scaffoldPricePerSqmDay       # 비계 ㎡·일당 (주 모델)
    scaffoldDailyCost            # 비계 1일 lump-sum (legacy, fallback)

  로스율 / VAT / 마진 기본값
    defaultLossRate              # 자재 로스율 (기본 10%)
    useLossRateByDefault         # 새 견적에 로스율 자동 적용 여부
    defaultMarginRate            # 기본 마진율 (예: 0.25 = 25%)
    vatIncludedByDefault         # VAT 포함이 새 견적의 기본값인지

  기타
    baseTransportCost            # 기본 운송비
    parapetMultiplier            # (legacy, 현재 미사용)

Site
  customerName, customerPhone, siteAddress
  photos        Json     # [{url, memo?}] — Supabase Storage public URL 배열
  generalMemo   String?
  estimates     Estimate[]

Estimate (모든 입력값과 합계는 snapshot)
  공사 메타
    constructionType    # 'roof' | 'steelWaterproof' | 'rooftopRoof'
    materialType        # 'slate' | 'v250' | 'zinc250' | 'generalTile' | 'traditionalTile' | 'realZinc' | 'other'
    materialThickness   # '0.4' | '0.45' | '0.5' | '0.6'
    materialColor       # 프리셋 9개 + 직접 입력

  면적
    areaM2              # 시공 면적 (필수, 계산 기준)
    buildingAreaM2      # 건물 면적 (옵션, 참고용 — 계산에 미사용)

  작업
    workerCount, workDays
    substructureType    # null = 안함, 'wood' = 목재, 'steel' = 철재

  공사 범위
    scopeFlags          Json    # 체크된 항목들 (ScopeFlags 모양, lib/types.ts 참고)
    gutterMode          # 다중선택 직렬화 — "front,back,left,right" / "" (안함). lib/types.ts 의 parseGutterSides / serializeGutterSides / gutterSidesLabel 사용
    gutterLengthM       # 물받이 길이 (gutterMode 비어있지 않을 때)
    endCapCount         # 엔드캡 개수 (지붕/옥상지붕)
    capLengthM          # 두겁 절곡 길이 (난간 시공 시 필수)
    drainHoleCount      # 새 배수구 타공 개수 (default 0)
    wasteTruckCount     # 폐기물 차 수 (기본 1)

  공사 일정 정밀도
    constructionMonth   # "YYYY-MM-DD" / "YYYY-MM" / null (안 넣음) — PDF 에서 자동 포맷

  per-estimate 단가 override (snapshot rule 유지)
    pricingOverrides    Json    # Partial<PricingOverrides> — 빈 칸은 단가설정 기본값 사용
    catalogModes        Json    # 카테고리별 simple/detailed 모드 + 심플 값 override
    catalogSelections   Json    # 상세 모드 항목 스냅샷

  로스율 snapshot
    applyLossRate, lossRate

  장비
    skyliftDays, ladderTruckDays, scaffoldDays, scaffoldAreaM2
    otherEquipment      # 자유 텍스트 메모

  카탈로그 선택 (마감재 / 물받이 부속 / 부자재 / 절곡)
    catalogSelections   Json    # [{ category, key, label, unit, quantity, unitPrice }] snapshot

  합계 snapshot (lineItems 합과 일치해야 함)
    totalCost, marginMode, marginRate, marginAmount, supplyPrice, vat, finalPrice, vatIncluded

  견적서 메타
    paymentTerms, validityDays

  회사 정보 snapshot (생성 시점에 PricingSettings 에서 복사)
    companyNameSnapshot, companyPhoneSnapshot, companyAddressSnapshot

  발송 기록
    pdfUrl, pdfSentAt   # 현재 pdfUrl 은 미사용 — PDF 는 매번 snapshot 으로 재생성
    createdAt, updatedAt

  lineItems EstimateLineItem[]

EstimateLineItem  ← 각 라인이 자기 단가 스냅샷을 보유
  category    # 'material' | 'labor' | 'equipment' | 'transport' | 'meals' | 'lodging' | 'waste' | 'removal' | 'other'
  name        # 사람이 읽는 라벨 ("칼라강판 0.45t 지붕 시공", "인건비", 등)
  quantity, unit
  unitPrice   # 견적 생성 시점의 단가 복사본 — 절대 재계산 안 함
  total       # quantity × unitPrice (사용자 직접 수정 가능)
  isUserEdited # 사용자가 손댄 라인 표시 (UI 에서 "수정됨" 뱃지 + "원래대로" 버튼)
  sortOrder
```

법적/회계적 안전성을 위해 모든 견적 관련 값은 생성 시점에 복사됩니다. 자세한 이유는 아래 "핵심 불변 규칙" 참고.

---

## ⚠️ 핵심 불변 규칙 — 절대 위반 금지

### 1. Snapshot at creation

견적은 **생성 시점의 사진**이어야 합니다. 라이브 계산식이 아닙니다.

- ❌ **하지 말 것:** `EstimateLineItem`이 `PricingSettings`를 FK로 참조해 견적 열 때마다 재계산
- ✅ **올바른 방법:** 견적 생성 시 단가표에서 값을 **복사**해서 `EstimateLineItem.unitPrice`에 박아둠

**왜 중요한가:** 사장님이 4월에 칼라강판 단가를 30,000 → 35,000원으로 올리는 순간, 1월에 850만원으로 발송했던 견적서가 다시 열어보면 920만원으로 바뀌어 있으면 회계·AS·분쟁 처리가 모두 깨집니다.

**확인 방법:** [prisma/schema.prisma](prisma/schema.prisma) 에서 `EstimateLineItem`과 `PricingSettings` 사이에 어떤 `@relation` 도 없는지 확인.

### 2. 회사 정보도 snapshot

`Estimate.companyNameSnapshot`, `companyPhoneSnapshot`, `companyAddressSnapshot` 은 견적 생성 시점에 `PricingSettings` 에서 복사됩니다. 회사가 이름이나 연락처를 바꿔도 기존 견적의 PDF는 그대로 발송 당시의 정보를 유지합니다.

### 3. 고객용 PDF는 snapshot 데이터로만 렌더

[components/EstimatePDF.tsx](components/EstimatePDF.tsx) 는 오로지 `Estimate` + `EstimateLineItem` 의 snapshot 필드만 사용해서 렌더링해야 합니다. **원가, 마진, 인건비, 식비 등 내부 항목은 PDF에 절대 노출되면 안 됩니다.**

PDF (v4 디자인) 에 나가는 항목:
- **다크 네이비 헤더**: 회사명, 사업자등록번호, 연락처, 주소 (왼쪽) / **견적 번호 (자동 생성 `No. YYYY-NNN`)**, 발행일, 유효기간 (오른쪽)
- 고객명, 공사위치 / 시공·건물 면적, 공사일정 ("YYYY년 MM월 중") 2단 구성
- 공사 범위: 한 줄 텍스트 (· 로 구분)
- 사용 자재 pill (제품명 / 두께 / 텍스처 / 색상)
- **견적 내역** — 두 모드 토글:
  - **간단**: 5개 그룹 평문 (자재 및 마감 / 시공비 / 장비 및 운송 / 철거 및 폐기 / 기타)
  - **상세**: 표 (품명/규격/수량/금액), 그룹 헤더 (**자재공사 / 노무비 / 기타경비** — 한국 건설 표준 3-카테고리). 인건비+식비+숙박비는 "인건비 (기공·조공)" 한 줄로 묶임. 맨 아래 "소계 (부가세 별도/포함)"
- **최종 견적 금액** 카드 (옅은 회색 배경, 한 줄, "(부가세 포함/별도)" subtle)
- **결제 조건**: 자동 파싱 — "계약금 30% / 잔금 70%" 같은 텍스트를 두 카드로 (% + 금액). 파싱 실패 시 평문
- 입금 계좌 (단가설정 `bankAccount`)
- 안내 문구 (단가설정 `noticeText`, 자동 번호 매김 1, 2, ...)
- 맨 아래 "위와 같이 견적합니다." + 회사명 + 직인 (업로드된 이미지 또는 "(인)" placeholder)

---

## 견적 생성 / 수정 로직

### 생성 (POST `/api/sites/[id]/estimates`)

1. 현재 `PricingSettings` 읽음 (없으면 400 에러)
2. 사용자 입력값 + 공사 유형 받음
3. [lib/calculations.ts](lib/calculations.ts) 의 `buildLineItems` 가 공사 유형에 맞춰 라인아이템 계산
4. 각 라인의 `unitPrice` 가 단가표에서 **복사**됨
5. 합계, 마진, VAT, 최종가도 `Estimate` 에 저장
6. 회사 정보 snapshot도 동시에 복사

### 수정 (PATCH `/api/estimates/[eid]`)

요청 body 의 모양에 따라 10가지 액션 중 하나로 dispatch. 모든 액션은 `recalcAndReturn` 헬퍼를 통과해 합계가 자동 재계산됨:

| Body 모양 | 액션 |
|---|---|
| `{ lineItemId, total }` | 라인 금액 수동 수정 (`isUserEdited = true`) |
| `{ lineItemId, action: "undo" }` | 라인 원래대로 (`total = quantity × unitPrice`, `isUserEdited = false`) |
| `{ lineItemId, action: "delete" }` | 라인 삭제 |
| `{ action: "add", newLineItem }` | 자유 라인 추가 (`{name, quantity, unit, unitPrice, category}`) |
| `{ action: "replace", ...allFields }` | **전체 수정** — 라인 전부 삭제 후 `buildLineItems` 재실행. `?edit=eid` 모드에서 사용. 견적번호와 `pdfSentAt` 은 보존. 회사정보는 재스냅샷 |
| `{ marginRate }` | 마진율 변경 → 마진금액/공급가/최종가 재계산 (라인 그대로) |
| `{ marginAmount }` | 마진금액 직접 입력 → 마진율 역산, 모드 = 'amount' |
| `{ finalPrice }` | 최종가 직접 입력 → 마진금액 역산, 모드 = 'finalPrice' |
| `{ vatIncluded }` | VAT 토글 → 최종가 재계산 |
| `{ paymentTerms / validityDays / pdfUrl / pdfSentAt }` | 메타 필드 업데이트 (whitelist) |

**중요:** `recalcAndReturn` 은 `marginMode === "finalPrice"` 일 때는 사용자가 고정한 `finalPrice` 를 유지하고 `marginRate / marginAmount` 만 재계산합니다 (라인 수정 후에도 "850만원에 맞춰줄게" 가 안 깨지도록).

### 단가 설정 변경

- 기존 견적에 **절대 영향 없음**. 새로 만드는 견적부터 적용됨.

---

## 견적 상세 화면 UX

[app/sites/[id]/estimates/[eid]/EstimateDetail.tsx](app/sites/[id]/estimates/[eid]/EstimateDetail.tsx) — 한 견적의 모든 작업이 이 화면에서 일어남:

- **상단 토글**: "내부 보기" ↔ "고객 보기" 모드
  - 내부 보기: 원가, 마진, 라인아이템 모두 표시
  - **고객 보기**: 라인/마진/원가 모두 숨김. 최종가와 메타만 표시. 현장에서 고객에게 화면 보여줄 때 사용
- **히어로 카드**: 최종 견적가 + VAT 토글 + (내부에서만) 총원가/마진율/면적 칩
- **마진 조정 카드**: 마진율 / 마진금액 / 최종가 직접 — 셋 중 하나 탭 → 인라인 편집, 다른 두 개 자동 역산
- **원가 항목 카드** (펼치기 가능)
  - 각 라인: 카테고리 뱃지, 이름, 수량 × 단가 표시, 우측에 금액 (탭 → 인라인 편집)
  - 수정된 라인: "수정됨" 뱃지 + 원래 금액 표시 + "원래대로" 버튼
  - 라인 삭제: 두 번 탭 확인 ("정말 삭제? → 삭제/취소")
- **하단 sticky 버튼**: "견적서 미리보기" → `/preview` 페이지로
- **미리보기 페이지**: PDF 를 iframe inline 표시 → 검토 후 "PDF 저장" 또는 "카톡 보내기"
  - 카톡 공유 성공 시에만 `pdfSentAt` 기록 (단순 미리보기는 발송으로 안 침)

---

## 공사 유형별 견적 흐름

새 견적 만들기 화면 (`/sites/[id]/estimates/new`):

1. **면적** — 평 / ㎡ 양방향 자동 변환 (평 왼쪽 우선). 시공 면적 필수. 건물 면적은 옵션 토글.
2. **공사 유형** — `roof` / `steelWaterproof` / `rooftopRoof` 중 택1
3. **강판 종류** — 슬레이트골, V250, 징크250, 일반기와형, 전통기와형, 리얼징크, 기타
   - **공사 유형별 기본값:** `steelWaterproof` → 슬레이트골, `roof` / `rooftopRoof` → 징크250
4. **강판 두께** — 0.4t / 0.45t (기본) / 0.5t / 0.6t
5. **색상 / 텍스처** — 9가지 프리셋 (진밤색 기본) + 기타 직접 입력
   - 진밤색, 밤색, 차콜, 진회색, 은회색, 적갈색, 녹색, 청색, 백색
   - 텍스처: 유광 / 무광 / 스톤
6. **하지 작업** — 없음 / 목재 / 철재. 시공면적 × ㎡당 단가 자동 계산
7. **자재 로스율** — 토글 (기본 ON). 끄면 자재 면적 그대로
8. **공사 범위** — 공사 유형에 따라 옵션 다름. **기본은 "용마루 마감"만 체크**, 나머지는 사용자가 선택:
   - `roof`: 덧씌우기 (기본 ON) ↔ 철거 (mutually exclusive), 용마루, 처마, 엔드캡 (+ 개수, 기본 단가 2,000원/개), 폐기물 (+ 트럭 수)
   - `rooftopRoof`: 용마루, 처마, 엔드캡 (+ 개수), 폐기물 — (창고/계단실/옥탑방 옵션은 제거됨)
   - `steelWaterproof`: 난간 → 두겁 (forced dependency, 두겁 절곡 m당 비용), 새 배수구 타공 (+ 개수), 배수구 처리, 창고/계단실/옥탑방 포함, 폐기물
   - **물받이**는 별도 다중선택: 앞·뒤·좌·우 4 버튼 (기본 전부 선택). 모두 선택 시 견적서엔 "전체", 모두 해제 시 "안함" 로 표시. `lib/types.ts` 의 `parseGutterSides` / `serializeGutterSides` / `gutterSidesLabel` 헬퍼 사용
   - **포함 항목들**(난간, 창고, 계단실, 옥탑방)은 시공면적에 포함된 것으로 가정. **두겁만 예외** — 절곡이라 m당 별도 단가 적용
9. **추가 자재 / 부속 (카탈로그)** — 4개 카테고리(마감재 / 물받이 부속 / 부자재 / 절곡) 각각 **iOS 스타일 토글로 심플(OFF) ↔ 상세(ON)** 전환
   - **심플 모드** (기본): 한 줄로 자동 계산. 자재비의 % / m당 / 총금액 중 하나 + 값 입력. ㎡당은 데이터 모델엔 살아있지만 현재 UI에서 숨김 (사용자 피드백: 계산이 어려워서 거의 안 씀)
   - **상세 모드**: 항목별로 수량 + 인라인 단가. 토글을 켜면 카드가 자동 펼쳐짐
   - 심플 모드 기본값 (`lib/catalog.ts` `DEFAULT_CATEGORY_MODES`):
     - 마감재 → 총금액 0원 (사용자가 직접 입력)
     - 물받이부속 → m당 2,000원
     - 부자재 → 자재비의 3%
     - 절곡 → 총금액 0원
   - 단가설정에 `catalogDefaults` 편집기는 아직 없음 — 현재는 새 견적에서 인라인으로 조정
10. **장비대** — 스카이차/사다리차 (일수 −/+), **비계** (일수 + 비계 면적 → ㎡·일 단가로 자동 계산) + 기타 장비 메모
11. **작업 정보** — 작업 일수, 작업 인원 (−/+ 스테퍼)
12. **기타 비용** — 자유 추가 라인아이템 (이름 + 금액). 크레인, 잡비 등
13. **공사 일정** — 연월일 / 연월만 / 안 넣음 3 모드 선택. PDF 에 "2026년 6월 15일" / "2026년 6월 중" / 생략 으로 표시
14. **💰 단가 임시 조정** — 이 견적에만 적용되는 단가 override (collapsed, 4 그룹: 자재 / 하지·스틸방수 / 인건·체류 / 장비·운송). 빈 칸이면 단가 설정 기본값 사용. 변경된 칸이 있으면 헤더에 "N개 변경됨" 뱃지. **단가 설정 자체는 변경되지 않음.**

**기존 견적 수정 (edit mode):** 견적 상세 화면의 "입력값 수정" 버튼 → `/sites/[id]/estimates/new?edit={eid}` 로 이동. 폼이 기존 값으로 prefill 되고, 저장 시 PATCH `{ action: "replace", ... }` 호출 → 라인 전부 재계산. 견적번호와 `pdfSentAt` 은 보존되지만 라인 인라인 편집과 마진 override 는 리셋됨.

추가로 **추가 자재 / 부속** 섹션 (공사 범위 다음)에 4개 카테고리 카탈로그:
- **마감재** — 용마루, 처마, 미시, 하우마끼, 엔드캡, 크로샤, 프래싱, 눈방지턱, 회침, 회침커버, 대봉, 소봉
- **물받이 부속** — 물받이, 걸쇠, 바깥/안코너, 마감캡, 물모음통, 홈통, 엘보
- **부자재** — 실리콘, 스크류 (대/소), Fastener, 앵커볼트
- **절곡** — 1회/2회/3회/커스텀 절곡

각 항목은 수량 입력 + 단가 인라인 수정 가능 (스냅샷 저장). 카탈로그에 없는 항목은 "+ 직접 추가" 로. 수량 > 0 인 것만 견적에 포함.

가격 처리:
- **두께**: 0.45t 기준에 단순 배수 적용 (0.4t ×0.92, 0.5t ×1.08, 0.6t ×1.22 — [lib/calculations.ts](lib/calculations.ts) 의 `THICKNESS_MULT`)
- **로스율**: 토글 ON 시 자재 면적 × (1 + 로스율). 라인아이템 이름에 "(로스율 X% 포함)" 표시
- **포함 항목들**: 면적 자동 계산 없음. 견적서 공사범위 설명에만 표시됨
- **기타 비용**: 입력한 이름과 금액으로 `category: "other"` 라인아이템 생성

설정 화면에 ㎡당 단가 계산기 위젯이 있음 — 강판 너비와 m당 단가를 입력하면 자동으로 ㎡당 단가를 계산해 줌 (모델별 너비가 다른 경우 유용: 슬레이트골 1.0m, 징크250 0.75m, 기와형 0.7m 등).

---

## 환경변수

| 키 | 용도 | 노출 |
|---|---|---|
| `DATABASE_URL` | Postgres 쿼리용 (pooler, 6543) | 서버 |
| `DIRECT_URL` | `prisma migrate` 전용 (5432) | 서버 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 브라우저 OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 키 (RLS 적용됨) | 브라우저 OK |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회 — 사진 업로드용 | **서버 전용** |

상세 형식은 [.env.example](.env.example) 참고.

---

## 자주 쓰는 명령

```bash
npm run dev              # 개발 서버
npm run build            # 프로덕션 빌드
npm run start            # 빌드된 앱 실행
npm run lint             # ESLint

npx prisma migrate dev   # 새 마이그레이션 생성 + 적용
npx prisma migrate deploy # 프로덕션 마이그레이션 적용
npx prisma studio        # DB GUI (table editor)
npx prisma generate      # 클라이언트 재생성

npx tsc --noEmit         # 타입 체크만
```

---

## 배포 (예정)

Vercel 권장. 절차:

1. GitHub repo를 Vercel에 연결
2. Environment Variables 에 위 5개 키 모두 등록
3. Build command 는 기본값 (`next build` 자동으로 Prisma generate 포함)
4. `next.config.ts` 의 `images.remotePatterns` 가 사용 중인 Supabase 프로젝트 호스트네임과 일치하는지 확인

---

## 진실 공급원

제품 결정과 비즈니스 로직의 진실은 [roofing_app_spec.md](roofing_app_spec.md) (한국어, 사용자 작성). README 와 코드 주석은 그 스펙을 충실히 구현한 것입니다. 둘이 충돌하면 **스펙이 이깁니다.**

`v0` 범위에서 명시적으로 제외된 기능 (CRM, 인보이스, 대시보드, AI, 지도, 사용자 권한 등) 은 스펙의 "v0에 들어가지 않는 것" 섹션 참고. 추가하려면 먼저 사용자와 합의가 필요합니다.
