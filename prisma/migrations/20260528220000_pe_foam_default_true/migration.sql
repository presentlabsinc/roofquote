-- PE폼 부착 기본값 false → true (보통 기본 시공)
-- 기존 데이터는 변경 안 함 (각 견적의 hasPeFoam 값 그대로 유지).
-- 새로 만드는 견적만 영향 받음.
ALTER TABLE "Estimate"
  ALTER COLUMN "hasPeFoam" SET DEFAULT true;
