import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "@/tests/helpers/fixtures";

vi.mock("@/app/lib/firebase-admin", () => ({
  getAdminDb: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          data: () => ({
            chatMessages: [
              { id: "c1", sender: "Nguyen A", text: "Em đồng ý", timestamp: 1700000000000 },
            ],
            participants: [{ name: "Nguyen A" }],
          }),
        }),
      }),
    }),
  }),
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
  process.env.MEETINGBAAS_API_KEY = "test-key";
});

describe("GET /api/bots/status — speaker + chat live", () => {
  let GET: typeof import("@/app/api/bots/status/route").GET;

  beforeEach(async () => {
    const mod = await import("@/app/api/bots/status/route");
    GET = mod.GET;
  });

  const getReq = (botId = "bot_1", userId = "u1") =>
    ({ url: `http://localhost:3000/api/bots/status?botId=${botId}&userId=${userId}`, headers: new Headers() }) as unknown as Request;

  it("trả 400 khi thiếu botId/userId", async () => {
    const req = { url: "http://localhost:3000/api/bots/status", headers: new Headers() } as unknown as Request;
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("gộp participants + chat live khi bot đang ghi âm", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          status: "in_call_recording",
          meeting_url: "https://meet.google.com/abc-defg-hij",
          participants: [{ display_name: "Host", id: 1 }],
          speakers: [{ name: "Host" }],
        },
      }),
    });

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("in_call_recording");
    expect(body.provider).toBe("meet");
    expect(body.participants).toEqual([{ name: "Host", id: 1, displayName: "Host" }]);
    expect(body.chatMessages).toEqual([
      { id: "c1", sender: "Nguyen A", text: "Em đồng ý", timestamp: 1700000000000 },
    ]);
  });

  it("đính kèm provider/botId/chatMessages vào meetingData khi completed", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          status: "completed",
          meeting_url: "https://teams.microsoft.com/l/meetup-join/abc/0?context=x",
          mp3: "https://s3.example/audio.mp3",
          duration_seconds: 60,
          speakers: [{ name: "Nguyen A" }],
        },
      }),
    });

    const res = await GET(getReq("bot_2"));
    const body = await res.json();
    expect(body.status).toBe("completed");
    expect(body.shouldSave).toBe(true);
    expect(body.meetingData.provider).toBe("teams");
    expect(body.meetingData.botId).toBe("bot_2");
    expect(body.meetingData.chatMessages).toHaveLength(1);
    expect(body.meetingData.speakers[0].name).toBe("Nguyen A");
  });
});
