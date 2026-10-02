import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "@/tests/helpers/fixtures";

// In-memory Firestore fake cho ext_sessions + meetings.
const store = new Map<string, any>();
let idCounter = 0;

const fakeDb = {
  collection: (name: string) => ({
    doc: (id?: string) => {
      const docId = id ?? `doc_${++idCounter}`;
      return {
        id: docId,
        set: async (data: any) => {
          store.set(`${name}/${docId}`, data);
        },
        // Tạo-nếu-chưa-có: trùng id thì ném ALREADY_EXISTS (code 6) như Admin SDK.
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
    where: (field: string, _op: string, value: any) => {
      const filters = [{ field, value }];
      const collect = (n?: number) => {
        const docs = [...store.entries()]
          .filter(([k]) => k.startsWith(name + "/"))
          .map(([k, v]) => ({ id: k.split("/")[1], data: () => v }))
          .filter((d) => filters.every((f) => d.data()?.[f.field] === f.value));
        const sliced = n ? docs.slice(0, n) : docs;
        return { empty: sliced.length === 0, docs: sliced };
      };
      const q: any = {
        where: (f: string, o: string, v: any) => {
          filters.push({ field: f, value: v });
          return q;
        },
        limit: (n: number) => ({ get: async () => collect(n) }),
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
      if (token === "valid-ext-token-2") return { uid: "user_ext_2", email: "b@x.com" };
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

let ipCounter = 0;
const authed = (body: unknown, token = "valid-ext-token") =>
  makeRequest(body, {
    headers: { Authorization: `Bearer ${token}` },
    ip: `10.20.30.${++ipCounter}`,
  });

beforeEach(() => {
  store.clear();
  idCounter = 0;
});

describe("POST /api/extension/session", () => {
  let POST: typeof import("@/app/api/extension/session/route").POST;
  beforeEach(async () => {
    POST = (await import("@/app/api/extension/session/route")).POST;
  });

  it("401 khi thiếu token", async () => {
    const res = await POST(makeRequest({ meetingUrl: "https://meet.google.com/abc-defg-hij" }));
    expect(res.status).toBe(401);
  });

  it("400 khi link không hỗ trợ", async () => {
    const res = await POST(authed({ meetingUrl: "https://example.com/x" }));
    expect(res.status).toBe(400);
  });

  it("tạo session Meet và tái dùng khi gọi lại cùng URL", async () => {
    const r1 = await POST(authed({ meetingUrl: "https://meet.google.com/abc-defg-hij" }));
    const b1 = await r1.json();
    expect(r1.status).toBe(200);
    expect(b1.provider).toBe("meet");
    expect(b1.reused).toBe(false);

    const r2 = await POST(authed({ meetingUrl: "https://meet.google.com/abc-defg-hij" }));
    const b2 = await r2.json();
    expect(b2.reused).toBe(true);
    expect(b2.sessionId).toBe(b1.sessionId);
  });

  it("chấp nhận link Meet lookup và từ chối link Zoom/Teams", async () => {
    const ok = await POST(authed({ meetingUrl: "https://meet.google.com/lookup/xyz123" }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).provider).toBe("meet");

    for (const meetingUrl of [
      "https://us02web.zoom.us/j/123456789",
      "https://teams.microsoft.com/l/meetup-join/abc/0?context=x",
    ]) {
      const res = await POST(authed({ meetingUrl }));
      expect(res.status).toBe(400);
    }
  });
});

describe("POST /api/extension/events + /end", () => {
  let sessionPOST: typeof import("@/app/api/extension/session/route").POST;
  let eventsPOST: typeof import("@/app/api/extension/events/route").POST;
  let endPOST: typeof import("@/app/api/extension/end/route").POST;

  beforeEach(async () => {
    sessionPOST = (await import("@/app/api/extension/session/route")).POST;
    eventsPOST = (await import("@/app/api/extension/events/route")).POST;
    endPOST = (await import("@/app/api/extension/end/route")).POST;
  });

  const newSession = async () => {
    const res = await sessionPOST(authed({ meetingUrl: "https://meet.google.com/abc-defg-hij" }));
    return (await res.json()).sessionId as string;
  };

  it("404 session lạ, 403 session của user khác", async () => {
    const r404 = await eventsPOST(authed({ sessionId: "nope", events: [] }));
    expect(r404.status).toBe(404);

    const sid = await newSession();
    const r403 = await eventsPOST(
      makeRequest(
        { sessionId: sid, events: [] },
        { headers: { Authorization: "Bearer valid-ext-token-2" }, ip: `10.20.30.${++ipCounter}` }
      )
    );
    expect(r403.status).toBe(403);
  });

  it("nhận batch roster/chat/transcript và dedupe", async () => {
    const sid = await newSession();
    const batch = {
      sessionId: sid,
      events: [
        { kind: "participants", participants: [{ name: "Nguyen A" }, { name: "Tran B" }] },
        {
          kind: "chat",
          messages: [{ id: "c1", sender: "Nguyen A", text: "Em đồng ý", timestamp: 1700000000000 }],
        },
        {
          kind: "transcript",
          segments: [{ id: "s1", speaker: "Nguyen A", text: "Xin chào", start: 0, end: 2 }],
        },
      ],
    };
    const r1 = await eventsPOST(authed(batch));
    const b1 = await r1.json();
    expect(b1).toMatchObject({ chatCount: 1, segmentCount: 1, participantCount: 2 });

    // Gửi lại y hệt → dedupe, số lượng không tăng.
    const r2 = await eventsPOST(authed(batch));
    const b2 = await r2.json();
    expect(b2).toMatchObject({ chatCount: 1, segmentCount: 1 });
  });

  it("end kết xuất Meeting + chatStats, gọi lại idempotent", async () => {
    const sid = await newSession();
    await eventsPOST(
      authed({
        sessionId: sid,
        events: [
          { kind: "participants", participants: [{ name: "Nguyen A" }, { name: "Tran B" }] },
          {
            kind: "chat",
            messages: [{ id: "c1", sender: "Nguyen A", text: "Em đồng ý", timestamp: 1700000000000 }],
          },
          {
            kind: "transcript",
            segments: [
              { id: "s1", speaker: "Nguyen A", text: "Xin chào", start: 0, end: 2 },
              { id: "s2", speaker: "Tran B", text: "Chào anh", start: 2.5, end: 4 },
            ],
          },
        ],
      })
    );

    const r1 = await endPOST(authed({ sessionId: sid }));
    const b1 = await r1.json();
    expect(r1.status).toBe(200);
    expect(b1.meetingId).toBeTruthy();

    const saved = store.get(`meetings/${b1.meetingId}`);
    expect(saved.source).toBe("extension");
    expect(saved.provider).toBe("meet");
    expect(saved.speakers.map((s: any) => s.name)).toEqual(["Nguyen A", "Tran B"]);
    expect(saved.segments.map((s: any) => s.speakerId)).toEqual(["SPEAKER_00", "SPEAKER_01"]);
    expect(saved.chatStats.totalMessages).toBe(1);
    expect(saved.chatStats.responders).toEqual(["Nguyen A"]);
    expect(saved.chatStats.silent).toEqual(["Tran B"]);

    const r2 = await endPOST(authed({ sessionId: sid }));
    expect((await r2.json()).reused).toBe(true);

    // Session ended → events trả 409.
    const r3 = await eventsPOST(authed({ sessionId: sid, events: [] }));
    expect(r3.status).toBe(409);
  });

  it("nháy đúp nút Bắt đầu: 2 request đua nhau chỉ tạo 1 session", async () => {
    const payload = { meetingUrl: "https://meet.google.com/abc-defg-hij" };
    const [r1, r2] = await Promise.all([sessionPOST(authed(payload)), sessionPOST(authed(payload))]);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.sessionId).toBe(b2.sessionId);
    const reusedFlags = [b1.reused, b2.reused].sort();
    expect(reusedFlags).toEqual([false, true]);
    const sessions = [...store.keys()].filter((k) => k.startsWith("ext_sessions/"));
    expect(sessions).toHaveLength(1);
  });

  it("participants thiếu field: strip undefined để Firestore không 500", async () => {
    const sid = await newSession();
    // Entry thiếu id/displayName (đúng payload extension gửi) — trước đây
    // Admin SDK set() ném lỗi vì value undefined → HTTP 500 toàn batch.
    const res = await eventsPOST(
      authed({
        sessionId: sid,
        events: [{ kind: "participants", participants: [{ name: "Nguyen A" }] }],
      })
    );
    expect(res.status).toBe(200);
    const key = [...store.keys()].find((k) => k === `ext_sessions/${sid}`);
    const saved = store.get(key!);
    expect(saved.participants).toEqual([{ name: "Nguyen A" }]);
    for (const p of saved.participants) {
      for (const v of Object.values(p as Record<string, unknown>)) {
        expect(v).not.toBeUndefined();
      }
    }
  });

  it("end phiên rỗng: đóng session mà không tạo biên bản", async () => {
    const sid = await newSession();
    const res = await endPOST(authed({ sessionId: sid }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, meetingId: null, empty: true });
    const meetings = [...store.keys()].filter((k) => k.startsWith("meetings/"));
    expect(meetings).toHaveLength(0);
  });
});
