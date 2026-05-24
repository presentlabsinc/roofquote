-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "pricingOverrides" JSONB NOT NULL DEFAULT '{}';
