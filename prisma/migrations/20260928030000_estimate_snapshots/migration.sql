-- DropForeignKey
ALTER TABLE "Estimate" DROP CONSTRAINT "Estimate_siteId_fkey";

-- AlterTable
ALTER TABLE "PricingSettings" ALTER COLUMN "useLossRateByDefault" SET DEFAULT true,
ALTER COLUMN "drainHolePrice" SET DEFAULT 0,
ALTER COLUMN "stainlessDrainPricePerM" SET DEFAULT 32000;

-- AlterTable
ALTER TABLE "PricingPreset" ADD COLUMN     "prevSnapshotJson" JSONB;

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "customerNameSnapshot" TEXT,
ADD COLUMN     "extraCosts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "issuedAt" TIMESTAMP(3),
ADD COLUMN     "marginLaborRatioSnapshot" DOUBLE PRECISION,
ADD COLUMN     "marginMaterialRatioSnapshot" DOUBLE PRECISION,
ADD COLUMN     "marginProfitRatioSnapshot" DOUBLE PRECISION,
ADD COLUMN     "siteAddressSnapshot" TEXT;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill (2026-09-28): 기존 견적을 '지금 PDF 에 보이는 값'으로 고정한다.
-- 이전엔 PDF 가 고객명·주소·마진 분배 비율을 매번 라이브로 읽어, 현장 정보나 설정을 바꾸면
-- 이미 발송한 견적서가 달라졌다. 오늘 값으로 박제해 이후 변경으로부터 보호.
UPDATE "Estimate" e
SET "customerNameSnapshot" = s."customerName",
    "siteAddressSnapshot"  = s."siteAddress"
FROM "Site" s
WHERE e."siteId" = s."id";

UPDATE "Estimate" e
SET "marginMaterialRatioSnapshot" = ps."marginMaterialRatio",
    "marginLaborRatioSnapshot"    = ps."marginLaborRatio",
    "marginProfitRatioSnapshot"   = ps."marginProfitRatio"
FROM "Site" s
JOIN "PricingSettings" ps ON ps."userId" = s."userId"
WHERE e."siteId" = s."id";

-- 발행일: 기존 견적은 생성일 그대로 (PDF 에 보이던 날짜 유지).
UPDATE "Estimate" SET "issuedAt" = "createdAt" WHERE "issuedAt" IS NULL;

-- '로스율 기본 적용' 설정은 그동안 폼이 무시하고 항상 켜서 시작했다. 이제 폼이 이 값을 읽으므로,
-- 기존 사용자 경험(새 견적 = 로스율 켜짐)이 바뀌지 않도록 true 로 맞춘다.
UPDATE "PricingSettings" SET "useLossRateByDefault" = true;
-- 프리셋 스냅샷에도 같은 값을 맞춘다 — 안 그러면 옛 프리셋을 불러오는 순간 false 가 다시 들어와
-- 새 견적이 로스율 미적용으로 시작한다 (2026-09-28 리뷰). prevSnapshotJson 은 새 컬럼이라 전부 NULL.
UPDATE "PricingPreset"
SET "snapshotJson" = jsonb_set("snapshotJson", '{useLossRateByDefault}', 'true'::jsonb)
WHERE "snapshotJson" ? 'useLossRateByDefault';
