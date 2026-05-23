-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "buildingAreaM2" DOUBLE PRECISION,
ADD COLUMN     "stairwellAreaM2" DOUBLE PRECISION,
ADD COLUMN     "warehouseAreaM2" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "parapetMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.4;
