-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "gutterMode" TEXT,
ADD COLUMN     "scaffoldAreaM2" DOUBLE PRECISION,
ADD COLUMN     "substructureType" TEXT,
ADD COLUMN     "wasteTruckCount" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "scaffoldPricePerSqmDay" INTEGER NOT NULL DEFAULT 3000,
ADD COLUMN     "substructureMode" TEXT NOT NULL DEFAULT 'wood',
ADD COLUMN     "substructureSteelPricePerSqm" INTEGER NOT NULL DEFAULT 40000,
ADD COLUMN     "substructureWoodPricePerSqm" INTEGER NOT NULL DEFAULT 30000;
