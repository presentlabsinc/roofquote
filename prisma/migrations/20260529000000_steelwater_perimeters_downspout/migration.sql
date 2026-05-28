-- 스틸방수 — 난간/옥탑 구조물 둘레 직접 입력 + 홈통 개수
ALTER TABLE "PricingSettings"
  ADD COLUMN "downspoutUnitPrice" INTEGER NOT NULL DEFAULT 50000;

ALTER TABLE "Estimate"
  ADD COLUMN "railPerimeterM"             DOUBLE PRECISION,
  ADD COLUMN "rooftopStructurePerimeterM" DOUBLE PRECISION,
  ADD COLUMN "downspoutCount"             INTEGER NOT NULL DEFAULT 0;
