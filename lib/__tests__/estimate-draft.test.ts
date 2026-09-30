/**
 * 견적 폼 초안 자동 저장 (lib/estimate-draft.ts) — 저장소 헬퍼 + payload → 폼 초기값 변환.
 */
import { describe, expect, it, vi } from "vitest";
import {
  DRAFT_MAX_AGE_MS, DRAFT_PREFIX, DraftAutosaver, clearDraft, clearDraftIfUnchanged, draftKey,
  draftPayloadToInitial, formatDraftAge, loadDraft, pruneDrafts, readDraft, resolveDraftOffer, saveDraft,
  type DraftStorage,
} from "../estimate-draft";

/** Map 기반 가짜 localStorage. failSet = 다음 N번 setItem 을 용량 초과로 실패시킴. */
class FakeStorage implements DraftStorage {
  map = new Map<string, string>();
  failSet = 0;
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) {
    if (this.failSet > 0) { this.failSet--; throw new Error("QuotaExceededError"); }
    this.map.set(k, String(v));
  }
  removeItem(k: string) { this.map.delete(k); }
}

/** 모든 접근이 예외 — 사생활 모드·사이트 데이터 차단 흉내. */
const throwingStorage: DraftStorage = {
  get length(): number { throw new Error("SecurityError"); },
  key() { throw new Error("SecurityError"); },
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("SecurityError"); },
  removeItem() { throw new Error("SecurityError"); },
};

const NOW = Date.parse("2026-09-30T03:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

// 폼 buildPayload() 가 만드는 모양 그대로 — 지붕공사 (면적·둘레 자동, 물받이 앞·뒤, 로스율 직접 수정).
const roofPayload = {
  constructionType: "roof", materialType: "zinc250", materialThickness: "0.45",
  materialTexture: "스톤", materialColor: "차콜", constructionMonth: "2026-10",
  areaM2: 132.23, buildingAreaM2: null, workerCount: 4, workDays: 2,
  gutterMode: "front,back", gutterLengthM: 21, stainlessDrainLengthM: 0, capLengthM: 0,
  drainHoleCount: 0, endCapCount: 0, denjoCount: 1, substructureType: "wood", wasteTruckCount: 2,
  skyliftDays: 1, ladderTruckDays: 0, scaffoldDays: 0, scaffoldAreaM2: 0, otherEquipment: "크레인 1일",
  scopeFlags: { ridge: true, overlay: true, eave: true, waste: true, skylift: true },
  extraCosts: [{ name: "크레인", amount: 300000, note: "" }],
  catalogSelections: [{ category: "finishing", key: "multiRidge", label: "멀티용마루", unit: "개", quantity: 4, unitPrice: 13200 }],
  catalogModes: { bending: { enabled: true, mode: "simple", simpleType: "perSqm", simpleValue: 3500 } },
  pricingOverrides: { mealCostPerPersonMeal: 25000 },
  finishingMethods: { ridge: "ready" },
  applyLossRate: true, lossRate: 0.075, lossRateManual: true,
  buildingShape: "lshape", roofShape: "hip", perimeterM: 43, ridgeCount: 1,
  parapetHeightCm: null, eaveOverhangCm: 60, railPerimeterM: null,
  rooftopStructurePerimeterM: null, rooftopStructureHeightCm: null, rooftopDoorCount: 0, rooftopWindowCount: 0,
  downspoutCount: 4, hasInsulation: true, insulationTypes: ["xps", "other"], insulationNote: "글라스울 50T",
  roofShapeNote: null, hasPeFoam: true, includeLodging: true, includeTeamExpense: false, includeInsurance: true,
  lodgingNights: 2,
};

// 바닥형 스틸방수 — 난간·옥탑, 배수로, 차양 물받이 없음, 로스율 끔.
const steelPayload = {
  ...roofPayload,
  constructionType: "steelWaterproof", materialType: "slate", materialTexture: null, materialColor: "기타",
  constructionMonth: "2026-10-14", areaM2: 215, workDays: 3,
  gutterMode: null, gutterLengthM: 0, stainlessDrainLengthM: 15, downspoutCount: 1,
  scopeFlags: { handrail: true, cap: true, rooftopStructure: true, drainHole: true },
  drainHoleCount: 2, denjoCount: 0, substructureType: null, wasteTruckCount: 1, skyliftDays: 0,
  applyLossRate: false, lossRate: null, lossRateManual: false,
  buildingShape: "rectangle", roofShape: null, perimeterM: 58, parapetHeightCm: 80, eaveOverhangCm: 0,
  railPerimeterM: 52, rooftopStructurePerimeterM: 14, rooftopStructureHeightCm: 250, rooftopDoorCount: 1, rooftopWindowCount: 2,
  hasInsulation: false, insulationTypes: [], insulationNote: null, includeLodging: false, lodgingNights: null,
  finishingMethods: {}, catalogSelections: [], extraCosts: [],
};

describe("draftKey", () => {
  it("사용자·현장·견적(없으면 new) 별 키", () => {
    expect(draftKey("u1", "s1")).toBe("roofquote:draft:v1:u1:s1:new");
    expect(draftKey("u1", "s1", null)).toBe("roofquote:draft:v1:u1:s1:new");
    expect(draftKey("u1", "s1", "e9")).toBe("roofquote:draft:v1:u1:s1:e9");
    expect(draftKey("u1", "s1").startsWith(DRAFT_PREFIX)).toBe(true);
  });
});

describe("saveDraft / loadDraft / clearDraft", () => {
  const key = draftKey("u1", "s1");

  it("저장 → 불러오기 왕복", () => {
    const storage = new FakeStorage();
    expect(saveDraft(key, { payload: roofPayload, baseUpdatedAt: null }, { storage, now: NOW })).toBe(true);
    const d = loadDraft(key, { storage, now: NOW + 60_000 });
    expect(d).not.toBeNull();
    expect(d!.v).toBe(1);
    expect(d!.savedAt).toBe(new Date(NOW).toISOString());
    expect(d!.baseUpdatedAt).toBeNull();
    expect(d!.payload).toEqual(roofPayload);
    clearDraft(key, { storage });
    expect(loadDraft(key, { storage, now: NOW })).toBeNull();
  });

  it("수정 모드 기준 시각(baseUpdatedAt)도 보관", () => {
    const storage = new FakeStorage();
    saveDraft(key, { payload: roofPayload, baseUpdatedAt: "2026-09-29T01:02:03.000Z" }, { storage, now: NOW });
    expect(loadDraft(key, { storage, now: NOW })!.baseUpdatedAt).toBe("2026-09-29T01:02:03.000Z");
  });

  it("14일 지난 초안은 무시하고 지움", () => {
    const storage = new FakeStorage();
    saveDraft(key, { payload: roofPayload, baseUpdatedAt: null }, { storage, now: NOW });
    expect(loadDraft(key, { storage, now: NOW + DRAFT_MAX_AGE_MS - 1 })).not.toBeNull();
    expect(storage.getItem(key)).not.toBeNull();
    expect(loadDraft(key, { storage, now: NOW + DRAFT_MAX_AGE_MS + 1 })).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it("깨진 JSON·다른 버전·모양이 틀린 값은 무시하고 지움", () => {
    for (const raw of [
      "{not json",
      JSON.stringify({ v: 2, savedAt: new Date(NOW).toISOString(), baseUpdatedAt: null, payload: {} }),
      JSON.stringify({ v: 1, savedAt: "어제", baseUpdatedAt: null, payload: {} }),
      JSON.stringify({ v: 1, savedAt: new Date(NOW).toISOString(), baseUpdatedAt: null, payload: [1, 2] }),
      JSON.stringify({ v: 1, savedAt: new Date(NOW).toISOString(), baseUpdatedAt: 123, payload: {} }),
      "null",
    ]) {
      const storage = new FakeStorage();
      storage.setItem(key, raw);
      expect(readDraft(key, { storage, now: NOW }).status).toBe("invalid");
      expect(storage.getItem(key)).toBe(raw); // readDraft 는 읽기만
      expect(loadDraft(key, { storage, now: NOW })).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    }
  });

  it("저장소가 예외를 던져도(사생활 모드·차단) 폼을 깨뜨리지 않음", () => {
    expect(saveDraft(key, { payload: roofPayload, baseUpdatedAt: null }, { storage: throwingStorage })).toBe(false);
    expect(readDraft(key, { storage: throwingStorage })).toEqual({ status: "none" });
    expect(loadDraft(key, { storage: throwingStorage })).toBeNull();
    expect(() => clearDraft(key, { storage: throwingStorage })).not.toThrow();
    expect(pruneDrafts({ storage: throwingStorage })).toBe(0);
    // 저장소 자체가 없음 (SSR·접근 불가)
    expect(saveDraft(key, { payload: roofPayload, baseUpdatedAt: null }, { storage: null })).toBe(false);
    expect(loadDraft(key, { storage: null })).toBeNull();
  });

  it("용량 초과면 오래된 초안을 치우고 한 번 더 시도", () => {
    const storage = new FakeStorage();
    const oldKey = draftKey("u1", "s-old");
    saveDraft(oldKey, { payload: roofPayload, baseUpdatedAt: null }, { storage, now: NOW - 20 * DAY });
    storage.failSet = 1;
    expect(saveDraft(key, { payload: roofPayload, baseUpdatedAt: null }, { storage, now: NOW })).toBe(true);
    expect(storage.getItem(oldKey)).toBeNull();
    expect(loadDraft(key, { storage, now: NOW })).not.toBeNull();
    // 치울 게 없으면 실패를 그대로 돌려준다
    storage.failSet = 1;
    expect(saveDraft(key, { payload: steelPayload, baseUpdatedAt: null }, { storage, now: NOW })).toBe(false);
  });
});

describe("pruneDrafts", () => {
  it("우리 접두어의 오래된·깨진 초안만 지움", () => {
    const storage = new FakeStorage();
    const fresh = draftKey("u1", "s1");
    const old = draftKey("u1", "s2");
    const broken = draftKey("u1", "s3", "e1");
    saveDraft(fresh, { payload: roofPayload, baseUpdatedAt: null }, { storage, now: NOW - DAY });
    saveDraft(old, { payload: roofPayload, baseUpdatedAt: null }, { storage, now: NOW - 15 * DAY });
    storage.setItem(broken, "{");
    storage.setItem("other-app-key", "{");
    expect(pruneDrafts({ storage, now: NOW })).toBe(2);
    expect(storage.getItem(fresh)).not.toBeNull();
    expect(storage.getItem(old)).toBeNull();
    expect(storage.getItem(broken)).toBeNull();
    expect(storage.getItem("other-app-key")).toBe("{");
  });
});

describe("draftPayloadToInitial — payload → 폼 초기값 (수정 모드와 같은 모양)", () => {
  it("지붕공사 payload", () => {
    const i = draftPayloadToInitial(roofPayload)!;
    expect(i).not.toBeNull();
    expect(i.constructionType).toBe("roof");
    expect(i.materialType).toBe("zinc250");
    expect(i.areaM2).toBe(132.23);
    expect(i.buildingAreaM2).toBeNull();
    expect(i.workerCount).toBe(4);
    expect(i.workDays).toBe(2);
    expect(i.gutterMode).toBe("front,back");
    expect(i.gutterLengthM).toBe(21);
    expect(i.stainlessDrainLengthM).toBeNull();
    expect(i.perimeterM).toBe(43);
    expect(i.eaveOverhangCm).toBe(60);
    expect(i.buildingShape).toBe("lshape");
    expect(i.roofShape).toBe("hip");
    // 로스율 = 폼에 보이던 값 그대로 (설정 정책으로 다시 정하지 않음)
    expect(i.applyLossRate).toBe(true);
    expect(i.lossRate).toBe(0.075);
    expect(i.scopeFlags).toEqual(roofPayload.scopeFlags);
    expect(i.extraCosts).toEqual([{ name: "크레인", amount: 300000, note: "" }]);
    expect(i.catalogSelections).toEqual(roofPayload.catalogSelections);
    expect(i.catalogModes).toEqual(roofPayload.catalogModes);
    expect(i.pricingOverrides).toEqual({ mealCostPerPersonMeal: 25000 });
    expect(i.finishingMethods).toEqual({ ridge: "ready" });
    expect(i.insulationTypes).toEqual(["xps", "other"]);
    expect(i.insulationNote).toBe("글라스울 50T");
    expect(i.includeLodging).toBe(true);
    expect(i.lodgingNights).toBe(2);
    expect(i.denjoCount).toBe(1);
    expect(i.wasteTruckCount).toBe(2);
    expect(i.skyliftDays).toBe(1);
    expect(i.ladderTruckDays).toBeNull();
    expect(i.otherEquipment).toBe("크레인 1일");
    expect(i.constructionMonth).toBe("2026-10");
  });

  it("스틸방수 payload", () => {
    const i = draftPayloadToInitial(steelPayload)!;
    expect(i).not.toBeNull();
    expect(i.constructionType).toBe("steelWaterproof");
    expect(i.materialTexture).toBeNull();
    expect(i.materialColor).toBe("기타");
    expect(i.constructionMonth).toBe("2026-10-14");
    expect(i.gutterMode).toBeNull();
    expect(i.gutterLengthM).toBeNull();
    expect(i.stainlessDrainLengthM).toBe(15);
    expect(i.parapetHeightCm).toBe(80);
    expect(i.railPerimeterM).toBe(52);
    expect(i.rooftopStructurePerimeterM).toBe(14);
    expect(i.rooftopStructureHeightCm).toBe(250);
    expect(i.rooftopDoorCount).toBe(1);
    expect(i.rooftopWindowCount).toBe(2);
    expect(i.downspoutCount).toBe(1);
    expect(i.drainHoleCount).toBe(2);
    expect(i.substructureType).toBeNull();
    expect(i.roofShape).toBeNull();
    expect(i.applyLossRate).toBe(false);
    expect(i.lossRate).toBeNull();
    expect(i.insulationTypes).toEqual([]);
    expect(i.scopeFlags).toEqual({ handrail: true, cap: true, rooftopStructure: true, drainHole: true });
  });

  it("직접 넣은 0 은 0 그대로 — 배수로 '0 = 안함', 물받이 면은 두고 길이 0 (자동 길이로 바뀌지 않게)", () => {
    const steelNoDrain = draftPayloadToInitial({ ...steelPayload, stainlessDrainLengthM: 0 })!;
    expect(steelNoDrain.stainlessDrainLengthM).toBe(0);
    expect(draftPayloadToInitial({ ...roofPayload, gutterLengthM: 0 })!.gutterLengthM).toBe(0);
    // 해당 없는 칸은 전처럼 null — 지붕의 배수로, 물받이 안 함, 스틸방수 차양 물받이 없음
    expect(draftPayloadToInitial(roofPayload)!.stainlessDrainLengthM).toBeNull();
    expect(draftPayloadToInitial({ ...roofPayload, gutterMode: null, gutterLengthM: 0 })!.gutterLengthM).toBeNull();
    expect(steelNoDrain.gutterLengthM).toBeNull();
  });

  it("복원할 수 없는 payload 는 null", () => {
    expect(draftPayloadToInitial(null)).toBeNull();
    expect(draftPayloadToInitial([roofPayload])).toBeNull();
    expect(draftPayloadToInitial("x")).toBeNull();
    // 공사 유형 고르기 전 (parse 가 'roof' 로 채워 버리므로 미리 거름)
    expect(draftPayloadToInitial({ ...roofPayload, constructionType: null })).toBeNull();
    // 서버 검증 실패 = 제출해도 400 이 날 값
    expect(draftPayloadToInitial({ ...roofPayload, areaM2: 0 })).toBeNull();
    expect(draftPayloadToInitial({ ...roofPayload, constructionType: "hack" })).toBeNull();
    expect(draftPayloadToInitial({ ...roofPayload, lossRate: 1.5 })).toBeNull();
    expect(draftPayloadToInitial({ ...roofPayload, workDays: 0.2 })).toBeNull();
    expect(draftPayloadToInitial({ ...roofPayload, constructionMonth: "2026/10" })).toBeNull();
  });
});

describe("resolveDraftOffer — 폼을 열 때 이어서 쓸지", () => {
  const ok = (baseUpdatedAt: string | null, payload: Record<string, unknown> = roofPayload) => ({
    status: "ok" as const,
    draft: { v: 1 as const, savedAt: new Date(NOW).toISOString(), baseUpdatedAt, payload },
  });

  it("초안 없음 / 깨진 초안", () => {
    expect(resolveDraftOffer({ status: "none" }, null)).toEqual({ status: "none" });
    expect(resolveDraftOffer({ status: "invalid" }, null)).toEqual({ status: "discard", baseChanged: false, savedAt: null });
  });

  it("새 견적 초안은 이어서 쓰기 제안", () => {
    const r = resolveDraftOffer(ok(null), null);
    expect(r.status).toBe("offer");
    if (r.status === "offer") expect(r.initial.areaM2).toBe(132.23);
  });

  it("수정 모드: 초안 이후 견적이 저장·변경됐으면 지우고 알림", () => {
    expect(resolveDraftOffer(ok("2026-09-29T00:00:00.000Z"), "2026-09-29T00:00:00.000Z").status).toBe("offer");
    expect(resolveDraftOffer(ok("2026-09-29T00:00:00.000Z"), "2026-09-30T00:00:00.000Z"))
      .toEqual({ status: "discard", baseChanged: true, savedAt: new Date(NOW).toISOString() });
  });

  it("복원할 수 없는 payload 는 조용히 지움", () => {
    expect(resolveDraftOffer(ok(null, { ...roofPayload, areaM2: -1 }), null))
      .toEqual({ status: "discard", baseChanged: false, savedAt: new Date(NOW).toISOString() });
  });
});

describe("clearDraftIfUnchanged — 읽었던 그 초안만 지움", () => {
  const key = draftKey("u1", "s1");

  it("그 사이 같은 키에 새로 저장된 초안(지금 입력)은 남긴다", () => {
    const storage = new FakeStorage();
    saveDraft(key, { payload: roofPayload, baseUpdatedAt: null }, { storage, now: NOW - 60_000 });
    const offered = loadDraft(key, { storage, now: NOW })!;
    saveDraft(key, { payload: steelPayload, baseUpdatedAt: null }, { storage, now: NOW });
    expect(clearDraftIfUnchanged(key, offered.savedAt, { storage, now: NOW })).toBe(false);
    expect(loadDraft(key, { storage, now: NOW })!.payload).toEqual(steelPayload);
    const current = loadDraft(key, { storage, now: NOW })!;
    expect(clearDraftIfUnchanged(key, current.savedAt, { storage, now: NOW })).toBe(true);
    expect(storage.getItem(key)).toBeNull();
  });

  it("savedAt = null 은 깨진·오래된 초안일 때만 지운다", () => {
    const storage = new FakeStorage();
    storage.setItem(key, "{");
    expect(clearDraftIfUnchanged(key, null, { storage, now: NOW })).toBe(true);
    expect(storage.getItem(key)).toBeNull();
    saveDraft(key, { payload: roofPayload, baseUpdatedAt: null }, { storage, now: NOW });
    expect(clearDraftIfUnchanged(key, null, { storage, now: NOW })).toBe(false);
    expect(storage.getItem(key)).not.toBeNull();
    expect(() => clearDraftIfUnchanged(key, null, { storage: throwingStorage })).not.toThrow();
  });
});

describe("DraftAutosaver — 폼 한 번 열림의 자동 저장", () => {
  const J = (o: object) => JSON.stringify(o);
  const newKey = draftKey("u1", "s1");
  const editKey = draftKey("u1", "s1", "e1");
  const BASE = "2026-09-29T01:02:03.000Z";
  // 새 견적 폼을 막 연 상태 (공사 유형·면적 없음 — 아직 복원할 수 없는 payload)
  const blank = { ...roofPayload, constructionType: null, areaM2: 0 };
  const stored = (storage: FakeStorage, key: string) => loadDraft(key, { storage, now: NOW });
  type OfferRef = { current: (() => void) | null };

  it("열기만 하면 저장하지 않는다 (새 견적·수정 모드)", () => {
    const storage = new FakeStorage();
    const fresh = new DraftAutosaver(J(blank), { key: newKey, baseUpdatedAt: null, fromDraft: false }, { storage, now: NOW });
    expect(fresh.update(J(blank))).toBe(false);
    fresh.persist();
    const edit = new DraftAutosaver(J(roofPayload), { key: editKey, baseUpdatedAt: BASE, fromDraft: false }, { storage, now: NOW });
    expect(edit.update(J(roofPayload))).toBe(false);
    edit.persist();
    expect(storage.map.size).toBe(0);
  });

  it("바꾸면 저장하고, 처음 상태로 되돌리면 이 폼이 저장한 초안을 지운다", () => {
    const storage = new FakeStorage();
    const s = new DraftAutosaver(J(roofPayload), { key: editKey, baseUpdatedAt: BASE, fromDraft: false }, { storage, now: NOW });
    expect(s.update(J({ ...roofPayload, workerCount: 5 }))).toBe(true);
    s.persist();
    expect(stored(storage, editKey)!.payload.workerCount).toBe(5);
    expect(stored(storage, editKey)!.baseUpdatedAt).toBe(BASE);
    s.update(J(roofPayload));
    s.persist();
    expect(storage.getItem(editKey)).toBeNull();
  });

  it("아직 복원할 수 없는 상태는 건너뛴다 — 직전 초안이 남는다", () => {
    const storage = new FakeStorage();
    const s = new DraftAutosaver(J(blank), { key: newKey, baseUpdatedAt: null, fromDraft: false }, { storage, now: NOW });
    s.update(J(roofPayload));
    s.persist();
    s.update(J({ ...roofPayload, areaM2: 0 }));
    s.persist();
    expect(stored(storage, newKey)!.payload).toEqual(roofPayload);
  });

  it("배너가 묻는 이전 초안 — 만졌다 되돌리기만 하면 지우지도 덮어쓰지도 않는다", () => {
    // 새 견적: 면적을 쳤다 지움 (유형 없음 → 저장할 수 없는 상태 → 다시 처음 상태)
    const storage = new FakeStorage();
    saveDraft(newKey, { payload: steelPayload, baseUpdatedAt: null }, { storage, now: NOW - DAY });
    const onReplaced = vi.fn();
    const fresh = new DraftAutosaver(
      J(blank), { key: newKey, baseUpdatedAt: null, fromDraft: false, offerRef: { current: onReplaced } }, { storage, now: NOW },
    );
    fresh.update(J({ ...blank, areaM2: 100 }));
    fresh.persist();
    fresh.update(J(blank));
    fresh.persist();
    expect(stored(storage, newKey)!.payload).toEqual(steelPayload);
    // 수정 모드: PE폼 체크를 껐다 켬 (디바운스 안에서)
    saveDraft(editKey, { payload: { ...roofPayload, workerCount: 6 }, baseUpdatedAt: BASE }, { storage, now: NOW - DAY });
    const edit = new DraftAutosaver(
      J(roofPayload), { key: editKey, baseUpdatedAt: BASE, fromDraft: false, offerRef: { current: onReplaced } }, { storage, now: NOW },
    );
    edit.update(J({ ...roofPayload, hasPeFoam: false }));
    edit.update(J(roofPayload));
    edit.persist();
    expect(stored(storage, editKey)!.payload.workerCount).toBe(6);
    expect(onReplaced).not.toHaveBeenCalled();
  });

  it("묻는 중에 새로 입력해 저장하게 되면 먼저 알리고(한 번) 덮어쓴다", () => {
    const storage = new FakeStorage();
    saveDraft(newKey, { payload: steelPayload, baseUpdatedAt: null }, { storage, now: NOW - DAY });
    const offerRef: OfferRef = { current: null };
    const onReplaced = vi.fn(() => {
      // 알리는 시점엔 이전 초안이 아직 저장소에 있다 (배너는 '되돌리기'용으로 메모리에 들고 있음)
      expect(stored(storage, newKey)!.payload).toEqual(steelPayload);
      offerRef.current = null;
    });
    offerRef.current = onReplaced;
    const s = new DraftAutosaver(J(blank), { key: newKey, baseUpdatedAt: null, fromDraft: false, offerRef }, { storage, now: NOW });
    s.update(J(roofPayload));
    s.persist();
    expect(onReplaced).toHaveBeenCalledTimes(1);
    expect(stored(storage, newKey)!.payload).toEqual(roofPayload);
    s.update(J({ ...roofPayload, workerCount: 7 }));
    s.persist();
    expect(onReplaced).toHaveBeenCalledTimes(1);
    expect(stored(storage, newKey)!.payload.workerCount).toBe(7);
  });

  it("[버리기] 는 이전 초안만 지우고, 그 뒤 입력은 다시 저장된다", () => {
    const storage = new FakeStorage();
    saveDraft(newKey, { payload: steelPayload, baseUpdatedAt: null }, { storage, now: NOW - DAY });
    const offered = stored(storage, newKey)!;
    const offerRef: OfferRef = { current: vi.fn() };
    const s = new DraftAutosaver(J(blank), { key: newKey, baseUpdatedAt: null, fromDraft: false, offerRef }, { storage, now: NOW });
    s.update(J({ ...blank, areaM2: 50 })); // 아직 저장할 수 없는 입력
    // 배너 [버리기]
    offerRef.current = null;
    expect(clearDraftIfUnchanged(newKey, offered.savedAt, { storage, now: NOW })).toBe(true);
    s.update(J({ ...roofPayload, areaM2: 50 }));
    s.persist(); // 앱 전환 등
    expect(stored(storage, newKey)!.payload.areaM2).toBe(50);
  });

  it("초안에서 복원한 폼 — 복원 내용을 다시 저장하고, 처음 상태로 돌아와도 지우지 않는다", () => {
    const storage = new FakeStorage();
    // 이전 폼이 언마운트하며 다른 입력을 저장해 둔 상태
    saveDraft(newKey, { payload: steelPayload, baseUpdatedAt: null }, { storage, now: NOW });
    const s = new DraftAutosaver(J(roofPayload), { key: newKey, baseUpdatedAt: null, fromDraft: true }, { storage, now: NOW });
    s.saveRestored();
    expect(stored(storage, newKey)!.payload).toEqual(roofPayload);
    s.update(J({ ...roofPayload, workerCount: 9 }));
    s.persist();
    s.update(J(roofPayload));
    s.persist();
    expect(stored(storage, newKey)!.payload).toEqual(roofPayload);
  });

  it("제출 성공 뒤엔 초안을 지우고 더는 저장하지 않는다", () => {
    const storage = new FakeStorage();
    const s = new DraftAutosaver(J(blank), { key: newKey, baseUpdatedAt: null, fromDraft: false }, { storage, now: NOW });
    s.update(J(roofPayload));
    s.persist();
    s.markSubmitted();
    expect(storage.getItem(newKey)).toBeNull();
    expect(s.update(J({ ...roofPayload, workerCount: 3 }))).toBe(false);
    s.persist(); // 언마운트 저장
    expect(storage.getItem(newKey)).toBeNull();
  });

  it("자동 저장 전에 제출해도, 배너가 묻던 이전 초안은 지우지 않는다 (다음에 다시 제안)", () => {
    const storage = new FakeStorage();
    saveDraft(newKey, { payload: steelPayload, baseUpdatedAt: null }, { storage, now: NOW - DAY });
    const offerRef: OfferRef = { current: vi.fn() };
    const s = new DraftAutosaver(J(blank), { key: newKey, baseUpdatedAt: null, fromDraft: false, offerRef }, { storage, now: NOW });
    s.update(J(roofPayload)); // 0.8초 안에 제출 — persist 전
    s.markSubmitted();
    expect(offerRef.current).not.toHaveBeenCalled();
    expect(stored(storage, newKey)!.payload).toEqual(steelPayload);
  });

  it("이 폼이 한 번이라도 저장했으면 (이전 초안은 이미 덮어씀) 제출 시 지운다", () => {
    const storage = new FakeStorage();
    saveDraft(newKey, { payload: steelPayload, baseUpdatedAt: null }, { storage, now: NOW - DAY });
    const offerRef: OfferRef = { current: null };
    offerRef.current = vi.fn(() => { offerRef.current = null; });
    const s = new DraftAutosaver(J(blank), { key: newKey, baseUpdatedAt: null, fromDraft: false, offerRef }, { storage, now: NOW });
    s.update(J(roofPayload));
    s.persist();
    s.markSubmitted();
    expect(storage.getItem(newKey)).toBeNull();
  });

  it("저장소가 예외를 던져도 깨지지 않는다", () => {
    const s = new DraftAutosaver(J(blank), { key: newKey, baseUpdatedAt: null, fromDraft: false }, { storage: throwingStorage, now: NOW });
    s.update(J(roofPayload));
    expect(() => s.persist()).not.toThrow();
    expect(() => s.markSubmitted()).not.toThrow();
  });
});

describe("formatDraftAge", () => {
  const at = (ms: number) => new Date(NOW - ms).toISOString();
  it("방금 전 / N분 전 / N시간 전 / N일 전", () => {
    expect(formatDraftAge(at(30_000), NOW)).toBe("방금 전");
    expect(formatDraftAge(at(5 * 60_000), NOW)).toBe("5분 전");
    expect(formatDraftAge(at(3 * 60 * 60_000 + 59_000), NOW)).toBe("3시간 전");
    expect(formatDraftAge(at(2 * DAY), NOW)).toBe("2일 전");
    expect(formatDraftAge(at(-60_000), NOW)).toBe("방금 전"); // 시계가 어긋나도 음수 안 나옴
  });
});
