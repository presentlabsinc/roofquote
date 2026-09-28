-- Row Level Security 활성화 (2026-09-28 보안 점검).
--
-- Supabase 는 public 스키마를 Data API(PostgREST)로 노출하고, 브라우저에 공개되는 anon 키로
-- 접근할 수 있다. 테이블에 RLS 가 없으면 anon 키만으로 모든 사용자의 고객 정보·견적을 읽고
-- 쓸 수 있다. 앱은 Supabase Data API 를 쓰지 않고 Prisma(테이블 소유자 postgres 역할)로만
-- 접근하므로, RLS 를 켜고 정책을 두지 않으면: 앱은 그대로(소유자는 RLS 우회), anon·authenticated
-- 역할의 Data API 접근은 전부 차단된다.
--
-- ⚠️ FORCE ROW LEVEL SECURITY 는 쓰지 않는다 — 쓰면 소유자(Prisma)도 막혀 앱이 멈춘다.
-- 이미 켜져 있는 테이블에 다시 실행해도 무해 (idempotent).
ALTER TABLE "PricingSettings"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PricingPreset"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Site"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Estimate"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EstimateLineItem"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
