-- 부자재 규격 길이 (mm) JSON — 설정 "규격당 가격 → m당 환산" 표시용.
ALTER TABLE "PricingSettings"
  ADD COLUMN "accessoryLengths" JSONB NOT NULL DEFAULT '{}';
