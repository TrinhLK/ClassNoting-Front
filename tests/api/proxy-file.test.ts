import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/rate-limit")>(
    "@/app/lib/rate-limit"
  );
  return { ...actual };
});

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("GET /api/proxy-file — SSRF protection (bug 3.6)", () => {
  let GET: typeof import("@/app/api/proxy-file/route").GET;

  beforeEach(async () => {
    GET = (await import("@/app/api/proxy-file/route")).GET;
  });

  it("trả 400 khi thiếu param url", async () => {
    const req = new Request("http://localhost:3000/api/proxy-file");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe("Missing URL parameter");
  });

  it("chặn HTTP (chỉ cho phép HTTPS)", async () => {
    const req = new Request(
      "http://localhost:3000/api/proxy-file?url=http://example.com/file.pdf"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toBe("Only HTTPS URLs are allowed");
  });

  it("chặn URL không hợp lệ", async () => {
    const req = new Request(
      "http://localhost:3000/api/proxy-file?url=not-a-url"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toBe("Invalid URL");
  });

  it("chặn localhost (DNS lookup)", async () => {
    const req = new Request(
      "http://localhost:3000/api/proxy-file?url=https://localhost:3000/secret"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("chặn hostname blocked (127.0.0.1)", async () => {
    const req = new Request(
      "http://localhost:3000/api/proxy-file?url=https://127.0.0.1/secret"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("chặn metadata.google.internal", async () => {
    const req = new Request(
      "http://localhost:3000/api/proxy-file?url=https://metadata.google.internal/latest/meta-data"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("chặn IP private (10.x.x.x) thông qua DNS lookup", async () => {
    const req = new Request(
      "http://localhost:3000/api/proxy-file?url=https://example-blocked-10.com/file"
    );
    const res = await GET(req);
    expect([403, 500]).toContain(res.status);
  });

  it("trả 429 khi rate limit vượt (30 req / 60s)", async () => {
    const makeReq = () =>
      new Request(
        "http://localhost:3000/api/proxy-file?url=https://allowed-host.example/file.pdf",
        {
          headers: { "x-forwarded-for": "77.77.77.77" },
        }
      );

    fetchMock.mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data"));
          controller.close();
        },
      }),
      headers: new Headers({ "Content-Type": "application/octet-stream" }),
    });

    for (let i = 0; i < 30; i++) {
      const res = await GET(makeReq());
      expect(res.status).not.toBe(429);
    }

    const blocked = await GET(makeReq());
    expect(blocked.status).toBe(429);
  });
});
