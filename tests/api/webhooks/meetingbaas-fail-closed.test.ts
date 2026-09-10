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

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.MEETINGBAAS_WEBHOOK_SECRET;
  vi.resetModules();
});

const signPayload = (body: string, secret: string) => {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  return hmac.digest("hex");
};

describe("POST /api/webhooks/meetingbaas — fail-closed khi thiếu secret (bug E)", () => {
  it("trả 401 (reject) khi MEETINGBAAS_WEBHOOK_SECRET không được set", async () => {
    const { POST } = await import("@/app/api/webhooks/meetingbaas/route");
    const body = JSON.stringify({ event: "complete", data: {} });
    const req = new Request(
      "http://localhost:3000/api/webhooks/meetingbaas?userId=u1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MeetingBaas-Signature": "any-signature-here",
        },
        body,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("trả 401 kể cả khi có signature header (fail-closed)", async () => {
    const { POST } = await import("@/app/api/webhooks/meetingbaas/route");
    const body = JSON.stringify({ event: "complete", data: {} });
    const req = new Request(
      "http://localhost:3000/api/webhooks/meetingbaas?userId=u1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MeetingBaas-Signature": "a".repeat(64),
        },
        body,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

void signPayload;