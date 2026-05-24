-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "catalogModes" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "catalogDefaults" JSONB NOT NULL DEFAULT '{}';
