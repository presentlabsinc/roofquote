-- AlterTable: Estimate — add insulationTypes JSONB array for multi-select
ALTER TABLE "Estimate"
  ADD COLUMN "insulationTypes" JSONB NOT NULL DEFAULT '[]';

-- Backfill: existing rows with hasInsulation=true → insulationTypes=["other"]
-- so the line item still appears in buildLineItems for old estimates being edited.
UPDATE "Estimate"
  SET "insulationTypes" = '["other"]'::jsonb
  WHERE "hasInsulation" = true;
