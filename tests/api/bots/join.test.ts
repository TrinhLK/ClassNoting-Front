import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "@/tests/helpers/fixtures";

vi.mock("@/app/lib/firebase-admin", () => ({
  getAdminAuth: vi.fn(),
}));

vi.mock("@/app/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/rate-limit")>(
    "@/app/lib/rate-limit"
  );
  return { ...actual };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(async () => ({ messageId: "mock-id" })),
    })),
  },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.MEETINGBAAS_API_KEY = "test-meetingbaas-key";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
});

describe("POST /api/bots/join — validate input + MeetingBaas call (bug 3.5)", () => {
  let POST: typeof import("@/app/api/bots/join/route").POST;

  beforeEach(async () => {
    const mod = await import("@/app/api/bots/join/route");
    POST = mod.POST;
  });

  it("trả 400 khi thiếu meetingUrl", async () => {
    const req = makeRequest({ userId: "u1" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing meetingUrl");
  });

  it("trả 400 khi thiếu userId", async () => {
    const req = makeRequest({ meetingUrl: "https://meet.google.com/abc-defg-hij" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing userId");
  });

  it("trả 500 khi thiếu MEETINGBAAS_API_KEY", async () => {
    const original = process.env.MEETINGBAAS_API_KEY;
    delete process.env.MEETINGBAAS_API_KEY;
    const req = makeRequest({
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      userId: "u1",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    process.env.MEETINGBAAS_API_KEY = original;
  });

  it("gọi MeetingBaas API với payload đầy đủ khi input hợp lệ", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { bot_id: "bot_xyz" } }),
    });

    const req = makeRequest({
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      botName: "Custom Bot",
      userId: "user_123",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://api.meetingbaas.com/v2/bots");
    const body = JSON.parse(calledOpts.body);
    expect(body.meeting_url).toBe("https://meet.google.com/abc-defg-hij");
    expect(body.bot_name).toBe("Custom Bot");
    expect(body.entry_message).toContain("Meeting AI Bot");
  });

  it("trả 429 khi vượt rate limit (10 req / 5 phút)", async () => {
    const makeRateLimitReq = () =>
      makeRequest(
        { meetingUrl: "https://meet.google.com/x", userId: "u1" },
        { ip: "9.9.9.9" }
      );
    for (let i = 0; i < 10; i++) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { bot_id: "bot_x" } }),
      });
      const res = await POST(makeRateLimitReq());
      expect(res.status).toBe(200);
    }
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { bot_id: "bot_x" } }),
    });
    const blockedRes = await POST(makeRateLimitReq());
    expect(blockedRes.status).toBe(429);
  });

  it("trả status tương ứng khi MeetingBaas trả lỗi", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () => "MeetingBaas down",
    });

    const req = makeRequest({
      meetingUrl: "https://meet.google.com/y",
      userId: "u2",
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Failed to join meeting");
  });
});
