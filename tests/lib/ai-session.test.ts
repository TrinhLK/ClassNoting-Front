import { describe, expect, it, vi, afterEach } from "vitest";
import { createAiSessionId, isValidAiSessionId, meetingAiSessionId } from "@/app/lib/ai-session";
import { postGemini, requestSummary, requestSegmentSummary, requestFillPlaceholders, requestDetectFill } from "@/app/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("AI workflow IDs and wrappers", () => {
  it("creates distinct opaque UUIDs and separates deterministic meeting workflows", () => {
    const a = createAiSessionId("chat");
    expect(a).toMatch(/^chat-[0-9a-f-]{36}$/);
    expect(isValidAiSessionId(a)).toBe(true);
    expect(createAiSessionId("chat")).not.toBe(a);
    expect(meetingAiSessionId("summary", "meeting-123")).toBe("summary-meeting-123");
    expect(meetingAiSessionId("summary", "meeting-123")).toBe(meetingAiSessionId("summary", "meeting-123"));
    expect(meetingAiSessionId("tasks", "meeting-123")).not.toBe(meetingAiSessionId("summary", "meeting-123"));
    expect(meetingAiSessionId("summary", "meeting-456")).not.toBe(meetingAiSessionId("summary", "meeting-123"));
    expect(() => meetingAiSessionId("summary", "")).toThrow();
  });

  it("all six client modes serialize the caller-owned ID", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ summary: "[]" })));
    vi.stubGlobal("fetch", fetchMock);
    await requestSummary("text", "summary-test");
    await requestSegmentSummary("text", "live-test", "previous");
    await requestFillPlaceholders(["NAME"], "docs-test");
    await requestDetectFill("text", "docs-test");
    await postGemini({ mode: "qa", sessionId: "chat-test" });
    await postGemini({ mode: "extract_json", sessionId: "tasks-test" });
    expect(fetchMock.mock.calls.map(call => JSON.parse((call as unknown as [string, RequestInit])[1].body as string).sessionId))
      .toEqual(["summary-test", "live-test", "docs-test", "docs-test", "chat-test", "tasks-test"]);
  });

  it("rejects an invalid client ID without dispatching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(postGemini({ mode: "qa", sessionId: "bad\nvalue" })).rejects.toThrow("sessionId");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
