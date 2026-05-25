-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "stainlessDrainLengthM" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "stainlessDrainPricePerM" INTEGER NOT NULL DEFAULT 50000,
ALTER COLUMN "endCapPrice" SET DEFAULT 2000;
