/**
 * 발송 기록 (브라우저 쪽, lib/sent-pdf-client.ts) — 기록 순서·결과 판정·시간 제한·안내 문구.
 * fetch 는 가짜. 네트워크 없음.
 */
import { describe, expect, it, vi } from "vitest";
import { recordSentPdf, sentRecordNotice, type SentRecordOutcome } from "../sent-pdf-client";

const EST = "cmabc123def456ghi789jkl0";
const AT = new Date("2026-10-01T09:30:12.345Z");
const FILE = new Blob(["%PDF-1.7\n%test\n"], { type: "application/pdf" });

type Reply = { ok: boolean } | "throw" | "hang";

/** PATCH(발송 시각)·POST(보관) 응답을 정해 둔 가짜 fetch. "hang" 은 abort 될 때까지 안 끝남. */
function fakeFetch(patch: Reply, post: Reply) {
  return vi.fn((url: string, init?: RequestInit) => {
    const reply = init?.method === "PATCH" ? patch : post;
    if (reply === "throw") return Promise.reject(new TypeError("Failed to fetch"));
    if (reply === "hang") {
      return new Promise<{ ok: boolean }>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    return Promise.resolve(reply);
  });
}

const run = (fetchImpl: ReturnType<typeof fakeFetch>, timeouts = { timeTimeoutMs: 1000, uploadTimeoutMs: 1000 }) =>
  recordSentPdf({ estimateId: EST, file: FILE, level: "detailed", sentAt: AT, fetchImpl, ...timeouts });

describe("recordSentPdf — 발송 시각 먼저, 그다음 공유한 파일 보관", () => {
  it("순서: PATCH pdfSentAt(keepalive) → POST 같은 파일·간단/상세", async () => {
    const f = fakeFetch({ ok: true }, { ok: true });
    expect(await run(f)).toBe("stored");
    expect(f).toHaveBeenCalledTimes(2);

    const [patchUrl, patchInit] = f.mock.calls[0];
    expect(patchUrl).toBe(`/api/estimates/${EST}`);
    expect(patchInit?.method).toBe("PATCH");
    expect(patchInit?.keepalive).toBe(true);
    expect(JSON.parse(String(patchInit?.body))).toEqual({ pdfSentAt: AT.toISOString() });

    const [postUrl, postInit] = f.mock.calls[1];
    expect(postUrl).toBe(`/api/estimates/${EST}/sent-pdf?detail=detailed`);
    expect(postInit?.method).toBe("POST");
    expect(postInit?.body).toBe(FILE); // 공유한 그 객체 그대로
    expect(postInit?.signal).toBeInstanceOf(AbortSignal);
  });

  const cases: Array<[string, Reply, Reply, SentRecordOutcome]> = [
    ["보관 성공", { ok: true }, { ok: true }, "stored"],
    ["시각 기록 실패해도 보관되면 보관(서버가 pdfSentAt 도 씀)", { ok: false }, { ok: true }, "stored"],
    ["시각 네트워크 오류 + 보관 성공", "throw", { ok: true }, "stored"],
    ["보관 오류 응답 → 시각만", { ok: true }, { ok: false }, "timeOnly"],
    ["보관 네트워크 오류 → 시각만", { ok: true }, "throw", "timeOnly"],
    ["둘 다 오류 응답(세션 만료 401·삭제된 견적 404) → 아무것도", { ok: false }, { ok: false }, "none"],
    ["둘 다 네트워크 오류 → 아무것도", "throw", "throw", "none"],
  ];
  it.each(cases)("%s", async (_label, patch, post, expected) => {
    expect(await run(fakeFetch(patch, post))).toBe(expected);
  });

  it("업로드가 멈추면 시간 제한에서 끊고 '확인 못 함' (끊어도 서버가 저장했을 수 있음 · 버튼이 '기록 중'에 갇히지 않음)", async () => {
    const f = fakeFetch({ ok: true }, "hang");
    const started = Date.now();
    expect(await run(f, { timeTimeoutMs: 1000, uploadTimeoutMs: 30 })).toBe("unknown");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("발송 시각 요청이 멈춰도 시간 제한 후 보관은 시도", async () => {
    const f = fakeFetch("hang", { ok: true });
    expect(await run(f, { timeTimeoutMs: 30, uploadTimeoutMs: 1000 })).toBe("stored");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("둘 다 멈추면 '확인 못 함' — '못 했다'고 단정하지 않음", async () => {
    expect(await run(fakeFetch("hang", "hang"), { timeTimeoutMs: 20, uploadTimeoutMs: 20 })).toBe("unknown");
  });

  it("보관은 확실히 실패, 발송 시각은 시간 초과 → '확인 못 함'", async () => {
    expect(await run(fakeFetch("hang", { ok: false }), { timeTimeoutMs: 20, uploadTimeoutMs: 1000 })).toBe("unknown");
  });
});

describe("sentRecordNotice — 실제로 기록된 것만 말한다", () => {
  it("보관됨 → 추가 안내 없음", () => {
    expect(sentRecordNotice("stored")).toBeNull();
  });
  it("시각만 → '발송 시각만 기록했어요'", () => {
    expect(sentRecordNotice("timeOnly")).toContain("발송 시각만 기록했어요");
  });
  it("아무것도 → 기록했다고 말하지 않음", () => {
    const n = sentRecordNotice("none");
    expect(n).toBeTruthy();
    expect(n).not.toContain("기록했어요");
    expect(n).toContain("하지 못했어요");
  });
  it("확인 못 함 → 됐다고도 안 됐다고도 단정하지 않고 확인할 곳을 알려 줌", () => {
    const n = sentRecordNotice("unknown");
    expect(n).toContain("확인하지 못했어요");
    expect(n).not.toContain("기록했어요");
    expect(n).toContain("보낸 견적서");
  });
});
