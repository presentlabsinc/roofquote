-- PE폼 부착 옵션 — 결로/소음 방지용. 강판 ㎡당 추가 단가로 계산.
ALTER TABLE "PricingSettings"
  ADD COLUMN "peFoamPricePerSqm" INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE "Estimate"
  ADD COLUMN "hasPeFoam" BOOLEAN NOT NULL DEFAULT false;
