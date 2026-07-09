-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "catalogPrices" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "constructionToBuildingRatio" DOUBLE PRECISION NOT NULL DEFAULT 1.4,
ADD COLUMN     "drainageWorkCost" INTEGER NOT NULL DEFAULT 500000,
ADD COLUMN     "roofShapeLossRates" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "thicknessMultipliers" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "workDaysAreaDivisor" INTEGER NOT NULL DEFAULT 90;
