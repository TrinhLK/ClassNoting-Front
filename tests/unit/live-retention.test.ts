import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn() }));
vi.mock("@/app/lib/extension-auth", () => ({ verifyExtensionAuth: mocks.auth }));
vi.mock("@/app/lib/firebase-admin", () => ({ getAdminDb: () => ({ collection: () => ({ doc: () => "ref" }), runTransaction: (fn: Function) => fn(mocks) }) }));
vi.mock("@/app/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({ doc: () => "ref", setDoc: mocks.setDoc, updateDoc: mocks.updateDoc, deleteField: () => "DELETE", onSnapshot: vi.fn() }));
import { GET, DELETE } from "@/app/api/live/[id]/route";
import { createLiveSession, endLiveSession } from "@/app/lib/db/liveSessionDb";
const ctx = { params: Promise.resolve({ id: "live-test" }) };
const req = new Request("http://localhost/api/live/live-test");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ uid: "owner" });
  mocks.get.mockResolvedValue({ exists: true, id: "live-test", data: () => ({ hostId: "owner", status: "ended", expireAt: new Date(0), segments: [] }) });
});
it("keeps ended sessions publicly available and removes legacy TTL", async () => {
  mocks.auth.mockResolvedValue(NextResponse.json({}, { status: 401 }));
  const response = await GET(req, ctx);
  expect(response.status).toBe(200);
  expect((await response.json()).status).toBe("ended");
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
});
it("only deletes on explicit owner request", async () => {
  expect((await DELETE(req, ctx)).status).toBe(200);
  expect(mocks.delete).toHaveBeenCalledWith("ref");
});
it("rejects deletion by another account", async () => {
  mocks.auth.mockResolvedValue({ uid: "other" });
  expect((await DELETE(req, ctx)).status).toBe(403);
  expect(mocks.delete).not.toHaveBeenCalled();
});
it("requires authentication", async () => {
  mocks.auth.mockResolvedValue(NextResponse.json({}, { status: 401 }));
  expect((await DELETE(req, ctx)).status).toBe(401);
  expect(mocks.get).not.toHaveBeenCalled();
});
it("does not recreate deleted sessions", async () => {
  mocks.get.mockResolvedValue({ exists: false });
  expect((await GET(req, ctx)).status).toBe(404);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("creates without expiry and ending only changes status and removes expiry", async () => {
  await createLiveSession({ id: "live-test", hostId: "owner", title: "Test", segments: [], summary: "", status: "live", startedAt: 1 });
  expect(mocks.setDoc.mock.calls[0][1]).not.toHaveProperty("expireAt");
  await endLiveSession("live-test");
  expect(mocks.updateDoc).toHaveBeenCalledWith("ref", { status: "ended", expireAt: "DELETE" });
});

it("allows another account to view without granting deletion rights", async () => {
  mocks.auth.mockResolvedValue({ uid: "other" });
  expect((await GET(req, ctx)).status).toBe(200);
  expect(mocks.auth).not.toHaveBeenCalled();
  expect((await DELETE(req, ctx)).status).toBe(403);
});
it("returns only viewer fields", async () => {
  mocks.get.mockResolvedValue({ exists: true, id: "live-test", data: () => ({ hostId: "owner", status: "live", internalSecret: "private", expireAt: new Date(0) }) });
  const body = await (await GET(req, ctx)).json();
  expect(body).not.toHaveProperty("internalSecret");
  expect(body).not.toHaveProperty("expireAt");
});
