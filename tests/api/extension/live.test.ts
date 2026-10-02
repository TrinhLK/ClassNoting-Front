import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, Record<string, unknown>>();
let idCounter = 0;

const fakeDb = {
  collection: (name: string) => ({
    doc: (id?: string) => {
      const docId = id ?? `doc_${++idCounter}`;
      return {
        id: docId,
        set: async (data: Record<string, unknown>) => {
          store.set(`${name}/${docId}`, data);
        },
        create: async (data: Record<string, unknown>) => {
          if (store.has(`${name}/${docId}`)) {
            const err = new Error("ALREADY_EXISTS") as Error & { code: number };
            err.code = 6;
            throw err;
          }
          store.set(`${name}/${docId}`, data);
        },
        get: async () => {
          const d = store.get(`${name}/${docId}`);
          return { exists: !!d, data: () => d };
        },
      };
    },
    where: (field: string, _op: string, value: unknown) => {
      const filters = [{ field, value }];
      const collect = () => {
        const docs = [...store.entries()]
          .filter(([k]) => k.startsWith(name + "/"))
          .map(([k, v]) => ({ id: k.split("/")[1], data: () => v }))
          .filter((d) =>
            filters.every(
              (f) =>
                (d.data() as Record<string, unknown> | undefined)?.[f.field] === f.value
            )
          );
        return { empty: docs.length === 0, docs };
      };
      const q: {
        where: (f: string, o: string, v: unknown) => unknown;
        limit: () => { get: () => Promise<unknown> };
        get: () => Promise<unknown>;
      } = {
        where: (f: string, o: string, v: unknown) => {
          filters.push({ field: f, value: v });
          return q;
        },
        limit: () => ({ get: async () => collect() }),
        get: async () => collect(),
      };
      return q;
    },
  }),
};

vi.mock("@/app/lib/firebase-admin", () => ({
  getAdminAuth: () => ({
    verifyIdToken: async (token: string) => {
      if (token === "valid-ext-token") return { uid: "user_ext_1", email: "a@x.com" };
      throw new Error("Invalid token");
    },
  }),
  getAdminDb: () => fakeDb,
  getAdminStorage: vi.fn(),
}));

vi.mock("@/app/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/rate-limit")>(
    "@/app/lib/rate-limit"
  );
  return { ...actual };
});

let ipCounter = 100;
const getReq = (meetingUrl?: string, token = "valid-ext-token", ip?: string) => {
  const url =
    "http://localhost:3000/api/extension/live" +
    (meetingUrl !== undefined ? `?meetingUrl=${encodeURIComponent(meetingUrl)}` : "");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  headers["x-forwarded-for"] = ip ?? `10.30.30.${++ipCounter}`;
  return new Request(url, { method: "GET", headers });
};

const postSession = async (
  sessionPOST: typeof import("@/app/api/extension/session/route").POST,
  meetingUrl: string
) => {
  const req = new Request("http://localhost:3000/api/extension/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-ext-token",
      "x-forwarded-for": `10.30.30.${++ipCounter}`,
    },
    body: JSON.stringify({ meetingUrl }),
  });
  return sessionPOST(req);
};

beforeEach(() => {
  store.clear();
  idCounter = 0;
});

describe("GET /api/extension/live — web tìm phiên live theo link", () => {
  let GET: typeof import("@/app/api/extension/live/route").GET;
  let sessionPOST: typeof import("@/app/api/extension/session/route").POST;

  beforeEach(async () => {
    GET = (await import("@/app/api/extension/live/route")).GET;
    sessionPOST = (await import("@/app/api/extension/session/route")).POST;
  });

  it("401 khi thiếu token, 400 khi thiếu meetingUrl", async () => {
    expect((await GET(getReq("https://meet.google.com/abc-defg-hij", ""))).status).toBe(401);
    expect((await GET(getReq(undefined))).status).toBe(400);
  });

  it("404 khi chưa có phiên live", async () => {
    const res = await GET(getReq("https://meet.google.com/abc-defg-hij"));
    expect(res.status).toBe(404);
  });

  it("tìm thấy phiên dù tab Meet kèm query (?authuser=...)", async () => {
    const created = await postSession(
      sessionPOST,
      "https://meet.google.com/abc-defg-hij?authuser=0&hl=vi"
    );
    expect(created.status).toBe(200);
    const { sessionId } = await created.json();

    // Web hỏi bằng link dán (không query) → vẫn khớp nhờ chuẩn hóa
    const res = await GET(getReq("https://meet.google.com/abc-defg-hij"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, sessionId, provider: "meet" });
  });
});
