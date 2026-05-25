-- Margin distribution ratios — split the estimate's margin into 3 portions
-- when rendering the customer PDF. Defaults: 50% material, 25% labor, 25% profit.
ALTER TABLE "PricingSettings" ADD COLUMN "marginMaterialRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
ALTER TABLE "PricingSettings" ADD COLUMN "marginLaborRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.25;
ALTER TABLE "PricingSettings" ADD COLUMN "marginProfitRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.25;
