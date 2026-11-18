import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn(), history: vi.fn() }));
vi.mock("@/app/lib/extension-auth", () => ({ verifyExtensionAuth: mocks.auth }));
vi.mock("@/app/lib/ext-sessions", () => ({ getExtSession: mocks.session, loadExtHistory: mocks.history }));
import { GET } from "@/app/api/extension/recording/route";
const request = () => new Request("https://noting.io.vn/api/extension/recording?sessionId=s1");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({uid:"owner"});
  mocks.session.mockResolvedValue({id:"s1",ownerUid:"owner"});
  mocks.history.mockResolvedValue({title:"Meet",participants:[{id:"one",name:"An"}],chatMessages:[{id:"c1",sender:"An",text:"Hello"}],attendanceObservations:[]});
});
it("returns only the owner's meeting metadata, including archived chat", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({participants:[{id:"one",name:"An"}],chatMessages:[{id:"c1"}]});
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("does not load another account's chat or participants", async () => {
  mocks.auth.mockResolvedValue({uid:"someone-else"});
  expect((await GET(request())).status).toBe(404);
  expect(mocks.history).not.toHaveBeenCalled();
});
it("rejects unauthenticated callers", async () => {
  mocks.auth.mockResolvedValue(NextResponse.json({error:"Unauthorized"},{status:401}));
  expect((await GET(request())).status).toBe(401);
  expect(mocks.session).not.toHaveBeenCalled();
});
