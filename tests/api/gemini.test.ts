import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest as makeBaseRequest } from "@/tests/helpers/fixtures";

const makeRequest = (body: Record<string, unknown>, options?: Parameters<typeof makeBaseRequest>[1]) =>
  makeBaseRequest({ sessionId: "test-conversation", ...body }, options);

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
  process.env.OPEN_CODE_GO_API_KEY = "test-gemini-key";
});

describe("POST /api/gemini — retry + validate (bug unknown, test logic mới)", () => {
  let POST: typeof import("@/app/api/gemini/route").POST;

  beforeEach(async () => {
    POST = (await import("@/app/api/gemini/route")).POST;
  });

  it("trả 400 khi thiếu text", async () => {
    const req = makeRequest({ mode: "default" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("text");
  });

  it("retry 3 lần khi API trả 500, sau đó fail", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Server down",
    });

    const req = makeRequest({ text: "Test transcript", mode: "default" });
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retry thành công khi API fail 1 lần rồi OK", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Server Error",
        text: async () => "fail",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Summary OK" } }] }),
      });

    const req = makeRequest({ text: "Test transcript", mode: "default" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = await res.json();
    expect(body.summary).toBe("Summary OK");
  });

  it("fallback qua các model theo thứ tự cho mọi mode cấu hình", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "deepseek failed",
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "minimax failed",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Fallback OK" } }] }),
      });

    const req = makeRequest({ text: "Test transcript", mode: "segment" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([, opts]) => JSON.parse(opts.body).model)).toEqual([
      "deepseek-v4-flash",
      "minimax-m3",
      "mimo-v2.5",
    ]);
    await expect(res.json()).resolves.toMatchObject({ summary: "Fallback OK" });
  });

  it("gọi API với model và max_tokens đúng", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "x" } }] }),
    });

    const req = makeRequest({ text: "T", mode: "default" });
    await POST(req);

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("mimo-v2.5");
    expect(body.max_tokens).toBe(16384);
    const headers = opts.headers;
    expect(headers.Authorization).toBe("Bearer test-gemini-key");
  });

  it("prompt chứa rule bắt buộc giữ bảng markdown trong template", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    const req = makeRequest({
      text: "T",
      mode: "default",
      templateStructure: "| STT | Hạng mục |\n|---|---|\n| 1 | Fix bug |",
    });
    await POST(req);

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    const prompt: string = body.messages[0].content;
    expect(prompt).toContain("BẮT BUỘC xuất bảng");
    expect(prompt).toContain("KHÔNG được thay bằng bullet");
    expect(prompt).toContain("| STT | Hạng mục |");
  });

  it("prompt chứa rule chống contamination ngôn ngữ (chỉ tiếng Việt)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    const req = makeRequest({ text: "T", mode: "default" });
    await POST(req);

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    const prompt: string = body.messages[0].content;
    expect(prompt).toContain("CHỈ sử dụng tiếng Việt");
    expect(prompt).toContain("TUYỆT ĐỐI KHÔNG trộn từ ngữ tiếng Trung");
  });

  it("prompt full mode chứa thời gian bắt đầu + duration khi client gửi createdAt", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    const req = makeRequest({
      text: "T",
      mode: "full",
      createdAt: new Date(2026, 7, 5, 14, 30, 0).getTime(),
      duration: 900, // 15 phút
    });
    await POST(req);

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    const prompt: string = body.messages[0].content;
    expect(prompt).toContain("15 phút 0 giây");
    expect(prompt).toContain("Thời gian kết thúc:");
    expect(prompt).toMatch(/Thời gian bắt đầu: \d/);
  });

  it("prompt full mode fallback 'không rõ' khi thiếu createdAt và duration", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    const req = makeRequest({ text: "T", mode: "full" });
    await POST(req);

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    const prompt: string = body.messages[0].content;
    expect(prompt).toContain("Thời gian bắt đầu: không rõ");
    expect(prompt).toContain("Thời lượng: không rõ");
  });

  it("prompt full mode chứa fullTimeStr format 'HH:mm - HH:mm, ngày dd/mm/yyyy' để fill template", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    const ts = new Date(2026, 4, 20, 14, 13, 0).getTime();
    const req = makeRequest({
      text: "T",
      mode: "full",
      createdAt: ts,
      duration: 900, // 15 phút
    });
    await POST(req);

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    const prompt: string = body.messages[0].content;
    const expectedStart = new Date(ts);
    const expectedEnd = new Date(ts + 900 * 1000);
    const pad2 = (n: number) => n.toString().padStart(2, "0");
    const expectedStr = `"${pad2(expectedStart.getHours())}:${pad2(expectedStart.getMinutes())} - ${pad2(expectedEnd.getHours())}:${pad2(expectedEnd.getMinutes())}, ngày ${pad2(expectedStart.getDate())}/${pad2(expectedStart.getMonth() + 1)}/${expectedStart.getFullYear()}"`;
    expect(prompt).toContain(expectedStr);
  });

  it("prompt full mode có rule bắt buộc thay dòng Thời gian bằng chuỗi đã chuẩn bị", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    const req = makeRequest({ text: "T", mode: "full" });
    await POST(req);

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    const prompt: string = body.messages[0].content;
    expect(prompt).toContain('Dòng "Thời gian:" trong template');
    expect(prompt).toContain("BẮT BUỘC thay bằng đúng chuỗi thời gian đã chuẩn bị");
    expect(prompt).toContain("KHÔNG giữ nguyên giá trị ví dụ/placeholder");
  });

  it("full mode: response bị strip CJK contamination trước khi trả client", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "Đẩy mạnh video tự拍摄 (nhằm tăng CTR 10-15%)",
            },
          },
        ],
      }),
    });

    const req = makeRequest({ text: "T", mode: "full" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe("Đẩy mạnh video tự (nhằm tăng CTR 10-15%)");
    expect(body.summary).not.toMatch(/[一-鿿]/);
  });

  it("extract_json mode: response cũng bị strip CJK (kể cả trong JSON values)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '[{"task":"拍摄 video quảng cáo","assignee":"An"}]',
            },
          },
        ],
      }),
    });

    const req = makeRequest({ text: "T", mode: "extract_json" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).not.toMatch(/[一-鿿]/);
    expect(body.summary).toContain("video quảng cáo");
  });

  it("mode extract_json: trả về cleaned JSON (strip markdown code fences)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '```json\n[{"task":"X","assignee":"An","deadline":"Chưa rõ"}]\n```',
            },
          },
        ],
      }),
    });

    const req = makeRequest({
      text: "An sẽ làm X",
      mode: "extract_json",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toContain("[{");
    expect(body.summary).not.toContain("```");
  });

  it("trả 429 khi rate limit vượt (20 req / 60s)", async () => {
    const makeReq = () =>
      makeRequest({ text: "x", mode: "default" }, { ip: "88.88.88.88" });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    for (let i = 0; i < 20; i++) {
      const res = await POST(makeReq());
      expect(res.status).not.toBe(429);
    }
    const blocked = await POST(makeReq());
    expect(blocked.status).toBe(429);
  });
});
