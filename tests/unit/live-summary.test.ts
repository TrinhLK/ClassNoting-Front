import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const m = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn(), generate: vi.fn(), update: vi.fn(), current: vi.fn() }));
vi.mock("@/app/lib/extension-auth", () => ({ verifyExtensionAuth: m.auth }));
vi.mock("@/app/api/gemini/route", () => ({ POST: m.generate }));
vi.mock("@/app/lib/firebase-admin", () => ({ getAdminDb: () => ({ collection: () => ({ doc: () => ({ get: m.get }) }), runTransaction: (fn: Function) => fn({ get: m.current, update: m.update }) }) }));
import { POST } from "@/app/api/live/[id]/summarize/route";
const request = () => POST(new Request("http://localhost/api/live/live-test/summarize", { method: "POST" }), { params: Promise.resolve({ id: "live-test" }) });
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ uid: "owner" });
  m.get.mockResolvedValue({ exists: true, data: () => ({ hostId: "owner", startedAt: 1, segments: [{ start: 0, end: 10, text: "Nội dung đầu", speakerId: "A" }, { start: 10, end: 20, text: "Nội dung cuối", speakerId: "B" }] }) });
  m.current.mockResolvedValue({ exists: true, data: () => ({ hostId: "owner" }) });
  m.generate.mockResolvedValue(NextResponse.json({ summary: "## Biên bản\n- Nội dung" }));
});
it("summarizes all stored transcript and preserves live insights", async () => {
  expect((await request()).status).toBe(200);
  const body = await m.generate.mock.calls[0][0].json();
  expect(body.mode).toBe("full");
  expect(body.text).toContain("Nội dung đầu");
  expect(body.text).toContain("Nội dung cuối");
  expect(m.update.mock.calls[0][1].fullSummary).toContain("Biên bản");
  expect(m.update.mock.calls[0][1]).not.toHaveProperty("summary");
});
it("requires login", async () => {
  m.auth.mockResolvedValue(NextResponse.json({}, { status: 401 }));
  expect((await request()).status).toBe(401);
  expect(m.generate).not.toHaveBeenCalled();
});
it("rejects other accounts", async () => {
  m.auth.mockResolvedValue({ uid: "other" });
  expect((await request()).status).toBe(403);
  expect(m.generate).not.toHaveBeenCalled();
});
it("rejects empty transcript", async () => {
  m.get.mockResolvedValue({ exists: true, data: () => ({ hostId: "owner", segments: [] }) });
  expect((await request()).status).toBe(400);
  expect(m.generate).not.toHaveBeenCalled();
});
it("does not resurrect a session deleted during generation", async () => {
  m.current.mockResolvedValue({ exists: false });
  expect((await request()).status).toBe(404);
  expect(m.update).not.toHaveBeenCalled();
});
it("keeps prior summary when AI fails", async () => {
  m.generate.mockResolvedValue(NextResponse.json({ error: "Busy" }, { status: 503 }));
  expect((await request()).status).toBe(503);
  expect(m.update).not.toHaveBeenCalled();
});
