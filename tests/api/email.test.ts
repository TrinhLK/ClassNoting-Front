import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "@/tests/helpers/fixtures";

vi.mock("@/app/lib/firebase-admin", () => ({
  getAdminAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(async (token: string) => {
      if (token.startsWith("valid-")) {
        const uid = token.replace("valid-", "") || "user_default";
        return { uid: `user_${uid}`, email: `${uid}@example.com` };
      }
      throw new Error("Invalid token");
    }),
  })),
}));

const sendMailMock = vi.fn(async () => ({ messageId: "mock-id" }));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: sendMailMock,
    })),
  },
}));

vi.mock("@/app/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/rate-limit")>(
    "@/app/lib/rate-limit"
  );
  return { ...actual };
});

let tokenCounter = 0;
const validToken = () => `Bearer valid-u${++tokenCounter}-${Date.now()}`;

beforeEach(() => {
  sendMailMock.mockClear();
  sendMailMock.mockResolvedValue({ messageId: "mock-id" });
});

describe("POST /api/email — auth + rate limit + bounce (bug 6.1, 6.2, 6.3)", () => {
  let POST: typeof import("@/app/api/email/route").POST;

  beforeEach(async () => {
    const fresh = await import("@/app/api/email/route?fresh=" + Date.now());
    POST = fresh.POST;
  });

  it("trả 401 khi thiếu Authorization header", async () => {
    const req = makeRequest({ tasks: [], meetingTitle: "Test" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("trả 401 khi token không hợp lệ", async () => {
    const req = makeRequest(
      { tasks: [], meetingTitle: "Test" },
      { headers: { Authorization: "Bearer invalid-token" } }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("trả 401 khi token không có prefix Bearer", async () => {
    const req = makeRequest(
      { tasks: [], meetingTitle: "Test" },
      { headers: { Authorization: "valid-token-no-prefix" } }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("trả 429 khi vượt rate limit (10 email / 60s cho cùng user)", async () => {
    const sharedToken = validToken();
    const body = { tasks: [], meetingTitle: "Test" };
    const makeReq = () =>
      makeRequest(body, {
        headers: { Authorization: sharedToken },
        ip: "55.55.55.55",
      });

    for (let i = 0; i < 10; i++) {
      const res = await POST(makeReq());
      expect(res.status).not.toBe(429);
    }
    const blocked = await POST(makeReq());
    expect(blocked.status).toBe(429);
  });

  it("gửi email cho từng task có email hợp lệ", async () => {
    const body = {
      tasks: [
        {
          task: "Soạn báo cáo",
          deadline: "2025-12-31T17:00",
          email: ["user1@example.com", "user2@example.com"],
        },
      ],
      meetingTitle: "Họp tuần",
    };
    const req = makeRequest(body, {
      headers: { Authorization: validToken() },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
  });

  it("không gửi email cho task không có email hợp lệ", async () => {
    const body = {
      tasks: [
        { task: "A", deadline: "2025-12-31", email: [] },
        { task: "B", deadline: "2025-12-31" },
      ],
      meetingTitle: "Test",
    };
    const req = makeRequest(body, {
      headers: { Authorization: validToken() },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("auth check TRƯỚC rate limit — request không token không được count vào rate limit window (bug DoS fix)", async () => {
    const makeReq = () =>
      makeRequest(
        { tasks: [], meetingTitle: "Test" },
        { ip: "33.33.33.33" }
      );

    for (let i = 0; i < 20; i++) {
      const res = await POST(makeReq());
      expect(res.status).toBe(401);
    }

    sendMailMock.mockClear();
    sendMailMock.mockResolvedValue({ messageId: "ok" });
    const validReq = makeRequest(
      {
        tasks: [
          { task: "Test", deadline: "x", email: ["a@example.com"] },
        ],
        meetingTitle: "Test",
      },
      {
        headers: { Authorization: validToken() },
        ip: "33.33.33.33",
      }
    );
    const validRes = await POST(validReq);
    expect(validRes.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalled();
  });

  it("vẫn trả 200 và đếm failures khi một số email fail (bug 6.3 Promise.allSettled)", async () => {
    sendMailMock.mockReset();
    sendMailMock
      .mockResolvedValueOnce({ messageId: "ok1" })
      .mockRejectedValueOnce(new Error("SMTP down"))
      .mockResolvedValueOnce({ messageId: "ok3" });

    const body = {
      tasks: [
        { task: "A", deadline: "x", email: ["a@example.com"] },
        { task: "B", deadline: "x", email: ["b@example.com"] },
        { task: "C", deadline: "x", email: ["c@example.com"] },
      ],
      meetingTitle: "Test",
    };
    const req = makeRequest(body, {
      headers: { Authorization: validToken() },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(3);
    expect(json.failures).toBe(1);
  });

  it("email HTML chứa link unsubscribe (bug 6.4)", async () => {
    const body = {
      tasks: [{ task: "A", deadline: "x", email: ["user@example.com"] }],
      meetingTitle: "Test",
    };
    const req = makeRequest(body, {
      headers: { Authorization: validToken() },
    });
    await POST(req);

    const callArgs = sendMailMock.mock.calls[0][0];
    expect(callArgs.html).toContain("unsubscribe");
  });

  it("formatDeadline trả về string gốc cho 'TBD' hoặc 'Chưa rõ'", async () => {
    const body = {
      tasks: [
        { task: "A", deadline: "TBD", email: ["user@example.com"] },
        { task: "B", deadline: "Chưa rõ", email: ["user@example.com"] },
      ],
      meetingTitle: "Test",
    };
    const req = makeRequest(body, {
      headers: { Authorization: validToken() },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("formatDeadline chuyển ISO thành vi-VN locale", async () => {
    const body = {
      tasks: [
        { task: "A", deadline: "2025-06-15T14:30", email: ["user@example.com"] },
      ],
      meetingTitle: "Test",
    };
    const req = makeRequest(body, {
      headers: { Authorization: validToken() },
    });
    await POST(req);

    const html = sendMailMock.mock.calls[0][0].html;
    expect(html).toMatch(/15.*06.*2025|2025.*06.*15/);
  });
});
