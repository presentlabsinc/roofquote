/**
 * 발송 PDF 보관 — 스토리지 호출 규칙 (lib/sent-pdf.ts). Supabase 클라이언트는 가짜로 바꿔 네트워크 없이.
 * 버킷은 절대 공개로 만들지 않고, 공개로 바뀌어 있으면 보관을 거부하며, 정리는 호출자에게 throw 하지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Res = { data: unknown; error: { message: string; status?: number; statusCode?: string } | null };
const calls: { op: string; args: unknown[] }[] = [];
const handlers: Record<string, (...args: unknown[]) => Res | Promise<Res>> = {};
const call = (op: string) => async (...args: unknown[]) => {
  calls.push({ op, args });
  const h = handlers[op];
  if (!h) throw new Error(`unexpected ${op}`);
  return h(...args);
};

vi.mock("../supabase-server", () => ({
  supabaseAdmin: () => ({
    storage: {
      getBucket: call("getBucket"),
      createBucket: call("createBucket"),
      from: (bucket: string) => ({
        upload: (...a: unknown[]) => call("upload")(bucket, ...a),
        list: (...a: unknown[]) => call("list")(bucket, ...a),
        remove: (...a: unknown[]) => call("remove")(bucket, ...a),
        download: (...a: unknown[]) => call("download")(bucket, ...a),
      }),
    },
  }),
}));

const USER = "3f2b8c1e-9a4d-4c7e-8b21-0d5e6f7a8b9c";
const EST = "cmabc123def456ghi789jkl0";
const PDF = Buffer.from("%PDF-1.7\n...");

async function load() {
  vi.resetModules(); // 버킷 확인 캐시를 테스트마다 초기화
  return import("../sent-pdf");
}

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(handlers)) delete handlers[k];
});

describe("ensureSentPdfBucket / uploadSentPdf", () => {
  it("버킷이 없으면 비공개·PDF 전용으로 만들고 덮어쓰기 없이 올린다", async () => {
    handlers.getBucket = () => ({ data: null, error: { message: "Bucket not found", status: 400, statusCode: "404" } });
    handlers.createBucket = () => ({ data: { name: "estimate-pdfs" }, error: null });
    handlers.upload = () => ({ data: { path: "x" }, error: null });
    const m = await load();
    const path = m.buildSentPdfPath(USER, EST, new Date("2026-10-01T00:00:00Z"), "simple");
    await m.uploadSentPdf(USER, EST, path, PDF);

    const create = calls.find((c) => c.op === "createBucket")!;
    expect(create.args).toEqual(["estimate-pdfs", { public: false, fileSizeLimit: "10MB", allowedMimeTypes: ["application/pdf"] }]);
    const up = calls.find((c) => c.op === "upload")!;
    expect(up.args[0]).toBe("estimate-pdfs");
    expect(up.args[1]).toBe(path);
    expect(up.args[3]).toEqual({ contentType: "application/pdf", upsert: false });

    // 두 번째 업로드는 버킷 확인을 다시 하지 않는다 (프로세스 캐시).
    await m.uploadSentPdf(USER, EST, m.buildSentPdfPath(USER, EST, new Date("2026-10-01T00:00:01Z"), "detailed"), PDF);
    expect(calls.filter((c) => c.op === "getBucket")).toHaveLength(1);
  });

  it("동시에 만들어진 경우(already exists)는 다시 읽어 비공개면 통과", async () => {
    let n = 0;
    handlers.getBucket = () => (n++ === 0
      ? { data: null, error: { message: "Bucket not found", statusCode: "404" } }
      : { data: { id: "estimate-pdfs", public: false }, error: null });
    handlers.createBucket = () => ({ data: null, error: { message: "The resource already exists", status: 400, statusCode: "409" } });
    const m = await load();
    await expect(m.ensureSentPdfBucket()).resolves.toBeUndefined();
  });

  it("버킷이 공개로 되어 있으면 올리지 않는다", async () => {
    handlers.getBucket = () => ({ data: { id: "estimate-pdfs", public: true }, error: null });
    handlers.upload = () => ({ data: { path: "x" }, error: null });
    const m = await load();
    const path = m.buildSentPdfPath(USER, EST, new Date(), "simple");
    await expect(m.uploadSentPdf(USER, EST, path, PDF)).rejects.toThrow(/public/);
    expect(calls.some((c) => c.op === "upload")).toBe(false);
    expect(calls.some((c) => c.op === "createBucket")).toBe(false);
  });

  it("다른 사용자·견적 경로로는 올리지 않는다", async () => {
    handlers.getBucket = () => ({ data: { id: "estimate-pdfs", public: false }, error: null });
    const m = await load();
    const other = m.buildSentPdfPath("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", EST, new Date(), "simple");
    await expect(m.uploadSentPdf(USER, EST, other, PDF)).rejects.toThrow(/invalid path/);
    expect(calls).toHaveLength(0);
  });
});

describe("listSentPdfs / downloadSentPdf", () => {
  it("규칙에 맞는 파일만 최신순으로, 버킷이 없으면 빈 목록", async () => {
    handlers.list = () => ({
      data: [
        { name: "20261001T000000000Z-simple.pdf", id: "1", metadata: { size: 1000 } },
        { name: "20261002T000000000Z-detailed.pdf", id: "2", metadata: { size: 2000 } },
        { name: "notes.txt", id: "3", metadata: { size: 1 } },
        { name: "sub", id: null, metadata: null },
      ],
      error: null,
    });
    const m = await load();
    const items = await m.listSentPdfs(USER, EST);
    expect(items.map((i) => i.name)).toEqual(["20261002T000000000Z-detailed.pdf", "20261001T000000000Z-simple.pdf"]);
    expect(items[0]).toMatchObject({ detail: "detailed", size: 2000, sentAt: "2026-10-02T00:00:00.000Z" });
    expect(calls[0].args.slice(0, 2)).toEqual(["estimate-pdfs", `${USER}/${EST}`]);

    handlers.list = () => ({ data: null, error: { message: "Bucket not found", statusCode: "404" } });
    expect(await m.listSentPdfs(USER, EST)).toEqual([]);
  });

  it("다른 견적 경로는 받지 않는다", async () => {
    const m = await load();
    const path = m.buildSentPdfPath(USER, "cmzzz999yyy888xxx777www0", new Date(), "simple");
    expect(await m.downloadSentPdf(USER, EST, path)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("removeForEstimates", () => {
  it("견적 폴더의 보관본을 지우고, 실패해도 throw 하지 않는다", async () => {
    let listed = 0;
    handlers.list = () => (listed++ === 0
      ? { data: [{ name: "20261001T000000000Z-simple.pdf", id: "1", metadata: { size: 1 } }], error: null }
      : { data: [], error: null });
    handlers.remove = () => ({ data: [], error: null });
    const m = await load();
    await m.removeForEstimates(USER, [EST]);
    const rm = calls.find((c) => c.op === "remove")!;
    expect(rm.args).toEqual(["estimate-pdfs", [`${USER}/${EST}/20261001T000000000Z-simple.pdf`]]);

    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    handlers.list = () => { throw new Error("network down"); };
    await expect(m.removeForEstimates(USER, [EST, "../bad"])).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
