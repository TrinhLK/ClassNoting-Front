import { test, expect } from "@playwright/test";

test.describe("API routes — health check (không cần auth)", () => {
  test("GET /api/proxy-file không có url → 400", async ({ request }) => {
    const res = await request.get("/api/proxy-file");
    expect(res.status()).toBe(400);
    const text = await res.text();
    expect(text).toBe("Missing URL parameter");
  });

  test("GET /api/proxy-file với localhost → 403 (SSRF)", async ({ request }) => {
    const res = await request.get(
      "/api/proxy-file?url=https://localhost:3000/secret"
    );
    expect(res.status()).toBe(403);
  });

  test("GET /api/proxy-file với metadata.google.internal → 403", async ({ request }) => {
    const res = await request.get(
      "/api/proxy-file?url=https://metadata.google.internal/"
    );
    expect(res.status()).toBe(403);
  });

  test("GET /api/proxy-file với http (không phải https) → 403", async ({ request }) => {
    const res = await request.get(
      "/api/proxy-file?url=http://example.com/file.pdf"
    );
    expect(res.status()).toBe(403);
  });

  test("POST /api/email không Authorization → 401", async ({ request }) => {
    const res = await request.post("/api/email", {
      data: { tasks: [], meetingTitle: "Test" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/email với Bearer invalid → 401", async ({ request }) => {
    const res = await request.post("/api/email", {
      data: { tasks: [], meetingTitle: "Test" },
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/bots/join thiếu meetingUrl → 400", async ({ request }) => {
    const res = await request.post("/api/bots/join", {
      data: { userId: "u1" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/bots/join thiếu userId → 400", async ({ request }) => {
    const res = await request.post("/api/bots/join", {
      data: { meetingUrl: "https://meet.google.com/abc-defg-hij" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/gemini thiếu text → 400", async ({ request }) => {
    const res = await request.post("/api/gemini", {
      data: { mode: "default", sessionId: "health-missing-text" },
    });
    expect(res.status()).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Thiếu nội dung text" });
  });

  test("POST /api/webhooks/meetingbaas thiếu signature → 401", async ({
    request,
  }) => {
    const res = await request.post(
      "/api/webhooks/meetingbaas?userId=u1",
      {
        data: { event: "complete", data: {} },
      }
    );
    expect(res.status()).toBe(401);
  });

  test("POST /api/webhooks/meetingbaas sai signature → 401", async ({
    request,
  }) => {
    const res = await request.post(
      "/api/webhooks/meetingbaas?userId=u1",
      {
        data: { event: "complete", data: {} },
        headers: { "X-MeetingBaas-Signature": "wrong-signature" },
      }
    );
    expect(res.status()).toBe(401);
  });
});

test.describe("API routes — auth trước rate limit (DoS protection)", () => {
  test("email: 11 request KHÔNG có Authorization → 401 (auth fail đầu tiên, không count rate limit)", async ({
    request,
  }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request.post("/api/email", {
        data: { tasks: [], meetingTitle: "Test" },
        headers: { "x-forwarded-for": "192.0.2.99" },
      });
      statuses.push(res.status());
    }

    expect(statuses.every((s) => s === 401)).toBe(true);
  });
});
