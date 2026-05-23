-- CreateTable
CREATE TABLE "PricingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "companyPhone" TEXT,
    "companyAddress" TEXT,
    "materialPricePerSqm" INTEGER NOT NULL,
    "accessoryRate" REAL NOT NULL,
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
    "defaultMarginRate" REAL NOT NULL,
    "vatIncludedByDefault" BOOLEAN NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "siteAddress" TEXT NOT NULL,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "generalMemo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "areaM2" REAL NOT NULL,
    "workerCount" INTEGER NOT NULL,
    "workDays" REAL NOT NULL,
    "gutterLengthM" REAL,
    "skyliftDays" REAL,
    "ladderTruckDays" REAL,
    "scopeFlags" TEXT NOT NULL DEFAULT '{}',
    "totalCost" INTEGER NOT NULL,
    "marginMode" TEXT NOT NULL,
    "marginRate" REAL NOT NULL,
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
    "pdfSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Estimate_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EstimateLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "estimateId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT,
    "unitPrice" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "isUserEdited" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "EstimateLineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
