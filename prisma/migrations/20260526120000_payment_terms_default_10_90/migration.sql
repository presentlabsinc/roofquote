-- Default contract terms changed from 30/70 -> 10/90 (industry-typical for
-- 지붕공사). Only affects new estimates; existing rows keep whatever they had.
ALTER TABLE "Estimate" ALTER COLUMN "paymentTerms" SET DEFAULT '계약금 10% / 잔금 90%';
