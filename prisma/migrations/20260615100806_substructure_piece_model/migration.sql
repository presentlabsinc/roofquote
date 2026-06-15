-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "substructureSteelPiecesPerSqm" DOUBLE PRECISION NOT NULL DEFAULT 0.76,
ADD COLUMN     "substructureSteelPricePerPiece" INTEGER NOT NULL DEFAULT 18000,
ADD COLUMN     "substructureWoodPiecesPerSqm" DOUBLE PRECISION NOT NULL DEFAULT 1.4,
ADD COLUMN     "substructureWoodPricePerPiece" INTEGER NOT NULL DEFAULT 3333;
