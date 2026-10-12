import { expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
const m = vi.hoisted(() => ({ auth: vi.fn(), where: vi.fn(), select: vi.fn(), get: vi.fn() }));
vi.mock("@/app/lib/extension-auth", () => ({ verifyExtensionAuth: m.auth }));
vi.mock("@/app/lib/firebase-admin", () => ({ getAdminDb: () => ({ collection: () => ({ where: m.where }) }) }));
import { GET } from "@/app/api/live/route";
beforeEach(() => {
  vi.clearAllMocks();
  m.where.mockReturnValue({ select: m.select });
  m.select.mockReturnValue({ get: m.get });
  m.auth.mockResolvedValue({ uid: "owner" });
});
it("lists only owner sessions using metadata projection, newest first", async () => {
  m.get.mockResolvedValue({ docs: [{ id: "old", data: () => ({ title: "Old", startedAt: 1 }) }, { id: "new", data: () => ({ title: "New", startedAt: 2 }) }] });
  const response = await GET(new Request("http://localhost/api/live?hostId=someone-else"));
  expect(m.where).toHaveBeenCalledWith("hostId", "==", "owner");
  expect(m.select).toHaveBeenCalledWith("title", "status", "startedAt", "summarizedAt");
  expect((await response.json()).sessions.map((s: { id: string }) => s.id)).toEqual(["new", "old"]);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("requires login to list sessions", async () => {
  m.auth.mockResolvedValue(NextResponse.json({}, { status: 401 }));
  expect((await GET(new Request("http://localhost/api/live"))).status).toBe(401);
  expect(m.get).not.toHaveBeenCalled();
});
