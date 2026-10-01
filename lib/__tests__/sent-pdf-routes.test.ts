/**
 * 발송 PDF 라우트 — 인증·소유 확인·본문 검사·pdfUrl 기록 (DB·스토리지·인증은 가짜).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const USER = { id: "3f2b8c1e-9a4d-4c7e-8b21-0d5e6f7a8b9c", email: null };
const EST = "cmabc123def456ghi789jkl0";

const prismaMock = {
  estimate: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  site: {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => USER),
  requireUserAndSettings: vi.fn(),
}));

const storage = {
  uploadSentPdf: vi.fn(async () => {}),
  listSentPdfs: vi.fn(async () => []),
  downloadSentPdf: vi.fn(async () => null as Buffer | null),
  removeSentPdf: vi.fn(async () => {}),
  removeForEstimates: vi.fn(async () => {}),
};
vi.mock("@/lib/sent-pdf", async () => ({ ...(await import("../sent-pdf-path")), ...storage }));
const removeOwnedObjects = vi.fn(async () => {});
vi.mock("@/lib/storage", () => ({ parsePhotos: vi.fn(), removeOwnedObjects }));

const PDF = new TextEncoder().encode("%PDF-1.7\n%test\n");
const ctx = { params: Promise.resolve({ eid: EST }) };

function post(body: BodyInit, detail = "simple", headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/estimates/${EST}/sent-pdf?detail=${detail}`, { method: "POST", body, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.estimate.findFirst.mockResolvedValue({ pdfUrl: null });
  prismaMock.estimate.updateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/estimates/[eid]/sent-pdf", () => {
  it("공유한 PDF 를 보관하고 pdfUrl·pdfSentAt 을 같은 시각으로 기록", async () => {
    const { POST } = await import("../../app/api/estimates/[eid]/sent-pdf/route");
    const res = await POST(post(PDF, "detailed"), ctx);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.name).toMatch(/^\d{8}T\d{9}Z-detailed\.pdf$/);

    // 소유 확인은 사용자 범위로
    expect(prismaMock.estimate.findFirst.mock.calls[0][0].where).toEqual({ id: EST, site: { userId: USER.id } });
    const [uid, eid, path, bytes] = storage.uploadSentPdf.mock.calls[0] as unknown as [string, string, string, Buffer];
    expect([uid, eid]).toEqual([USER.id, EST]);
    expect(path).toBe(`${USER.id}/${EST}/${j.name}`);
    expect(Buffer.compare(bytes, Buffer.from(PDF))).toBe(0); // 받은 바이트 그대로

    const upd = prismaMock.estimate.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: EST, site: { userId: USER.id } });
    expect(upd.data.pdfUrl).toBe(path);
    expect(upd.data.pdfSentAt.toISOString()).toBe(j.sentAt);
  });

  it("남의 견적은 404 — 본문을 읽거나 올리지 않음", async () => {
    prismaMock.estimate.findFirst.mockResolvedValue(null);
    const { POST } = await import("../../app/api/estimates/[eid]/sent-pdf/route");
    const res = await POST(post(PDF), ctx);
    expect(res.status).toBe(404);
    expect(storage.uploadSentPdf).not.toHaveBeenCalled();
  });

  it("PDF 가 아니면 415, 4MB 초과면 413, detail 이 이상하면 400", async () => {
    const { POST } = await import("../../app/api/estimates/[eid]/sent-pdf/route");
    expect((await POST(post(new TextEncoder().encode("<html></html>")), ctx)).status).toBe(415);
    expect((await POST(post(new Uint8Array(0)), ctx)).status).toBe(415);
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set(PDF);
    expect((await POST(post(big), ctx)).status).toBe(413);
    expect((await POST(post(PDF, "full"), ctx)).status).toBe(400);
    expect(storage.uploadSentPdf).not.toHaveBeenCalled();
  });

  it("보관 실패는 500 (한국어 메시지) — DB 기록 안 함", async () => {
    storage.uploadSentPdf.mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("../../app/api/estimates/[eid]/sent-pdf/route");
    const res = await POST(post(PDF), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("견적서 보관에 실패했습니다");
    expect(prismaMock.estimate.updateMany).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("업로드 사이 견적이 삭제되면 올린 파일을 되돌리고 404", async () => {
    prismaMock.estimate.updateMany.mockResolvedValue({ count: 0 });
    const { POST } = await import("../../app/api/estimates/[eid]/sent-pdf/route");
    const res = await POST(post(PDF), ctx);
    expect(res.status).toBe(404);
    expect(storage.removeSentPdf).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/estimates/[eid]/sent-pdf", () => {
  it("보관한 적 없으면 스토리지 조회 없이 빈 목록", async () => {
    const { GET } = await import("../../app/api/estimates/[eid]/sent-pdf/route");
    const res = await GET(new Request("http://localhost"), ctx);
    expect(await res.json()).toEqual({ items: [] });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(storage.listSentPdfs).not.toHaveBeenCalled();
  });

  it("보관본이 있으면 목록", async () => {
    prismaMock.estimate.findFirst.mockResolvedValue({ pdfUrl: "x" });
    storage.listSentPdfs.mockResolvedValueOnce([{ name: "n", detail: "simple", sentAt: "t", size: 1 }] as never);
    const { GET } = await import("../../app/api/estimates/[eid]/sent-pdf/route");
    const res = await GET(new Request("http://localhost"), ctx);
    expect((await res.json()).items).toHaveLength(1);
    expect(storage.listSentPdfs).toHaveBeenCalledWith(USER.id, EST);
  });
});

describe("GET /api/estimates/[eid]/sent-pdf/[name]", () => {
  const nameCtx = (name: string) => ({ params: Promise.resolve({ eid: EST, name }) });

  it("이름 패턴이 아니면 DB·스토리지 조회 없이 404", async () => {
    const { GET } = await import("../../app/api/estimates/[eid]/sent-pdf/[name]/route");
    for (const bad of ["..", "../x.pdf", "20261001T000000000Z-simple.png", "a.pdf"]) {
      expect((await GET(new Request("http://localhost"), nameCtx(bad))).status).toBe(404);
    }
    expect(prismaMock.estimate.findFirst).not.toHaveBeenCalled();
    expect(storage.downloadSentPdf).not.toHaveBeenCalled();
  });

  it("본인 견적 폴더의 파일을 inline PDF 로, 캐시 없이", async () => {
    prismaMock.estimate.findFirst.mockResolvedValue({ estimateNumber: "2026-001", customerNameSnapshot: "홍길동", site: { customerName: "홍길동" } });
    storage.downloadSentPdf.mockResolvedValueOnce(Buffer.from(PDF));
    const { GET } = await import("../../app/api/estimates/[eid]/sent-pdf/[name]/route");
    const name = "20261001T000000000Z-detailed.pdf";
    const res = await GET(new Request("http://localhost"), nameCtx(name));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const cd = res.headers.get("content-disposition")!;
    expect(cd.startsWith("inline;")).toBe(true);
    expect(cd).toContain(encodeURIComponent("견적서-홍길동-상세-20261001-발송본.pdf"));
    expect(storage.downloadSentPdf).toHaveBeenCalledWith(USER.id, EST, `${USER.id}/${EST}/${name}`);
    expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(PDF))).toBe(true);
  });

  it("남의 견적이면 404", async () => {
    prismaMock.estimate.findFirst.mockResolvedValue(null);
    const { GET } = await import("../../app/api/estimates/[eid]/sent-pdf/[name]/route");
    expect((await GET(new Request("http://localhost"), nameCtx("20261001T000000000Z-simple.pdf"))).status).toBe(404);
    expect(storage.downloadSentPdf).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/estimates/[eid] — pdfUrl 은 클라이언트가 못 바꾼다", () => {
  function patch(body: unknown) {
    return new Request(`http://localhost/api/estimates/${EST}`, { method: "PATCH", body: JSON.stringify(body) });
  }

  it("pdfUrl 만 보내면 아무것도 바꾸지 않음 (400)", async () => {
    prismaMock.estimate.findFirst.mockResolvedValue({ id: EST, lineItems: [], site: {} });
    const { PATCH } = await import("../../app/api/estimates/[eid]/route");
    const res = await PATCH(patch({ pdfUrl: `${USER.id}/other/x.pdf` }), ctx);
    expect(res.status).toBe(400);
    expect(prismaMock.estimate.update).not.toHaveBeenCalled();
  });

  it("pdfSentAt 폴백은 그대로 — 같이 온 pdfUrl 은 무시", async () => {
    prismaMock.estimate.findFirst.mockResolvedValue({ id: EST, lineItems: [], site: {} });
    prismaMock.estimate.update.mockResolvedValue({ id: EST });
    const { PATCH } = await import("../../app/api/estimates/[eid]/route");
    const res = await PATCH(patch({ pdfSentAt: "2026-10-01T00:00:00.000Z", pdfUrl: "forged" }), ctx);
    expect(res.status).toBe(200);
    const data = prismaMock.estimate.update.mock.calls[0][0].data;
    expect(data.pdfSentAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect("pdfUrl" in data).toBe(false);
  });

});

describe("삭제 시 보관본 정리", () => {
  it("견적 삭제 → 그 견적의 보관본 정리", async () => {
    prismaMock.estimate.deleteMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import("../../app/api/estimates/[eid]/route");
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.estimate.deleteMany.mock.calls[0][0].where).toEqual({ id: EST, site: { userId: USER.id } });
    expect(storage.removeForEstimates).toHaveBeenCalledWith(USER.id, [EST]);
  });

  it("남의 견적 삭제 시도는 404 — 정리 호출 없음", async () => {
    prismaMock.estimate.deleteMany.mockResolvedValue({ count: 0 });
    const { DELETE } = await import("../../app/api/estimates/[eid]/route");
    expect((await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx)).status).toBe(404);
    expect(storage.removeForEstimates).not.toHaveBeenCalled();
  });

  it("현장 삭제 → 그 현장 모든 견적의 보관본 정리", async () => {
    prismaMock.site.findFirst.mockResolvedValue({ photos: [], estimates: [{ id: EST }, { id: "cmzzz999yyy888xxx777www0" }] });
    prismaMock.site.deleteMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import("../../app/api/sites/[id]/route");
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "site1" }) });
    expect(res.status).toBe(200);
    expect(storage.removeForEstimates).toHaveBeenCalledWith(USER.id, [EST, "cmzzz999yyy888xxx777www0"]);
    expect(removeOwnedObjects).toHaveBeenCalled();
  });
});
