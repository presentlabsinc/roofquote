-- CreateTable
CREATE TABLE "PricingSettings" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyPhone" TEXT,
    "companyAddress" TEXT,
    "materialPricePerSqm" INTEGER NOT NULL,
    "accessoryRate" DOUBLE PRECISION NOT NULL,
    "ridgePricePerM" INTEGER NOT NULL,
    "eavePricePerM" INTEGER NOT NULL,
    "gutterPricePerM" INTEGER NOT NULL,
    "removalPricePerSqm" INTEGER NOT NULL,
    "wasteDisposalCost" INTEGER NOT NULL,
    "dailyWage" INTEGER NOT NULL,
    "defaultWorkerCount" INTEGER NOT NULL,
    "skyliftDailyCost" INTEGER NOT NULL,
    "ladderTruckDailyCost" INTEGER NOT NULL,
    "baseTransportCost" INTEGER NOT NULL,
    "mealCostPerPersonMeal" INTEGER NOT NULL,
    "lodgingCostPerPersonNight" INTEGER NOT NULL,
    "defaultMarginRate" DOUBLE PRECISION NOT NULL,
    "vatIncludedByDefault" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "siteAddress" TEXT NOT NULL,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "generalMemo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "areaM2" DOUBLE PRECISION NOT NULL,
    "workerCount" INTEGER NOT NULL,
    "workDays" DOUBLE PRECISION NOT NULL,
    "gutterLengthM" DOUBLE PRECISION,
    "skyliftDays" DOUBLE PRECISION,
    "ladderTruckDays" DOUBLE PRECISION,
    "scopeFlags" JSONB NOT NULL DEFAULT '{}',
    "totalCost" INTEGER NOT NULL,
    "marginMode" TEXT NOT NULL,
    "marginRate" DOUBLE PRECISION NOT NULL,
    "marginAmount" INTEGER NOT NULL,
    "supplyPrice" INTEGER NOT NULL,
    "vat" INTEGER NOT NULL,
    "finalPrice" INTEGER NOT NULL,
    "vatIncluded" BOOLEAN NOT NULL,
    "paymentTerms" TEXT NOT NULL DEFAULT '계약금 30% / 잔금 70%',
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "companyNameSnapshot" TEXT NOT NULL,
    "companyPhoneSnapshot" TEXT,
    "companyAddressSnapshot" TEXT,
    "pdfUrl" TEXT,
    "pdfSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLineItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "unitPrice" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "isUserEdited" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "EstimateLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Estimate_siteId_idx" ON "Estimate"("siteId");

-- CreateIndex
CREATE INDEX "EstimateLineItem_estimateId_idx" ON "EstimateLineItem"("estimateId");

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
