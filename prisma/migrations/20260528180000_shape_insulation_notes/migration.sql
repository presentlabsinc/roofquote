-- 지붕 형태 "복합/기타" 선택 시 + 단열재 "기타" 선택 시 자유 메모 필드.
ALTER TABLE "Estimate"
  ADD COLUMN "roofShapeNote"  TEXT,
  ADD COLUMN "insulationNote" TEXT;
