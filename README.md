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
| 인증 | Supabase Auth (@supabase/ssr) | 카카오/구글/이메일. 멀티테넌트 — 데이터는 userId 스코프 |
| 데이터베이스 | Supabase Postgres (Seoul ap-northeast-2) | Prisma 6 ORM |
| 스토리지 | Supabase Storage | `site-photos` 버킷 |
| PDF | @react-pdf/renderer | 서버사이드 렌더 |
| 공유 | Web Share API | 카톡 공유 → fallback: 클립보드 |
| 테스트 | vitest | `npm test` — 계산 엔진 + 프리셋 스냅샷 |
| 배포 | Vercel (icn1 Seoul) | main 푸시 = 자동 배포 |

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
5. **Authentication** — 로그인 방식: 카카오/구글 OAuth (Providers 에서 설정) + 이메일/비밀번호.
   베타 동안 회원가입은 닫혀 있음 — 계정은 Supabase 대시보드 (Authentication → Users) 에서 admin 이 직접 생성.
   모든 페이지·API 는 로그인 필수 (`middleware.ts` 가 미인증 요청을 `/login` 으로 리다이렉트).

---

## 아키텍처 개요

### 디렉터리 구조

```
roofquote/
├── middleware.ts                                    # 세션 갱신 + 미인증 → /login 리다이렉트 (유일한 토큰 검증 지점)
├── app/
│   ├── login/                                       # 로그인 페이지 (카카오/구글/이메일)
│   ├── auth/callback/                               # OAuth 리턴 URL → 세션 교환
│   ├── api/                                         # API routes (전부 로그인 필수, userId 스코프)
│   │   ├── auth/logout/                             # POST 로그아웃
│   │   ├── settings/                                # GET/POST 단가 설정
│   │   ├── presets/                                 # GET/POST 단가 프리셋 + [id]/ (activate/overwrite/rename/delete)
│   │   ├── sites/                                   # 현장 CRUD
│   │   │   ├── [id]/                                # 현장 상세/수정/삭제
│   │   │   └── [id]/estimates/                      # POST 새 견적 생성 (라인아이템 자동 계산)
│   │   ├── estimates/[eid]/                         # PATCH 견적 수정 (10 액션 dispatch)
│   │   ├── estimates/[eid]/pdf/                     # GET PDF (inline 기본, ?download=1 로 다운로드)
│   │   └── upload/                                  # POST 사진 업로드 → Supabase Storage URL 반환
│   ├── settings/                                    # 단가 설정 (프리셋 바 + 단가표 카드들)
│   ├── sites/
│   │   ├── new/                                     # 새 현장 등록 폼
│   │   └── [id]/
│   │       ├── page.tsx                             # 현장 상세 (사진, 견적 목록)
│   │       └── estimates/
│   │           ├── new/                             # 새 견적 만들기 (?edit=eid 로 수정 모드 겸용)
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
│   ├── CatalogPicker.tsx                            # 추가 자재 4그룹 카드 (마감재/부자재/물받이부속/절곡)
│   └── ui/                                          # shadcn/ui (button, input, card, etc.) + number-stepper
├── lib/
│   ├── prisma.ts                                    # PrismaClient 싱글톤
│   ├── supabase.ts / supabase-server.ts             # 브라우저 anon / 서버 세션 + supabaseAdmin (service role)
│   ├── auth.ts                                      # requireUser / requireUserAndSettings / getOrCreatePricingSettings
│   ├── calculations.ts                              # buildLineItems / calcTotals / calcFromFinalPrice / 자재 자동 추정
│   ├── types.ts                                     # ConstructionType, ScopeFlags, FinishingMethods, PricingOverrides 등
│   ├── catalog.ts                                   # 천보 실단가 카탈로그 + 4그룹 정의 + 유형별 기본값
│   ├── presets.ts                                   # 프리셋 스냅샷 범위 (단가·계수만, 회사정보 제외)
│   ├── __tests__/                                   # vitest — 계산 엔진 + 프리셋 (npm test)
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

전체 스키마(필드별 주석 포함)는 [prisma/schema.prisma](prisma/schema.prisma) 가 진실 — 여기선 모델 5개의 역할과 관계만 요약합니다.

```
PricingSettings  (사용자당 1행, userId @unique — "살아있는 단가표")
  견적 계산의 모든 노브가 여기 있음. 절대 Estimate 와 FK 로 연결하지 않음 —
  견적 생성 시점에 값이 복사(snapshot)됨.
  · 회사 정보 (회사명/연락처/주소/사업자번호/직인/계좌/안내문구 — 견적에 스냅샷됨)
  · 자재 단가: 강판 자재별 m당 단가(천보 도매가) + 유효폭 → ㎡당 환산
  · 소비 계수: 하지 개당단가 × 개/㎡ (목재 1.4 / 철재 0.76), 스크류 개/㎡·개/절곡m, 실리콘 커버 m
  · 절곡: bendingPricePerMmPer3m (자재비+가공비 포함, 3m 본 기준) + 부재별 기본 넓이 mm
  · 노무·경비: 일당, 식대·간식, 숙박, 팀경비, 제경비(산재·고용 ≈ 노무비 5%)
  · 장비·운송: 스카이차/사다리차/비계(㎡·일)/운송비/폐기물(트럭당), 배수구 처리(식)
  · 정책: 기본 마진율(매출 대비), VAT 기본, 로스율(수동/지붕형태별 자동), 마진 분배 비율(50/25/25)
  · JSON override 5종: catalogDefaults(그룹 심플 기본값)·catalogPrices(카탈로그 아이템 단가)·
    thicknessMultipliers(두께 배수)·roofShapeLossRates(형태별 로스율)·materialWidths(유효폭)
  · 계수: constructionToBuildingRatio(1.4)·workDaysAreaDivisor(90㎡/일)·하지 개/㎡·소모품 계수
  · activePresetId (활성 프리셋 추적)

PricingPreset  (userId 스코프 — 이름 붙인 단가표 스냅샷, "표준"/"겨울 비수기" 등)
  snapshotJson = 단가·계수 필드만 (회사정보/견적번호/이력 제외 — lib/presets.ts PRESET_EXCLUDE).
  전환(activate) = 값을 PricingSettings 에 복사. 견적 스냅샷 로직과 무관.

Site  (userId 스코프)
  고객명/연락처/주소, photos Json [{url, memo?}], generalMemo. Estimate 는 Site 를 통해 소유권 상속.

Estimate  (모든 입력값·단가·합계가 생성 시점 snapshot)
  · 공사: constructionType (roof/steelWaterproof/rooftopRoof), 자재 종류/두께/색상/텍스처, 일정(YYYY-MM)
  · 면적·형태: areaM2(계산 기준), 건물면적, 건물형태(ㅁ/ㄱ/ㄷ), 지붕형태(박공/모임/…), 둘레, 처마돌출
  · 범위: scopeFlags Json + 물받이(4면 다중선택)/배수로/타공/폐기물/하지 타입 등 개별 필드
  · 스틸방수: 난간둘레·파라펫높이(파라펫 분리 계산), 옥탑 둘레/높이/문/창, 홈통
  · 마감 방식: finishingMethods Json — 부재별 절곡/기성품 (자재 타입이 기본값 결정)
  · 경비 토글: includeLodging(숙박, lodgingNights 박수 직접 입력 가능)/includeTeamExpense(팀경비)/includeInsurance(제경비)
  · 조정 레이어: pricingOverrides Json (견적별 절대값 단가), catalogModes/catalogSelections (추가 자재)
  · 합계 snapshot: totalCost, marginMode/Rate/Amount, supplyPrice, vat, finalPrice (매출 대비 마진)
  · 회사 정보 snapshot 7종 + 견적번호(YYYY-NNN 자동 채번) + pdfSentAt

EstimateLineItem  (라인마다 자기 단가 스냅샷)
  category(material/labor/equipment/transport/meals/lodging/waste/removal/other),
  name, quantity, unit, unitPrice(생성 시점 복사 — 재계산 금지), total, isUserEdited, sortOrder
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
- **견적 내역** — 두 모드 토글 (마진은 `distributeMarginForDisplay` 로 라인에 분배되어 표시 — 내부 원가 노출 없음):
  - **간단** (기본): 그룹 평문 — 자재 및 마감 일체 / 시공비 (현장 관리 포함) / 장비 및 운송 / 철거 및 폐기 / 현장 경비. **이윤은 간단에선 별도 줄 없이 시공비에 녹임** (거부감 방지). 빈 그룹은 생략
  - **상세**: 표 (품명/규격/수량/금액), 그룹 헤더 **자재공사 / 노무비 / 기타경비 / 이윤** (표준품셈 형식 — 상세에선 이윤 줄 유지). 인건비+식비+숙박비는 "인건비 (기공·조공)" 한 줄로 묶임. 숙박비·팀경비는 고객 PDF 에 별도 라인으로 안 나옴. 맨 아래 "소계 (부가세 별도/포함)"
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

새 견적 만들기 화면 (`/sites/[id]/estimates/new`) — 섹션 순서대로:

1. **공사 유형** — `roof`(지붕공사) / `steelWaterproof`(옥상방수 바닥형) / `rooftopRoof`(옥상지붕) 택1
2. **면적** — 평 / ㎡ 양방향 자동 변환. 시공 면적 필수 (계산 기준). 건물 면적은 옵션.
   이어서 **건물 평면 형태 (ㅁ/ㄱ/ㄷ) + 지붕 형태 (박공/모임/팔작/외쪽/멘사드)** — 자재 자동 추정
   (용마루·처마 길이, 둘레, 형태별 로스율)의 입력. 안 골라도 √면적 근사로 폴백.
3. **공사 범위** — 유형별 체크리스트 (`SCOPE_BY_TYPE`). 덧씌우기 ↔ 철거는 상호 배제, 난간 → 두겁은
   강제 동반. 난간/창고/계단실/옥탑방은 "시공면적에 포함" 힌트 (면적 자동 불리기 없음 — 사용자가 실면적 입력).
   스틸방수는 난간 둘레·파라펫 높이 직접 입력 → 두겁/미시 절곡 + **파라펫 분리** (난간 안쪽 절반을
   본 강판에서 빼서 파라펫 자재로 — 추가 아님). 물받이는 앞·뒤·좌·우 4면 다중선택 (기본 앞·뒤 2면)
   + 길이 자동 추정 + 선홈통 개수(기본 4개). 스틸방수는 스테인리스 배수로 + 홈통 개수로 대체.
   면적만 넣어도 난간 둘레(형태계수·파라펫 벽 역산)·배수로·작업일수가 자동 채움 (직접 입력 시 보존).
4. **지붕재 종류 / 두께 / 색상·텍스처** — 강판 자재별 m당 단가(천보 도매가) → ㎡ 환산.
   두께는 0.45t 기준 배수 (0.4 ×0.92 / 0.5 ×1.08 / 0.6 ×1.22). PE폼 체크(기본 ON).
5. **하지 작업** — 없음 / 목재 / 철재. **개수 모델**: 면적 × 개/㎡ 계수 × 개당 매입단가 → "목재 N개" 발주 수량으로 산출.
6. **자재 로스율** — 지붕 형태별 자동(박공 7%~멘사드 18%) 또는 수동 고정. 강판·파라펫에만 적용.
7. **추가 자재 / 부속** — 맨 위 **용마루 마감 방식 칩 (절곡 제작 ↔ 기성품)**: 자재가 기본값 결정
   (기와형 → 기성품 개수 환산, 그 외 → 절곡). 아래 4그룹 카드 (각각 체크 + 심플↔상세 토글):
   - **마감재 (기성품)** — 심플: ㎡당 (지붕 기본 1,000원). 상세: 천보 카탈로그 (용마루/하우막기/대봉 등)
   - **부자재 (피스·실링 등)** — 심플: 자재비의 8% (샘플 실측 근거)
   - **물받이 부속** — 심플: m당 2,000원 (물받이 길이 기준)
   - **절곡** — 심플: ㎡당 3,000원 (샘플 후레싱류 고객가 3,200~9,300원/㎡ → 원가 근사, 전 유형 동일).
     상세: **총 전개 넓이(mm) 입력 → 넓이 × 절곡단가** (모든 절곡은 3m 본 단위)
   - 그룹 기본값은 공사 유형별 (`defaultGroupModes`): 지붕/옥상지붕 = 기성품+절곡 둘 다 체크(절곡 > 기성품),
     스틸방수 = 절곡만 체크
8. **장비대** — 스카이차/사다리차 (일수, 단가 표시), 비계 (면적 × 일수 × ㎡·일 단가), 기타 장비 메모
9. **노무비** — 작업 일수 / 인원 스테퍼 + **부대비용(경비) 토글 3개**: 제경비(산재·고용, 노무비×5%,
   기본 ON) / 숙박비(원거리만, 기본 OFF) / 팀 경비(잡비, 기본 OFF). 운송·식대는 항상 자동 포함.
   체크하면 인라인 조정 펼침 — 제경비 %, 숙박 박수(비워두면 작업일수−1), 팀경비 금액.
10. **기타 비용** — 자유 추가 라인 (크레인 등)
11. **공사 일정** — 연월일 / 연월 / 안 넣음
12. **단가 임시 조정** — 이 견적에만 적용되는 절대값 override (collapsed). 빈 칸 = 설정 기본값.
    **단가 설정 자체는 변경되지 않음.**

**기존 견적 수정 (edit mode):** 견적 상세의 "입력값 수정" → `?edit={eid}` 폼 prefill → PATCH `{ action: "replace" }` 로 전체 재산정. 견적번호·`pdfSentAt` 보존, 라인 인라인 편집·마진 override 는 리셋, **단가는 현재 설정값으로 재스냅샷** (확인 다이얼로그로 고지).

### 설정 화면 (단가표)

- **프리셋 바** (상단): 현재 단가표 이름 + 불러오기 (공장 기본값 — 삭제 불가 — 와 내 프리셋들).
  하단 저장 버튼은 `저장 · '표준' 갱신` 처럼 덮어쓸 대상을 표시. [다른 이름으로] = 새 프리셋.
- **단가표 카드들**: 강판 자재별 (유효폭 + m당 → ㎡ 환산), **두께 배수**, 부자재 규격 환산,
  **하지 (개당단가 × 개/㎡ → 평당 N개·M원 표시)**, **추가 자재 기본값 (절곡 ㎡당·부자재 %·물받이 m당·기성품 ㎡당)**,
  **카탈로그 단가표 (~40개 천보가 override, 접힘)**, 절곡 (부재별 넓이 → 3m당 환산),
  소모품 (봉지 → 개당 환산 + 소비 계수), 단열재, 스틸방수, 노무·경비, 장비·운송,
  **지붕 형태별 자동 로스율**, 마진 분배 비율, 시공÷건물 비·작업일수 기준 같은 계수 행.
- JSON override 는 전부 "빈 칸 = 공장 기본(placeholder 표시)" 패턴.
- 모든 단가·계수가 여기서 조정 가능 — **한 번 세팅하면 이후 모든 견적이 그 값으로** (제품 북극성).

---

## 환경변수

| 키 | 용도 | 노출 |
|---|---|---|
| `DATABASE_URL` | Postgres 쿼리용 (Supabase pooler) | 서버 |
| `DIRECT_URL` | `prisma migrate` 전용 (5432) | 서버 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 브라우저 OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 키 (RLS 적용됨) | 브라우저 OK |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회 — 사진 업로드용 | **서버 전용** |

상세 형식은 [.env.example](.env.example) 참고.

---

## 자주 쓰는 명령

```bash
npm run dev              # 개발 서버
npm run build            # 프로덕션 빌드 (prisma migrate deploy 포함)
npm run start            # 빌드된 앱 실행
npm run lint             # ESLint
npm test                 # vitest — 계산 엔진 + 프리셋 스냅샷 (계산 로직 수정 시 필수)

npx prisma migrate dev   # 새 마이그레이션 생성 + 적용
npx prisma migrate deploy # 프로덕션 마이그레이션 적용
npx prisma studio        # DB GUI (table editor)
npx prisma generate      # 클라이언트 재생성

npx tsc --noEmit         # 타입 체크만
```

---

## 배포

Vercel 에 배포되어 있음 (region: `icn1` Seoul). **`main` 브랜치 푸시 = 자동 배포.**

- Environment Variables 에 위 5개 키 등록됨
- Build command: `prisma migrate deploy && next build` (package.json — 배포 시 마이그레이션 자동 적용)
- `next.config.ts` 의 `images.remotePatterns` 는 사용 중인 Supabase 프로젝트 호스트네임과 일치해야 함
- Supabase Auth 의 Redirect URLs 에 배포 도메인의 `/auth/callback` 등록 필요

---

## 진실 공급원

제품 결정과 비즈니스 로직의 진실은 [roofing_app_spec.md](roofing_app_spec.md) (한국어, 사용자 작성). README 와 코드 주석은 그 스펙을 충실히 구현한 것입니다. 둘이 충돌하면 **스펙이 이깁니다.**

`v0` 범위에서 명시적으로 제외된 기능 (CRM, 인보이스, 대시보드, AI, 지도, 사용자 권한 등) 은 스펙의 "v0에 들어가지 않는 것" 섹션 참고. 추가하려면 먼저 사용자와 합의가 필요합니다.
