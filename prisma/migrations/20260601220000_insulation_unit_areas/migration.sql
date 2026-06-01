-- 단열재 제품별 단위(롤/판) 면적 ㎡ — 단위가격 → ㎡당 환산용 (JSON)
ALTER TABLE "PricingSettings"
  ADD COLUMN "insulationUnitAreas" JSONB NOT NULL DEFAULT '{}';
