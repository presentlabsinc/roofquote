-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "applyLossRate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lossRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "defaultLossRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
ADD COLUMN     "useLossRateByDefault" BOOLEAN NOT NULL DEFAULT false;
