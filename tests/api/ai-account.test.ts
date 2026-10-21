import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { memoryFirestore } from "@/tests/helpers/admin-firestore";

const state = vi.hoisted(() => ({ store: new Map<string, any>(), db: null as any }));
vi.mock("@/app/lib/firebase-admin", () => ({ getAdminDb: () => state.db }));
vi.mock("@/app/lib/extension-auth", () => ({ verifyExtensionAuth: async (req: Request) => {
  const uid = req.headers.get("Authorization")?.replace("Bearer ", "");
  return uid ? { uid } : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
} }));
vi.mock("@/app/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
import { POST } from "@/app/api/gemini/route";
import { GET, PUT, DELETE } from "@/app/api/account/ai/route";
import { getAiAccountStatus, saveGeminiKey } from "@/app/lib/ai-account";
const fetchMock = vi.fn();
const key = `AQ.${"a".repeat(50)}`;
function req(body: any, uid = "alice", method = "POST") {
  return new Request("https://smart-noting.vercel.app/api/gemini", { method, headers: { "Content-Type": "application/json", ...(uid ? { Authorization: `Bearer ${uid}` } : {}) }, ...(method !== "GET" ? { body: JSON.stringify(body) } : {}) });
}
const summaryBody = (id = "m1") => ({ mode: "full", text: "Nội dung cuộc họp", sessionId: `summary-${id}` });
const success = () => new Response(JSON.stringify({ choices: [{ message: { content: "Tóm tắt kiểm thử" } }] }));
beforeEach(() => {
  state.store.clear(); state.db = memoryFirestore(state.store);
  state.store.set("meetings/m1", { userId: "alice" });
  process.env.GEMINI_KEY_ENCRYPTION_SECRET = "unit-test-encryption-secret-over-32-characters";
  process.env.GOOGLE_AI_API_KEY = "system-test-key";
  fetchMock.mockReset().mockImplementation(success); vi.stubGlobal("fetch", fetchMock);
});
describe("authenticated AI dispatch and quota", () => {
  it("rejects anonymous generation before any provider call", async () => {
    expect((await POST(req(summaryBody(), ""))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("counts success once, reuses same meeting on retries, isolates ownership", async () => {
    expect((await POST(req(summaryBody()))).status).toBe(200);
    expect((await POST(req(summaryBody()))).status).toBe(200);
    expect(await getAiAccountStatus("alice")).toMatchObject({ freeUsed: 1 });
    expect((await POST(req(summaryBody(), "bob"))).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("returns setup action on the eleventh meeting without sending its text to Google", async () => {
    for (let i = 0; i < 10; i++) { state.store.set(`meetings/m${i}`, { userId: "alice" }); expect((await POST(req(summaryBody(`m${i}`)))).status).toBe(200); }
    state.store.set("meetings/m10", { userId: "alice" });
    const response = await POST(req(summaryBody("m10")));
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "AI_KEY_REQUIRED", settingsUrl: "/settings#gemini" });
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect((await POST(req(summaryBody("m0")))).status).toBe(200);
  });
  it("uses personal key on every fallback and redacts upstream bodies from responses", async () => {
    await saveGeminiKey("alice", key);
    fetchMock.mockImplementation(() => new Response(`secret provider body ${key}`, { status: 400 }));
    const response = await POST(req(summaryBody()));
    expect(response.status).toBe(422);
    const data = JSON.stringify(await response.json());
    expect(data).not.toContain(key); expect(data).not.toContain("secret provider body");
    expect(fetchMock.mock.calls.every(([, options]) => options.headers.Authorization === `Bearer ${key}`)).toBe(true);
    expect(await getAiAccountStatus("alice")).toMatchObject({ freeUsed: 0, freePending: 0 });
  });
  it("releases quota after upstream failure and refuses invalid modes", async () => {
    fetchMock.mockImplementation(() => new Response("not found", { status: 404 }));
    expect((await POST(req(summaryBody()))).status).toBe(503);
    expect(await getAiAccountStatus("alice")).toMatchObject({ freeUsed: 0, freePending: 0 });
    expect((await POST(req({ ...summaryBody(), mode: "bypass" }))).status).toBe(400);
  });
});
describe("key settings endpoint", () => {
  it("requires authentication for read, update and removal", async () => {
    expect((await GET(req(null, "", "GET"))).status).toBe(401);
    expect((await PUT(req({ apiKey: key, paidServiceConfirmed: true }, "", "PUT"))).status).toBe(401);
    expect((await DELETE(req({}, "", "DELETE"))).status).toBe(401);
  });
  it("validates with a fixed prompt, stores encrypted and returns suffix only", async () => {
    const response = await PUT(req({ apiKey: key, paidServiceConfirmed: true }, "alice", "PUT"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ hasKey: true, keySuffix: key.slice(-4) });
    expect(JSON.stringify(body)).not.toContain(key);
    expect(JSON.stringify(state.store.get("server_ai_keys/alice"))).not.toContain(key);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content).toBe("Reply OK.");
    expect((await GET(req(null, "bob", "GET"))).status).toBe(200);
    expect(await (await GET(req(null, "bob", "GET"))).json()).toMatchObject({ hasKey: false });
    expect((await DELETE(req({}, "alice", "DELETE"))).status).toBe(200);
    expect(await (await GET(req(null, "alice", "GET"))).json()).toMatchObject({ hasKey: false });
  });
  it("also accepts standard Google keys and rejects header-unsafe values", async () => {
    expect((await PUT(req({ apiKey: `AIza${"s".repeat(35)}`, paidServiceConfirmed: true }, "alice", "PUT"))).status).toBe(200);
    expect((await PUT(req({ apiKey: `AQ.${"s".repeat(40)}\r\nX-Header: bad`, paidServiceConfirmed: true }, "alice", "PUT"))).status).toBe(400);
  });
  it("invalid replacement never overwrites a working saved key", async () => {
    await saveGeminiKey("alice", key);
    expect((await PUT(req({ apiKey: "bad", paidServiceConfirmed: true }, "alice", "PUT"))).status).toBe(400);
    fetchMock.mockImplementation(() => new Response("credential body", { status: 403 }));
    expect((await PUT(req({ apiKey: `AIza${"b".repeat(35)}`, paidServiceConfirmed: true }, "alice", "PUT"))).status).toBe(422);
    expect(await getAiAccountStatus("alice")).toMatchObject({ keySuffix: key.slice(-4) });
  });
});
