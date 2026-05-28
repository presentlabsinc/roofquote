-- 옥탑 구조물 — 높이 + 문/창문 개수 추가 (외벽 강판 + 트림 절곡 계산용)
ALTER TABLE "Estimate"
  ADD COLUMN "rooftopStructureHeightCm" INTEGER,
  ADD COLUMN "rooftopDoorCount"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rooftopWindowCount"       INTEGER NOT NULL DEFAULT 0;
