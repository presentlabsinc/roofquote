-- AlterTable: PricingSettings — add bending widths, screw/silicone/insulation prices, baselineData
ALTER TABLE "PricingSettings"
  ADD COLUMN "bendingPricePerMmPer3m"  INTEGER NOT NULL DEFAULT 36,
  ADD COLUMN "bendingWidthRidge"       INTEGER NOT NULL DEFAULT 350,
  ADD COLUMN "bendingWidthEave"        INTEGER NOT NULL DEFAULT 250,
  ADD COLUMN "bendingWidthCap"         INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN "bendingWidthMishi"       INTEGER NOT NULL DEFAULT 150,
  ADD COLUMN "bendingWidthFlashing"    INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN "bendingWidthValley"      INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "bendingWidthSnowGuard"   INTEGER NOT NULL DEFAULT 180,
  ADD COLUMN "screwLargePrice"         INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "screwSmallPrice"         INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "siliconePrice"           INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN "insulationPricePerSqm"   INTEGER NOT NULL DEFAULT 15000,
  ADD COLUMN "baselineData"            JSONB;

-- AlterTable: Estimate — add building/roof shape fields and insulation toggle
ALTER TABLE "Estimate"
  ADD COLUMN "buildingShape"    TEXT,
  ADD COLUMN "roofShape"        TEXT,
  ADD COLUMN "perimeterM"       DOUBLE PRECISION,
  ADD COLUMN "ridgeCount"       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "parapetHeightCm"  INTEGER,
  ADD COLUMN "hasInsulation"    BOOLEAN NOT NULL DEFAULT false;
