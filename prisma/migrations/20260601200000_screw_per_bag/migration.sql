-- 스크류 봉지당 개수 (설정 봉지 가격 → 1개당 환산 입력용)
ALTER TABLE "PricingSettings"
  ADD COLUMN "screwLargePerBag" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "screwSmallPerBag" INTEGER NOT NULL DEFAULT 100;
