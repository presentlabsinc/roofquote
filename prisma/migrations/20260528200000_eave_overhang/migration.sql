-- 처마 돌출 (cm) — 지붕공사/옥상지붕에서 건물 둘레 vs 처마 외곽 둘레 차이 반영.
-- 외곽 둘레 = 건물 둘레 + 8 × (eaveOverhangCm / 100).
ALTER TABLE "Estimate"
  ADD COLUMN "eaveOverhangCm" INTEGER NOT NULL DEFAULT 50;
