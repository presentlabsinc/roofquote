-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "activePresetId" TEXT;

-- CreateTable
CREATE TABLE "PricingPreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "snapshotJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingPreset_userId_idx" ON "PricingPreset"("userId");
