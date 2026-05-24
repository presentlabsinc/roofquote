-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "bankAccountSnapshot" TEXT,
ADD COLUMN     "estimateNumber" TEXT,
ADD COLUMN     "noticeTextSnapshot" TEXT;

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "noticeText" TEXT;
