import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, Record<string, unknown>>();

vi.mock("@/app/lib/firebase-admin", () => ({
  getAdminAuth: () => ({
    verifyIdToken: async (token: string) => {
      if (token === "valid-ext-token") return { uid: "user_ext_1", email: "a@x.com" };
      if (token === "valid-ext-token-2") return { uid: "user_ext_2", email: "b@x.com" };
      throw new Error("Invalid token");
    },
  }),
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const d = store.get(`${name}/${id}`);
          return { exists: !!d, data: () => d };
        },
        set: async (data: Record<string, unknown>) => {
          store.set(`${name}/${id}`, data);
        },
      }),
    }),
  }),
  getAdminStorage: vi.fn(),
}));

vi.mock("@/app/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/rate-limit")>(
    "@/app/lib/rate-limit"
  );
  return { ...actual };
});

let ipCounter = 200;
const post = (body: unknown, token = "valid-ext-token") =>
  new Request("http://localhost:3000/api/extension/rename", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-forwarded-for": `10.40.40.${++ipCounter}`,
    },
    body: JSON.stringify(body),
  });

const seedSession = (id: string, ownerUid = "user_ext_1") =>
  store.set(`ext_sessions/${id}`, {
    id,
    ownerUid,
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    provider: "meet",
    title: "Họp Meet abc-defg-hij 02/10 19:49",
    status: "live",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    participants: [],
    chatMessages: [],
    liveSegments: [],
    audioManifest: [],
  });

beforeEach(() => {
  store.clear();
});

describe("POST /api/extension/rename", () => {
  let POST: typeof import("@/app/api/extension/rename/route").POST;

  beforeEach(async () => {
    POST = (await import("@/app/api/extension/rename/route")).POST;
  });

  it("401 khi thiếu token, 400 khi thiếu title/sessionId", async () => {
    const noAuth = new Request("http://localhost:3000/api/extension/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1", title: "X" }),
    });
    expect((await POST(noAuth)).status).toBe(401);
    expect((await POST(post({ sessionId: "s1" }))).status).toBe(400);
    expect((await POST(post({ title: "X" }))).status).toBe(400);
  });

  it("404 session lạ, 403 session của user khác", async () => {
    seedSession("s1");
    expect((await POST(post({ sessionId: "nope", title: "X" }))).status).toBe(404);
    const r403 = await POST(post({ sessionId: "s1", title: "X" }, "valid-ext-token-2"));
    expect(r403.status).toBe(403);
  });

  it("đổi tên thành công, cắt 120 ký tự", async () => {
    seedSession("s1");
    const res = await POST(post({ sessionId: "s1", title: "  Họp giao ban tuần  " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, title: "Họp giao ban tuần" });
    expect((store.get("ext_sessions/s1") as { title: string }).title).toBe("Họp giao ban tuần");

    const longRes = await POST(post({ sessionId: "s1", title: "x".repeat(200) }));
    expect(((await longRes.json()) as { title: string }).title).toHaveLength(120);
  });
});
