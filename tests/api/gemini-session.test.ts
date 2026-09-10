import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { makeRequest } from "@/tests/helpers/fixtures";
import { POST } from "@/app/api/gemini/route";

vi.mock("@/app/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
const fetchMock = vi.fn();
const modes = ["segment", "full", "qa", "fill_placeholders", "detect_fill", "extract_json"];
const success = () => new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }));
const body = (mode: string, sessionId: unknown = "workflow-123") => ({
  mode, sessionId, text: "Transcript", question: "Question", placeholders: ["NAME"],
});

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("provider conversation identity", () => {
  it.each(modes)("%s sends the explicit ID on every turn", async mode => {
    fetchMock.mockImplementation(success);
    for (let turn = 0; turn < 2; turn++) {
      expect((await POST(makeRequest(body(mode)))).status).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
      expect(options.headers["x-opencode-session"]).toBe("workflow-123");
      const payload = JSON.parse(options.body);
      expect(payload).not.toHaveProperty("sessionId");
      expect(payload.model).toBe(mode === "full" ? "minimax-m3" : "deepseek-v4-flash");
      expect(payload.max_tokens).toBe(16384);
      if (mode === "full" || mode === "segment") expect(payload.reasoning).toBe(false);
      else expect(payload).not.toHaveProperty("reasoning");
    }
  });

  it.each(modes)("%s preserves ID through retries and deduplicated fallbacks", async mode => {
    fetchMock.mockImplementationOnce(() => new Response("busy", { status: 503 }))
      .mockImplementationOnce(() => new Response("busy", { status: 503 }))
      .mockImplementationOnce(() => new Response("busy", { status: 503 }));
    if (mode !== "full") fetchMock.mockImplementationOnce(() => new Response("bad", { status: 400 }));
    fetchMock.mockImplementationOnce(success);
    const pending = POST(makeRequest(body(mode)));
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(200);
    expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).model)).toEqual(mode === "full" ? [
      "minimax-m3", "minimax-m3", "minimax-m3", "mimo-v2.5",
    ] : [
      "deepseek-v4-flash", "deepseek-v4-flash", "deepseek-v4-flash", "minimax-m3", "mimo-v2.5",
    ]);
    if (mode === "full") {
      expect(fetchMock.mock.calls.every(([, options]) => JSON.parse(options.body).reasoning === false)).toBe(true);
      expect(logs().find(log => log.event === "pipeline_start").models).toEqual(["minimax-m3", "mimo-v2.5"]);
    }
    expect(fetchMock.mock.calls.every(([, options]) => options.headers["x-opencode-session"] === "workflow-123")).toBe(true);
    expect(logs().at(-1)).toMatchObject({ event: "pipeline_complete", outcome: "success", requestedModel: "mimo-v2.5", durationMs: 3000 });
  });

  it("preserves ID on network and empty-content retries", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("network"), { code: "ECONNRESET" }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] })))
      .mockImplementationOnce(success);
    const pending = POST(makeRequest(body("qa")));
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([, options]) => options.headers["x-opencode-session"] === "workflow-123")).toBe(true);
  });

  it.each([undefined, null, "", " ", 123, {}, [], "bad\r\nheader", "bad\n", "bad\r", "has space", "é", "x".repeat(129)])(
    "rejects invalid/missing ID %j without provider calls", async sessionId => {
      const res = await POST(makeRequest({ ...body("qa"), sessionId }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("sessionId");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(["a", "x".repeat(128), "chat-123_ABC"])("accepts header-safe boundary %s", async sessionId => {
    fetchMock.mockImplementation(success);
    expect((await POST(makeRequest(body("full", sessionId)))).status).toBe(200);
    expect(fetchMock.mock.calls[0][1].headers["x-opencode-session"]).toBe(sessionId);
  });
});

const logs = () => vi.mocked(console.info).mock.calls.map(([, metadata]) => metadata);

describe("provider diagnostics", () => {
  it.each(["qa", "detect_fill", "extract_json"])("%s logs correlated metadata on all dispatch paths", async mode => {
    fetchMock.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 40));
      return {
        ok: true, status: 200,
        json: async () => {
          await new Promise(resolve => setTimeout(resolve, 60));
          return {
            model: "actual-provider-model", choices: [{ message: { content: "[]" } }],
            usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20,
              completion_tokens_details: { reasoning_tokens: 3 }, secret: "not-loggable" },
          };
        },
      };
    });
    for (let turn = 0; turn < 2; turn++) {
      const pending = POST(makeRequest(body(mode)));
      await vi.runAllTimersAsync();
      expect((await pending).status).toBe(200);
    }
    const starts = logs().filter(log => log.event === "pipeline_start");
    expect(starts[0].requestId).not.toBe(starts[1].requestId);
    for (const start of starts) {
      expect(start.requestId).not.toBe("workflow-123");
      const events = logs().filter(log => log.requestId === start.requestId);
      expect(events.every(log => log.mode === mode)).toBe(true);
      expect(events.map(log => log.event)).toEqual(["pipeline_start", "attempt_start", "headers", "body_complete", "attempt_success", "pipeline_complete"]);
      expect(events[2]).toMatchObject({ requestedModel: "deepseek-v4-flash", attempt: 1, status: 200, headersMs: 40 });
      expect(events[3].durationMs).toBe(100);
      expect(events[4]).toMatchObject({ returnedModel: "actual-provider-model", usage: {
        prompt_tokens: 12, completion_tokens: 8, total_tokens: 20, reasoning_tokens: 3,
      } });
      expect(events[5]).toMatchObject({ outcome: "success", durationMs: 100 });
    }
    expect(JSON.stringify(logs())).not.toMatch(/Transcript|Question|workflow-123|not-loggable|Bearer/);
  });

  it("logs safe retry reasons, backoff, fallbacks and total failure duration", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("PRIVATE_NETWORK_MESSAGE"), { code: "ECONNRESET" }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] })))
      .mockResolvedValueOnce(new Response("PRIVATE_BODY", { status: 400 }))
      .mockImplementation(() => new Response("PRIVATE_BODY", { status: 503 }));
    const pending = POST(makeRequest(body("qa")));
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(500);
    expect(logs().filter(log => log.event === "retry").map(({ reason, backoffMs, status }) => ({ reason, backoffMs, status }))).toEqual([
      { reason: "network", backoffMs: 1000 }, { reason: "empty", backoffMs: 2000 },
      { reason: "http", backoffMs: 1000, status: 503 }, { reason: "http", backoffMs: 2000, status: 503 },
      { reason: "http", backoffMs: 1000, status: 503 }, { reason: "http", backoffMs: 2000, status: 503 },
    ]);
    expect(logs().filter(log => log.event === "fallback").map(log => log.fallbackModel)).toEqual(["minimax-m3", "mimo-v2.5"]);
    expect(logs().at(-1)).toMatchObject({ event: "pipeline_complete", outcome: "failure", durationMs: 9000 });
    expect(new Set(logs().map(log => log.requestId)).size).toBe(1);
    expect(JSON.stringify([...logs(), ...vi.mocked(console.error).mock.calls])).not.toMatch(/PRIVATE_|Transcript|Bearer/);
  });

  it("omits missing/non-string model and unsafe token usage", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      model: { secret: "hidden" }, choices: [{ message: { content: "[]" } }],
      usage: { prompt_tokens: "12", completion_tokens: -1, total_tokens: 1.5, reasoning_tokens: 0 },
    })));
    await POST(makeRequest(body("qa")));
    const result = logs().find(log => log.event === "attempt_success");
    expect(result).not.toHaveProperty("returnedModel");
    expect(result.usage).toEqual({ reasoning_tokens: 0 });
  });
});
