import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const importApi = async () => {
  vi.resetModules();
  return await import("@/app/lib/api");
};

const mockFetch = (response: unknown, ok = true) => {
  const body = typeof response === "string" ? response : JSON.stringify(response);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => response,
      text: async () => body,
    })) as unknown as typeof fetch
  );
};

describe("parseAiJson robustness (requestFillPlaceholders)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parse JSON thuần (object)", async () => {
    mockFetch({ summary: '{"TEN":"A","NGAY":"1/1/2026"}' });
    const api = await importApi();
    const result = await api.requestFillPlaceholders(["TEN", "NGAY"], "docs-test");
    expect(result).toEqual({ TEN: "A", NGAY: "1/1/2026" });
  });

  it("bóc tách markdown code block ```json```", async () => {
    mockFetch({ summary: '```json\n{"TEN":"A","NGAY":"1/1/2026"}\n```' });
    const api = await importApi();
    const result = await api.requestFillPlaceholders(["TEN", "NGAY"], "docs-test");
    expect(result).toEqual({ TEN: "A", NGAY: "1/1/2026" });
  });

  it("bỏ extra text trước/sau JSON", async () => {
    mockFetch({ summary: 'Đây là kết quả: {"TEN":"A"} -- hết --' });
    const api = await importApi();
    const result = await api.requestFillPlaceholders(["TEN"], "docs-test");
    expect(result).toEqual({ TEN: "A" });
  });

  it("xử lý trailing commas", async () => {
    mockFetch({ summary: '{"TEN":"A","NGAY":"1/1/2026",}' });
    const api = await importApi();
    const result = await api.requestFillPlaceholders(["TEN", "NGAY"], "docs-test");
    expect(result).toEqual({ TEN: "A", NGAY: "1/1/2026" });
  });

  it("xử lý JSON với newline/space thừa", async () => {
    mockFetch({ summary: '{\n  "TEN": "A",\n  "NGAY": "B"\n}' });
    const api = await importApi();
    const result = await api.requestFillPlaceholders(["TEN", "NGAY"], "docs-test");
    expect(result).toEqual({ TEN: "A", NGAY: "B" });
  });

  it("AI trả mảng -> trả object rỗng (vì fill_placeholders cần object)", async () => {
    mockFetch({ summary: '[{"marker":"x","value":"y"}]' });
    const api = await importApi();
    const result = await api.requestFillPlaceholders(["x"], "docs-test");
    expect(result).toEqual({});
  });

  it("AI trả rỗng -> throw", async () => {
    mockFetch({ summary: "" });
    const api = await importApi();
    await expect(api.requestFillPlaceholders(["x"], "docs-test")).rejects.toThrow(/rỗng|không trả về/);
  });

  it("JSON hoàn toàn lỗi -> throw và log", async () => {
    mockFetch({ summary: "this is not json at all" });
    const api = await importApi();
    await expect(api.requestFillPlaceholders(["x"], "docs-test")).rejects.toThrow(/không hợp lệ/);
  });
});

describe("parseAiJson robustness (requestDetectFill)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parse JSON thuần (array)", async () => {
    mockFetch({ summary: '[{"marker":"______","value":"Nguyễn Văn A"}]' });
    const api = await importApi();
    const result = await api.requestDetectFill("file text", "docs-test");
    expect(result).toEqual([{ marker: "______", value: "Nguyễn Văn A" }]);
  });

  it("bóc tách markdown code block", async () => {
    mockFetch({ summary: '```json\n[{"marker":"______","value":"A"}]\n```' });
    const api = await importApi();
    const result = await api.requestDetectFill("file", "docs-test");
    expect(result).toEqual([{ marker: "______", value: "A" }]);
  });

  it("bỏ extra text + trailing comma", async () => {
    mockFetch({ summary: 'Kết quả: [{"marker":"x","value":"y",},]' });
    const api = await importApi();
    const result = await api.requestDetectFill("file", "docs-test");
    expect(result).toEqual([{ marker: "x", value: "y" }]);
  });

  it("AI trả object -> trả rỗng (vì detect_fill cần array)", async () => {
    mockFetch({ summary: '{"foo":"bar"}' });
    const api = await importApi();
    const result = await api.requestDetectFill("file", "docs-test");
    expect(result).toEqual([]);
  });

  it("filter bỏ item thiếu marker", async () => {
    mockFetch({ summary: '[{"marker":"a","value":"x"},{"value":"y"},{"marker":"  ","value":"z"}]' });
    const api = await importApi();
    const result = await api.requestDetectFill("file", "docs-test");
    expect(result).toEqual([{ marker: "a", value: "x" }]);
  });

  it("JSON lỗi hoàn toàn -> throw", async () => {
    mockFetch({ summary: "not json" });
    const api = await importApi();
    await expect(api.requestDetectFill("file", "docs-test")).rejects.toThrow(/không hợp lệ/);
  });
});
