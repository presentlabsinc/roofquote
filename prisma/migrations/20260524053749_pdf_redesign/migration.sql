-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "businessRegistrationNumberSnapshot" TEXT,
ADD COLUMN     "constructionMonth" TEXT,
ADD COLUMN     "materialTexture" TEXT,
ADD COLUMN     "sealImageUrlSnapshot" TEXT;

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "businessRegistrationNumber" TEXT,
ADD COLUMN     "sealImageUrl" TEXT;
