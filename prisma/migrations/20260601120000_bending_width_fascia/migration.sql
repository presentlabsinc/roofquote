-- 페이샤/후레싱 절곡 기본 넓이 (mm)
ALTER TABLE "PricingSettings"
  ADD COLUMN "bendingWidthFascia" INTEGER NOT NULL DEFAULT 200;
