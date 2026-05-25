-- Multi-tenancy: add Supabase auth user ownership to PricingSettings + Site.
-- Tables were reset via `prisma migrate reset` just before this migration was
-- generated, so all rows are gone — NOT NULL on the new userId columns is safe.
-- Estimate rows are scoped via Site.userId (no direct column needed).

ALTER TABLE "PricingSettings" ADD COLUMN "userId" TEXT NOT NULL;
CREATE UNIQUE INDEX "PricingSettings_userId_key" ON "PricingSettings"("userId");

ALTER TABLE "Site" ADD COLUMN "userId" TEXT NOT NULL;
CREATE INDEX "Site_userId_idx" ON "Site"("userId");
