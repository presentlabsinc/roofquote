-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "includeInsurance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "includeLodging" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "includeTeamExpense" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "insuranceRateOfLabor" DOUBLE PRECISION NOT NULL DEFAULT 0.047,
ADD COLUMN     "teamExpenseAmount" INTEGER NOT NULL DEFAULT 150000;
