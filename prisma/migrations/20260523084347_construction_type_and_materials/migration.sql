-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "constructionType" TEXT NOT NULL DEFAULT 'roof',
ADD COLUMN     "materialColor" TEXT,
ADD COLUMN     "materialThickness" TEXT DEFAULT '0.45',
ADD COLUMN     "materialType" TEXT,
ADD COLUMN     "otherEquipment" TEXT,
ADD COLUMN     "scaffoldDays" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "scaffoldDailyCost" INTEGER NOT NULL DEFAULT 150000;
