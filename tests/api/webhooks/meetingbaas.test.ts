import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

vi.mock("@/app/lib/db", () => ({
  saveMeeting: vi.fn(async () => {}),
  updateMeetingProcess: vi.fn(async () => {}),
}));

vi.mock("@/app/lib/firebase-admin", () => ({
  getAdminStorage: vi.fn(() => ({
    bucket: vi.fn(() => ({
      file: vi.fn(() => ({
        save: vi.fn(async () => {}),
        getSignedUrl: vi.fn(async () => ["https://signed-url.example/file"]),
      })),
    })),
  })),
}));

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
  process.env.MEETINGBAAS_WEBHOOK_SECRET = "test-webhook-secret";
  vi.resetModules();
});

const signPayload = (body: string, secret: string) => {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  return hmac.digest("hex");
};

describe("POST /api/webhooks/meetingbaas — HMAC verify (bug 3.7)", () => {
  let POST: typeof import("@/app/api/webhooks/meetingbaas/route").POST;
  let saveMeetingMock: ReturnType<typeof vi.fn>;
  let updateMeetingProcessMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const dbModule = await import("@/app/lib/db");
    saveMeetingMock = dbModule.saveMeeting as ReturnType<typeof vi.fn>;
    updateMeetingProcessMock = dbModule.updateMeetingProcess as ReturnType<typeof vi.fn>;
    saveMeetingMock.mockClear();
    updateMeetingProcessMock.mockClear();
    POST = (await import("@/app/api/webhooks/meetingbaas/route")).POST;
  });

  it("trả 401 khi thiếu signature header", async () => {
    const body = JSON.stringify({ event: "complete", data: {} });
    const req = new Request(
      "http://localhost:3000/api/webhooks/meetingbaas?userId=u1",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("trả 401 khi signature sai", async () => {
    const body = JSON.stringify({ event: "complete", data: {} });
    const req = new Request(
      "http://localhost:3000/api/webhooks/meetingbaas?userId=u1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MeetingBaas-Signature": "wrong-signature",
        },
        body,
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("chấp nhận request với signature đúng", async () => {
    const body = JSON.stringify({ event: "failed", data: { bot_id: "b1", error: "timeout" } });
    const sig = signPayload(body, process.env.MEETINGBAAS_WEBHOOK_SECRET!);
    const req = new Request(
      "http://localhost:3000/api/webhooks/meetingbaas?userId=u1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MeetingBaas-Signature": sig,
        },
        body,
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(updateMeetingProcessMock).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ status: "failed" })
    );
  });

  it("trả 400 khi thiếu userId trong query", async () => {
    const body = JSON.stringify({ event: "failed", data: {} });
    const sig = signPayload(body, process.env.MEETINGBAAS_WEBHOOK_SECRET!);
    const req = new Request("http://localhost:3000/api/webhooks/meetingbaas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MeetingBaas-Signature": sig,
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("handle event complete với segments rỗng → mark FAILED, không save meeting", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    const body = JSON.stringify({
      event: "complete",
      data: {
        bot_id: "bot_empty",
        mp4: undefined,
        transcription: undefined,
        speakers: [],
        transcript: [],
      },
    });
    const sig = signPayload(body, process.env.MEETINGBAAS_WEBHOOK_SECRET!);
    const req = new Request(
      "http://localhost:3000/api/webhooks/meetingbaas?userId=user_1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MeetingBaas-Signature": sig,
        },
        body,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(saveMeetingMock).not.toHaveBeenCalled();
  });
});
