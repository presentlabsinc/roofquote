-- 자재 타입별 m당 단가 9종 (부가세 포함, 0.45t, 천보 도매가 기준).
-- 기존 materialPricePerSqm 은 유지 (구 견적 호환).
ALTER TABLE "PricingSettings"
  ADD COLUMN "materialPriceSlatePerM"           INTEGER NOT NULL DEFAULT 8100,
  ADD COLUMN "materialPriceV250PerM"            INTEGER NOT NULL DEFAULT 8100,
  ADD COLUMN "materialPriceZinc250PerM"         INTEGER NOT NULL DEFAULT 8100,
  ADD COLUMN "materialPriceGeneralTilePerM"     INTEGER NOT NULL DEFAULT 8600,
  ADD COLUMN "materialPriceTraditionalTilePerM" INTEGER NOT NULL DEFAULT 8600,
  ADD COLUMN "materialPriceRealZincPerM"        INTEGER NOT NULL DEFAULT 12000,
  ADD COLUMN "materialPriceParapetPerM"         INTEGER NOT NULL DEFAULT 12200,
  ADD COLUMN "materialPriceOverlayPanelPerM"    INTEGER NOT NULL DEFAULT 13300,
  ADD COLUMN "materialPriceTambourPerM"         INTEGER NOT NULL DEFAULT 0;
