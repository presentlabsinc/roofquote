# 지붕견적 — RoofQuote

현장에서 바로 쓰는 모바일 우선 지붕공사 견적 도구.

칼라강판 지붕공사 / 옥상 스틸방수 / 옥상지붕 시공 업체를 위한 견적 작성 → 고객 PDF 발송 → 카톡 공유까지 한 흐름으로 처리하는 웹앱입니다. 영업사원이 현장에서 사진을 찍고, 면적·공사 범위·자재를 입력하면 원가와 마진이 즉시 계산되고, 고객용 견적서 PDF가 생성됩니다.

> **개발 현황:** v0 MVP. 단일 사용자(포스코지붕공사)가 매일 쓸 수 있는 최소 도구. CRM, 인보이스, 대시보드, AI, 위성지도 등은 v0 이후 단계적으로 추가 예정.

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
│   ├── api/                       # API routes
│   │   ├── settings/              # GET/POST 단가 설정
│   │   ├── sites/                 # 현장 CRUD
│   │   │   ├── [id]/              # 현장 상세/수정/삭제
│   │   │   └── [id]/estimates/    # POST 새 견적 생성 (라인아이템 자동 계산)
│   │   ├── estimates/[eid]/       # PATCH 견적 수정 (라인 / 마진 / 최종가)
│   │   ├── estimates/[eid]/pdf/   # GET 고객용 PDF 다운로드
│   │   └── upload/                # POST 사진 업로드 → Supabase Storage URL 반환
│   ├── settings/                  # 단가 설정 페이지
│   ├── sites/                     # 현장 목록 → 상세 → 견적
│   ├── manifest.ts                # PWA manifest
│   ├── layout.tsx                 # 루트 레이아웃 (Pretendard, BottomNav, Toaster)
│   └── page.tsx                   # 홈 (현장 목록)
├── components/
│   ├── AppHeader.tsx              # 글래스 블러 sticky 헤더 + 뒤로가기
│   ├── BottomNav.tsx              # 플로팅 pill 하단 네비
│   ├── EstimatePDF.tsx            # @react-pdf/renderer 문서 컴포넌트
│   └── ui/                        # shadcn/ui (button, input, card 등)
├── lib/
│   ├── prisma.ts                  # PrismaClient 싱글톤
│   ├── supabase.ts                # supabase (anon) + supabaseAdmin (service role)
│   ├── calculations.ts            # buildLineItems / calcTotals / calcFromFinalPrice
│   ├── types.ts                   # ConstructionType, MaterialType, ScopeFlags 등
│   └── utils.ts                   # cn() 유틸
├── prisma/
│   ├── schema.prisma              # 데이터 모델
│   └── migrations/                # Postgres 마이그레이션 이력
├── public/
│   └── icon.svg                   # PWA 앱 아이콘
└── roofing_app_spec.md            # 한국어 원본 제품 기획서 (변경 금지 — 진실 공급원)
```

### 데이터 모델

```
PricingSettings (live config — 절대 FK로 연결 안 함)
  ├─ 회사정보 (companyName, companyPhone, companyAddress)
  ├─ 단가 (자재/장비/인건비/체류비/마진 등 17개 항목)
  └─ 기본값 (defaultMarginRate, vatIncludedByDefault)

Site
  ├─ 고객 정보 (customerName, customerPhone)
  ├─ 현장 주소 (siteAddress)
  ├─ 사진 (photos: Json — Supabase Storage URL 배열)
  ├─ 메모 (generalMemo)
  └─ Estimate[] (1:N)

Estimate
  ├─ 공사 정보 (constructionType, materialType, materialThickness, materialColor)
  ├─ 입력값 (areaM2, workerCount, workDays, gutterLengthM, *Days 등)
  ├─ scopeFlags (Json — 어떤 공사 범위 체크박스가 켜졌는지)
  ├─ 합계 snapshot (totalCost, marginRate, marginAmount, supplyPrice, vat, finalPrice)
  ├─ 회사정보 snapshot (companyNameSnapshot, companyPhoneSnapshot, companyAddressSnapshot)
  ├─ 메타 (paymentTerms, validityDays, vatIncluded)
  └─ EstimateLineItem[] (1:N)

EstimateLineItem  ← 각 라인이 자기 단가 스냅샷을 보유
  ├─ category, name, quantity, unit
  ├─ unitPrice (견적 생성 시점의 단가 복사본)
  ├─ total (사용자 직접 수정 가능)
  └─ isUserEdited (수정 여부 표시)
```

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

PDF에 나가는 항목:
- 회사 정보 / 고객 정보 / 현장 주소
- 공사 유형 + 자재 종류·두께·색상
- 공사 범위 (사람이 읽을 수 있는 문구로 변환)
- 예상 면적
- 공급가 + VAT + **최종 견적가**만 (라인아이템 단가나 마진율은 절대 표시 안 함)
- 결제 조건 / 유효기간 / 안내 문구

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

5가지 케이스, 각각 처리 방식이 다릅니다:

| 입력 | 처리 |
|---|---|
| `lineItemId + total` | 해당 라인의 total 만 업데이트, `isUserEdited = true`, 합계 재계산 |
| `marginRate` | 라인은 안 건드림. `Estimate` 의 마진/공급가/최종가만 재계산 |
| `marginAmount` | 마진율 역산, 마진 모드를 'amount' 로 기록 |
| `finalPrice` | `marginAmount = finalPrice - totalCost - vat` 로 역산. 라인은 그대로 |
| `vatIncluded` | VAT 토글, 최종가 재계산 |

### 단가 설정 변경

- 기존 견적에 **절대 영향 없음**. 새로 만드는 견적부터 적용됨.

---

## 공사 유형별 견적 흐름

새 견적 만들기 화면 (`/sites/[id]/estimates/new`) 9단계 + 로스율 토글:

1. **면적** — ㎡ ↔ 평 양방향 자동 변환. 시공 면적 필수. 건물 면적은 옵션 토글.
2. **공사 유형** — `roof` / `steelWaterproof` / `rooftopRoof` 중 택1
3. **자재 종류** — 슬레이트골, V250, 징크250, 일반기와형, 전통기와형, 리얼징크, 기타
4. **자재 두께** — 0.4t / 0.45t (기본) / 0.5t / 0.6t
5. **색상 / 텍스처** — 9가지 프리셋 (진밤색 기본) + 기타 직접 입력
   - 진밤색, 밤색, 차콜, 진회색, 은회색, 적갈색, 녹색, 청색, 백색
6. **자재 로스율** — 토글 (기본 OFF). 켜면 입력한 %만큼 자재 면적이 증가
7. **공사 범위** — 공사 유형에 따라 옵션 다름:
   - `roof`: 덧씌우기, 철거, 용마루, 처마, 물받이(+길이), 폐기물
   - `rooftopRoof`: 골조보강, 용마루, 처마, 물받이(+길이), 창고/계단실/옥탑방 포함, 폐기물
   - `steelWaterproof`: 난간및두겁, 기존방수재철거, 배수구, 창고/계단실/옥탑방 포함, 폐기물
   - **포함 항목들**(난간/두겁, 창고, 계단실, 옥탑방)은 시공면적에 포함된 것으로 가정. 별도 계산 없이 견적서에 명시만 됨.
8. **장비대** — 스카이차/사다리차/비계 각각 사용 일수 (−/+ 스테퍼) + 기타 장비 메모
9. **작업 정보** — 작업 일수, 작업 인원 (−/+ 스테퍼)
10. **기타 비용** — 자유 추가 라인아이템 (이름 + 금액). 크레인, 추가 자재, 절곡비 등

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
