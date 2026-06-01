-- 처마/덴조 — 건당 시공 단가 + 견적별 건수
ALTER TABLE "PricingSettings"
  ADD COLUMN "denjoPricePerUnit" INTEGER NOT NULL DEFAULT 700000;
ALTER TABLE "Estimate"
  ADD COLUMN "denjoCount" INTEGER NOT NULL DEFAULT 0;
