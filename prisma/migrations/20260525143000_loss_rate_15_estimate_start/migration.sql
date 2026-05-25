-- Bump defaultLossRate default 0.10 -> 0.15 (existing rows keep their value).
ALTER TABLE "PricingSettings" ALTER COLUMN "defaultLossRate" SET DEFAULT 0.15;

-- New: per-user starting number for 견적 번호 (YYYY-XXX format).
-- Defaults to 1 so the first estimate is always YYYY-001 unless changed.
ALTER TABLE "PricingSettings" ADD COLUMN "estimateNumberStart" INTEGER NOT NULL DEFAULT 1;
