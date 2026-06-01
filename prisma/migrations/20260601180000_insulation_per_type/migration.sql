-- 단열재 제품별 ㎡당 단가 (추정, VAT포함, 50T 기준)
ALTER TABLE "PricingSettings"
  ADD COLUMN "insulationPriceEps"            INTEGER NOT NULL DEFAULT 4000,
  ADD COLUMN "insulationPriceXps"            INTEGER NOT NULL DEFAULT 11000,
  ADD COLUMN "insulationPricePir"            INTEGER NOT NULL DEFAULT 16000,
  ADD COLUMN "insulationPriceThermalReflect" INTEGER NOT NULL DEFAULT 6000;
