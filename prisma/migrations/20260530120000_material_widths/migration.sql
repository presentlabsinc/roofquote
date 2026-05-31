-- 자재별 유효폭(mm) 사용자 override (JSON). 비면 코드 상수 폴백.
ALTER TABLE "PricingSettings"
  ADD COLUMN "materialWidths" JSONB NOT NULL DEFAULT '{}';
