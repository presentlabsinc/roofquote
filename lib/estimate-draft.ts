/**
 * 견적 폼 초안 자동 저장 (2026-09-30, 백로그 4-①).
 *
 * 폰에서 긴 견적 폼을 채우다 탭이 새로고침되거나 앱이 닫히거나 다른 화면으로 가도 입력이 남도록
 * 브라우저 localStorage 에 초안을 둔다. 서버·DB 는 건드리지 않는다.
 *   - 저장값 = 폼이 제출하는 payload 그대로 (제출값과 초안이 어긋나지 않게)
 *   - 복원   = payload → parseEstimateBody → estimateColumns → 수정 모드와 같은 초기화 경로
 *
 * React 없음 — 순수 함수 + 저장소 헬퍼. 저장소 오류(사생활 모드·용량 초과·차단)는 전부 삼킨다:
 * 초안은 보조 기능이라 어떤 경우에도 폼을 깨뜨리면 안 된다.
 */
import { estimateColumns, parseEstimateBody } from "./estimate-input";

export const DRAFT_VERSION = 1;
export const DRAFT_PREFIX = "roofquote:draft:v1:";
/** 이보다 오래된 초안은 무시하고 지운다. */
export const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export interface EstimateDraft {
  v: typeof DRAFT_VERSION;
  savedAt: string;
  /** 수정 모드: 초안을 만들 때의 견적 updatedAt (ISO). 새 견적은 null. */
  baseUpdatedAt: string | null;
  /** 폼이 제출하는 객체 그대로. */
  payload: Record<string, unknown>;
}

export interface DraftOpts {
  /** 테스트용 — 생략하면 window.localStorage (없거나 막혀 있으면 null). */
  storage?: DraftStorage | null;
  now?: number;
}

type Obj = Record<string, unknown>;
function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getStorage(opts?: DraftOpts): DraftStorage | null {
  if (opts && opts.storage !== undefined) return opts.storage;
  try {
    // 접근 자체가 SecurityError 를 던지는 브라우저가 있다 (쿠키·사이트 데이터 차단).
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** `roofquote:draft:v1:<userId>:<siteId>:<estimateId | "new">` */
export function draftKey(userId: string, siteId: string, estimateId?: string | null): string {
  return `${DRAFT_PREFIX}${userId}:${siteId}:${estimateId || "new"}`;
}

function parseDraft(raw: string, now: number): EstimateDraft | null {
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(d) || d.v !== DRAFT_VERSION || typeof d.savedAt !== "string" || !isObj(d.payload)) return null;
  const t = Date.parse(d.savedAt);
  if (!Number.isFinite(t) || now - t > DRAFT_MAX_AGE_MS) return null;
  const base = d.baseUpdatedAt ?? null;
  if (base !== null && typeof base !== "string") return null;
  return { v: DRAFT_VERSION, savedAt: d.savedAt, baseUpdatedAt: base, payload: d.payload };
}

export type DraftRead =
  | { status: "none" }
  /** 깨진 JSON·다른 버전·14일 지남 — 지울 대상. */
  | { status: "invalid" }
  | { status: "ok"; draft: EstimateDraft };

/** 읽기만 한다 (저장소를 바꾸지 않음 — 렌더 중에 불러도 됨). */
export function readDraft(key: string, opts?: DraftOpts): DraftRead {
  const s = getStorage(opts);
  if (!s) return { status: "none" };
  let raw: string | null;
  try {
    raw = s.getItem(key);
  } catch {
    return { status: "none" };
  }
  if (raw === null) return { status: "none" };
  const draft = parseDraft(raw, opts?.now ?? Date.now());
  return draft ? { status: "ok", draft } : { status: "invalid" };
}

/** 읽고, 깨졌거나 오래된 초안은 지운다. */
export function loadDraft(key: string, opts?: DraftOpts): EstimateDraft | null {
  const r = readDraft(key, opts);
  if (r.status === "invalid") clearDraft(key, opts);
  return r.status === "ok" ? r.draft : null;
}

/** 저장. 실패(용량 초과 등)하면 오래된 초안을 치우고 한 번 더 시도, 그래도 안 되면 false. */
export function saveDraft(
  key: string,
  data: { payload: object; baseUpdatedAt: string | null },
  opts?: DraftOpts,
): boolean {
  const s = getStorage(opts);
  if (!s) return false;
  const draft: EstimateDraft = {
    v: DRAFT_VERSION,
    savedAt: new Date(opts?.now ?? Date.now()).toISOString(),
    baseUpdatedAt: data.baseUpdatedAt,
    payload: data.payload as Record<string, unknown>,
  };
  let json: string;
  try {
    json = JSON.stringify(draft);
  } catch {
    return false;
  }
  try {
    s.setItem(key, json);
    return true;
  } catch {
    if (pruneDrafts(opts) === 0) return false;
    try {
      s.setItem(key, json);
      return true;
    } catch {
      return false;
    }
  }
}

export function clearDraft(key: string, opts?: DraftOpts): void {
  const s = getStorage(opts);
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* 무시 */
  }
}

/**
 * 읽었던 그 초안일 때만 지운다 — 그 사이 같은 키에 새로 저장된 초안(지금 폼의 입력)은 남긴다.
 * savedAt = null 은 깨진·오래된 초안(readDraft 'invalid')을 뜻한다. 지웠으면 true.
 */
export function clearDraftIfUnchanged(key: string, savedAt: string | null, opts?: DraftOpts): boolean {
  const r = readDraft(key, opts);
  const same = savedAt === null ? r.status === "invalid" : r.status === "ok" && r.draft.savedAt === savedAt;
  if (same) clearDraft(key, opts);
  return same;
}

/** 다른 현장·견적에 남은 깨진/오래된 초안 정리. 지운 개수를 돌려준다. */
export function pruneDrafts(opts?: DraftOpts): number {
  const s = getStorage(opts);
  if (!s) return 0;
  const now = opts?.now ?? Date.now();
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) keys.push(k);
    }
    let removed = 0;
    for (const k of keys) {
      const raw = s.getItem(k);
      if (raw !== null && !parseDraft(raw, now)) {
        s.removeItem(k);
        removed++;
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

// ─── payload → 폼 초기값 ────────────────────────────────────────────────
/** 폼 초기값 — Estimate 입력 컬럼과 같은 모양 (수정 모드의 `existing` 과 같은 경로로 초기화). */
export type EstimateFormInitial = ReturnType<typeof estimateColumns>;

/**
 * 저장된 payload 를 폼 초기값으로. 서버와 같은 검증(parseEstimateBody)을 통과하지 못하면 null
 * (= 복원할 수 없는 초안). 공사 유형을 고르기 전 상태도 null — parse 가 'roof' 로 채워 버린다.
 */
export function draftPayloadToInitial(payload: unknown): EstimateFormInitial | null {
  if (!isObj(payload)) return null;
  if (typeof payload.constructionType !== "string" || !payload.constructionType) return null;
  try {
    const input = parseEstimateBody(payload);
    const cols = estimateColumns(input, input.lossRate ?? 0);
    return {
      ...cols,
      // 로스율은 폼이 보여 주던 값 그대로 (서버처럼 설정 정책으로 다시 정하지 않음).
      lossRate: input.applyLossRate ? input.lossRate : null,
      // 직접 넣은 0 (배수로 '0 = 안함', 물받이 길이 0) 보존은 estimateColumns 가 한다 — 수정 모드와 같은 규칙.
    };
  } catch {
    return null;
  }
}

export type DraftOffer =
  | { status: "none" }
  /**
   * 지울 초안. baseChanged = 수정 모드에서 그 사이 견적이 저장·변경됨 (사용자에게 알림).
   * savedAt = 읽은 초안의 저장 시각 (깨진 초안은 null) — clearDraftIfUnchanged 로 그 초안만 지운다.
   */
  | { status: "discard"; baseChanged: boolean; savedAt: string | null }
  | { status: "offer"; draft: EstimateDraft; initial: EstimateFormInitial };

/** 폼을 열 때 초안을 이어서 쓸지 물을지 결정한다. */
export function resolveDraftOffer(read: DraftRead, baseUpdatedAt: string | null): DraftOffer {
  if (read.status === "none") return { status: "none" };
  if (read.status === "invalid") return { status: "discard", baseChanged: false, savedAt: null };
  const { draft } = read;
  if (draft.baseUpdatedAt !== baseUpdatedAt) {
    return { status: "discard", baseChanged: baseUpdatedAt !== null, savedAt: draft.savedAt };
  }
  const initial = draftPayloadToInitial(draft.payload);
  if (!initial) return { status: "discard", baseChanged: false, savedAt: draft.savedAt };
  return { status: "offer", draft, initial };
}

// ─── 자동 저장 (폼 한 번 열림 단위) ──────────────────────────────────────
/** 이 폼의 초안 저장 위치 — EstimateFormWithDraft 가 넘긴다. 폼이 열려 있는 동안 바뀌지 않는다. */
export interface DraftTarget {
  key: string;
  /** 수정 모드: 견적 updatedAt (ISO). 새 견적은 null. */
  baseUpdatedAt: string | null;
  /** 초안에서 복원해 연 폼인지. */
  fromDraft: boolean;
  /**
   * 배너가 아직 '이어서 쓸지' 묻고 있는 이전 초안이 있으면 그 처리 함수 (답했거나 없으면 null).
   * 같은 키를 덮어쓰기 직전에 부른다 — 배너를 닫고 '되돌리기'를 띄워, 묻는 중인 초안이 말없이 사라지지 않게.
   */
  offerRef?: { current: (() => void) | null };
}

/**
 * 폼 한 번 열림(마운트)의 자동 저장 상태 — React 없이 테스트할 수 있게 use-draft-autosave 훅에서 분리.
 * - 처음 상태 그대로면(열기만 함) 저장하지 않는다.
 * - 아직 복원할 수 없는 상태(면적·유형 없음, 범위 밖 값)는 건너뛴다 — 직전 초안이 남는다.
 * - 처음 상태로 되돌리면 **이 폼이 저장했던** 초안만 지운다 (배너가 묻고 있는 이전 초안은 그대로).
 *   초안에서 복원한 폼은 예외 — 처음 상태가 곧 초안 내용이라서.
 */
export class DraftAutosaver {
  private latest: string;
  private lastSaved: string | null = null;
  private dirty = false;
  private done = false;

  constructor(
    /** 폼을 열었을 때의 payload (JSON 직렬화). */
    private readonly baseline: string,
    private readonly target: DraftTarget,
    private readonly opts?: DraftOpts,
  ) {
    this.latest = baseline;
  }

  /** 렌더마다 최신 payload 를 알린다. 저장을 예약해야 하면 true. */
  update(serialized: string): boolean {
    this.latest = serialized;
    if (this.done) return false;
    if (!this.dirty && serialized === this.baseline) return false;
    this.dirty = true;
    return true;
  }

  /** 대기 중인 변경을 저장한다 (디바운스 만료·앱 전환·화면 이동). */
  persist(): void {
    const { key, baseUpdatedAt, fromDraft, offerRef } = this.target;
    if (this.done || !this.dirty || this.latest === this.lastSaved) return;
    if (this.latest === this.baseline && !fromDraft) {
      if (this.lastSaved !== null) clearDraft(key, this.opts);
      this.lastSaved = null;
      return;
    }
    let payload: object;
    try {
      payload = JSON.parse(this.latest) as object;
    } catch {
      return;
    }
    if (!draftPayloadToInitial(payload)) return;
    const onReplaceOffered = offerRef?.current;
    if (onReplaceOffered) onReplaceOffered();
    if (saveDraft(key, { payload, baseUpdatedAt }, this.opts)) this.lastSaved = this.latest;
  }

  /**
   * 초안에서 복원해 연 폼 — 복원한 내용을 바로 다시 저장한다. 이전 폼이 언마운트하며 저장한 입력이
   * 초안을 덮었을 수 있어서 (React 는 이전 폼의 정리 함수를 새 폼의 effect 보다 먼저 돈다).
   */
  saveRestored(): void {
    const { key, baseUpdatedAt, fromDraft } = this.target;
    if (!fromDraft || this.done) return;
    let payload: object;
    try {
      payload = JSON.parse(this.baseline) as object;
    } catch {
      return;
    }
    if (draftPayloadToInitial(payload) && saveDraft(key, { payload, baseUpdatedAt }, this.opts)) {
      this.lastSaved = this.baseline;
    }
  }

  /** 제출 성공 — 초안을 지우고 이후 저장을 멈춘다. 화면 이동 전에 부를 것. */
  markSubmitted(): void {
    this.done = true;
    // 이 폼이 아직 한 번도 저장하지 않았고 배너가 이전 초안을 제안 중이면, 그 키에 있는 건 사용자가 답하지 않은
    // 이전 초안이다 — 지우지 않고 남겨 다음에 다시 제안한다 (자동 저장 0.8초 전에 제출하면 조용히 사라지던 문제).
    if (this.lastSaved === null && this.target.offerRef?.current) return;
    clearDraft(this.target.key, this.opts);
  }
}

/** "방금 전" / "N분 전" / "N시간 전" / "N일 전" */
export function formatDraftAge(savedAt: string, now: number = Date.now()): string {
  const t = Date.parse(savedAt);
  const sec = Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 1000)) : 0;
  if (sec < 60) return "방금 전";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}
