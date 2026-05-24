-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "endCapCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "endCapPrice" INTEGER NOT NULL DEFAULT 12000;
