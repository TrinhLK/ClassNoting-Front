import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

// Store in-memory cho meeting_bots (sống sót qua vi.resetModules).
const store = new Map<string, Record<string, unknown>>();

vi.mock("@/app/lib/db", () => ({
  saveMeeting: vi.fn(async () => {}),
  updateMeetingProcess: vi.fn(async () => {}),
}));

vi.mock("@/app/lib/firebase-admin", () => ({
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const d = store.get(`${name}/${id}`);
          return { exists: !!d, data: () => d };
        },
        set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
          const prev = store.get(`${name}/${id}`) || {};
          store.set(`${name}/${id}`, opts?.merge === false ? data : { ...prev, ...data });
        },
      }),
    }),
  }),
  getAdminStorage: vi.fn(() => ({
    bucket: vi.fn(() => ({
      file: vi.fn(() => ({
        save: vi.fn(async () => {}),
        getSignedUrl: vi.fn(async () => ["https://signed-url.example/file"]),
      })),
    })),
  })),
  getAdminAuth: vi.fn(),
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
  store.clear();
});

const signPayload = (body: string, secret: string) => {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  return hmac.digest("hex");
};

const buildReq = (payload: unknown, opts: { userId?: string; badSig?: boolean; noSig?: boolean } = {}) => {
  const raw = JSON.stringify(payload);
  const url =
    "http://localhost:3000/api/webhooks/meetingbaas" +
    (opts.userId ? `?userId=${opts.userId}` : "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opts.noSig) {
    headers["X-MeetingBaas-Signature"] = opts.badSig ? "deadbeef" : signPayload(raw, process.env.MEETINGBAAS_WEBHOOK_SECRET!);
  }
  return new Request(url, { method: "POST", headers, body: raw });
};

describe("POST /api/webhooks/meetingbaas — HMAC + chat + userId fallback", () => {
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
    const res = await POST(buildReq({ event: "complete", data: {} }, { userId: "u1", noSig: true }));
    expect(res.status).toBe(401);
  });

  it("trả 401 khi signature sai", async () => {
    const res = await POST(buildReq({ event: "complete", data: {} }, { userId: "u1", badSig: true }));
    expect(res.status).toBe(401);
  });

  it("failed event → mark FAILED (có userId ở query)", async () => {
    const res = await POST(
      buildReq({ event: "failed", data: { bot_id: "b1", error: "timeout" } }, { userId: "u1" })
    );
    expect(res.status).toBe(200);
    expect(updateMeetingProcessMock).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ status: "failed" })
    );
  });

  it("trả 400 khi thiếu userId ở cả query và payload.extra", async () => {
    const res = await POST(buildReq({ event: "failed", data: {} }));
    expect(res.status).toBe(400);
  });

  it("fallback userId từ data.extra khi thiếu query (webhook dashboard)", async () => {
    const res = await POST(
      buildReq({
        event: "bot.chat_message",
        data: {
          bot_id: "bot_1",
          message: { sender: "Nguyen A", text: "Em đồng ý", timestamp: 1700000000000 },
          extra: { userId: "u2" },
        },
      })
    );
    expect(res.status).toBe(200);
    expect(store.get("meeting_bots/bot_1")?.chatMessages).toHaveLength(1);
  });

  it("lưu chat realtime khi có userId ở query", async () => {
    const res = await POST(
      buildReq(
        {
          event: "bot.chat_message",
          data: {
            bot_id: "bot_1",
            message: { sender: "Nguyen A", text: "Em đồng ý", timestamp: 1700000000000 },
          },
        },
        { userId: "u1" }
      )
    );
    expect(res.status).toBe(200);
    expect(store.get("meeting_bots/bot_1")?.chatMessages[0]?.sender).toBe("Nguyen A");
  });

  it("complete với segments rỗng → FAILED, không save meeting", async () => {
    const res = await POST(
      buildReq(
        {
          event: "complete",
          data: {
            bot_id: "bot_empty",
            mp4: undefined,
            transcription: undefined,
            speakers: [],
            transcript: [],
          },
        },
        { userId: "user_1" }
      )
    );
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(saveMeetingMock).not.toHaveBeenCalled();
  });
});
