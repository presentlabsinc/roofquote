-- 로스율 모드 (auto / manual) 추가 + 물받이 단가 일괄 5,000원으로 변경
ALTER TABLE "PricingSettings"
  ADD COLUMN "lossRateMode" TEXT NOT NULL DEFAULT 'auto';

-- 사용자 요청: 물받이 단가 디폴트를 5,000원/m 로 통일.
-- 모든 기존 PricingSettings 행의 gutterPricePerM 을 5000 으로 업데이트.
UPDATE "PricingSettings" SET "gutterPricePerM" = 5000;
