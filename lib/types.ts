export interface ScopeFlags {
  colorSteel: boolean;       // 칼라강판 시공
  overlay: boolean;          // 기존 지붕 덧씌우기
  removal: boolean;          // 기존 지붕 철거
  ridge: boolean;            // 용마루 마감
  eave: boolean;             // 처마 마감
  gutter: boolean;           // 물받이 교체
  waste: boolean;            // 폐기물 처리
  skylift: boolean;          // 스카이차 사용
  ladderTruck: boolean;      // 사다리차 사용
}

export interface PhotoItem {
  url: string;
  memo?: string;
}

export type MarginMode = "percent" | "amount" | "finalPrice";

export type LineItemCategory =
  | "material"
  | "labor"
  | "equipment"
  | "transport"
  | "meals"
  | "lodging"
  | "waste"
  | "removal"
  | "other";
