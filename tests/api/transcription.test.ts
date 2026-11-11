import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), start: vi.fn(), owns: vi.fn(), status: vi.fn() }));
vi.mock("@/app/lib/extension-auth", () => ({ verifyExtensionAuth: mocks.auth }));
vi.mock("@/app/lib/rate-limit", () => ({ checkRateLimit: mocks.limit }));
vi.mock("@/app/lib/runpod-server", async importOriginal => ({
  ...await importOriginal<typeof import("@/app/lib/runpod-server")>(),
  startRunpodJob: mocks.start, ownsRunpodJob: mocks.owns, getRunpodJob: mocks.status,
}));
vi.mock("@/app/lib/firebase-admin", () => ({ getAdminDb: vi.fn() }));
import { GET, POST } from "@/app/api/transcription/route";
import { ownsAudioUrl } from "@/app/lib/runpod-server";
const audio = "https://firebasestorage.googleapis.com/v0/b/test-bucket/o/users%2Fu1%2Fuploads%2Ftest.wav?alt=media&token=test";
const post = (body: unknown) => new Request("https://app.test/api/transcription", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "test-bucket");
  mocks.auth.mockResolvedValue({ uid: "u1" });
  mocks.limit.mockReturnValue({ allowed: true });
  mocks.start.mockResolvedValue("job-1");
  mocks.owns.mockResolvedValue(true);
  mocks.status.mockResolvedValue({ status: "COMPLETED", output: {} });
});
describe("server-side transcription gateway", () => {
  it("rejects unauthenticated requests before calling RunPod", async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await POST(post({ audioUrl: audio }))).status).toBe(401);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("accepts owned Firebase audio and assigns the authenticated owner", async () => {
    const res = await POST(post({ audioUrl: audio, language: "en" }));
    expect(await res.json()).toEqual({ id: "job-1" });
    expect(mocks.start).toHaveBeenCalledWith("u1", audio, "en", undefined, false);
  });
  it.each(["http://127.0.0.1/audio.wav", "https://example.com/audio.wav", audio.replace("users%2Fu1", "users%2Fu2"), audio.replace("test-bucket", "other-bucket")])("rejects unowned or arbitrary audio URLs: %s", async url => {
    expect((await POST(post({ audioUrl: url }))).status).toBe(400);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("validates hybrid options", async () => {
    expect((await POST(post({ audioUrl: audio, diarization: "bad" }))).status).toBe(400);
  });
  it("enables enhancement only for a boolean opt-in on owned audio", async () => {
    expect((await POST(post({ audioUrl: audio, enhanceAudio: "true" }))).status).toBe(400);
    expect(mocks.start).not.toHaveBeenCalled();
    expect((await POST(post({ audioUrl: audio, enhanceAudio: true }))).status).toBe(200);
    expect(mocks.start).toHaveBeenCalledWith("u1", audio, "vi", undefined, true);
  });
  it("enforces submission rate limits", async () => {
    mocks.limit.mockReturnValue({ allowed: false });
    expect((await POST(post({ audioUrl: audio }))).status).toBe(429);
  });
  it("never returns a different user's job", async () => {
    mocks.owns.mockResolvedValue(false);
    expect((await GET(new Request("https://app.test/api/transcription?id=job-1"))).status).toBe(404);
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("returns the owned job status", async () => {
    const res = await GET(new Request("https://app.test/api/transcription?id=job-1"));
    expect(await res.json()).toEqual({ status: "COMPLETED", output: {} });
  });
  it("rejects traversal in object names", () => {
    expect(ownsAudioUrl(audio.replace("uploads%2Ftest.wav", "..%2Fu2%2Ftest.wav"), "u1")).toBe(false);
  });
});
