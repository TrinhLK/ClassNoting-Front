import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryFirestore } from "@/tests/helpers/admin-firestore";

const state = vi.hoisted(() => ({ store: new Map<string, any>(), db: null as any }));
vi.mock("@/app/lib/firebase-admin", () => ({ getAdminDb: () => state.db }));
import { authorizeAiUsage, canonicalAiMeeting, decryptGeminiKey, encryptGeminiKey, finishFreeMeeting, getAiAccountStatus, getGeminiKey, removeGeminiKey, reserveFreeMeeting, saveGeminiKey } from "@/app/lib/ai-account";

beforeEach(() => {
  state.store.clear(); state.db = memoryFirestore(state.store);
  process.env.GEMINI_KEY_ENCRYPTION_SECRET = "unit-test-encryption-secret-over-32-characters";
  process.env.GOOGLE_AI_API_KEY = "system-key";
});
describe("personal Gemini keys", () => {
  it("encrypts with authenticated random IVs and binds ciphertext to the account", () => {
    const a = encryptGeminiKey("alice", "secret-key");
    const b = encryptGeminiKey("alice", "secret-key");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(JSON.stringify(a)).not.toContain("secret-key");
    expect(decryptGeminiKey("alice", a)).toBe("secret-key");
    expect(() => decryptGeminiKey("bob", a)).toThrow();
    expect(() => decryptGeminiKey("alice", { ...a, tag: Buffer.alloc(16).toString("base64") })).toThrow();
  });
  it("selects only the caller's key, does not debit free quota, does not fall back", async () => {
    await saveGeminiKey("alice", "alice-secret-1234");
    await saveGeminiKey("bob", "bob-secret-5678");
    const access = await authorizeAiUsage("alice", undefined, "r1");
    expect(access.apiKey).toBe("alice-secret-1234");
    await access.finish(false);
    expect(await getGeminiKey("alice")).toBe("alice-secret-1234");
    expect(await getAiAccountStatus("alice")).toMatchObject({ hasKey: true, keySuffix: "1234", freeUsed: 0 });
    expect(JSON.stringify(await getAiAccountStatus("alice"))).not.toContain("alice-secret");
    expect(state.store.has("server_ai_usage/alice")).toBe(false);
  });
  it("removing/replacing a key never resets the free ledger", async () => {
    await reserveFreeMeeting("alice", "meeting-1", "r1");
    await finishFreeMeeting("alice", "meeting-1", "r1", true);
    await saveGeminiKey("alice", "some-secret-1234");
    await removeGeminiKey("alice");
    expect(await getGeminiKey("alice")).toBe(null);
    expect(await getAiAccountStatus("alice")).toMatchObject({ hasKey: false, keySuffix: null, freeUsed: 1 });
  });
});
describe("ten distinct free meetings", () => {
  it("atomically admits at most ten concurrent new meetings", async () => {
    const results = await Promise.allSettled(Array.from({ length: 11 }, (_, i) => reserveFreeMeeting("alice", `m-${i}`, `r-${i}`)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(10);
    const failure = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ code: "AI_KEY_REQUIRED", status: 402 });
    expect(await getAiAccountStatus("alice")).toMatchObject({ freeUsed: 0, freePending: 10, freeRemaining: 0 });
  });
  it("retries any of the original ten without further debit, even after exhaustion", async () => {
    for (let i = 0; i < 10; i++) {
      await reserveFreeMeeting("alice", `m-${i}`, `r-${i}`);
      await finishFreeMeeting("alice", `m-${i}`, `r-${i}`, true);
    }
    for (let i = 0; i < 5; i++) expect(await reserveFreeMeeting("alice", "m-0", `retry-${i}`)).toBe(false);
    await expect(reserveFreeMeeting("alice", "new", "r")).rejects.toMatchObject({ code: "AI_KEY_REQUIRED" });
    expect(await getAiAccountStatus("alice")).toMatchObject({ freeUsed: 10, freeRemaining: 0 });
    expect(await reserveFreeMeeting("bob", "new", "r")).toBe(true);
  });
  it("releases failed reservations; stale completions cannot charge a newer request", async () => {
    await reserveFreeMeeting("alice", "m", "failed");
    await expect(reserveFreeMeeting("alice", "m", "parallel")).rejects.toMatchObject({ status: 409 });
    await finishFreeMeeting("alice", "m", "failed", false);
    expect(await getAiAccountStatus("alice")).toMatchObject({ freeUsed: 0, freePending: 0 });
    await reserveFreeMeeting("alice", "m", "new");
    await finishFreeMeeting("alice", "m", "failed", true);
    expect(await getAiAccountStatus("alice")).toMatchObject({ freeUsed: 0, freePending: 1 });
    await finishFreeMeeting("alice", "m", "new", true);
    expect(await getAiAccountStatus("alice")).toMatchObject({ freeUsed: 1 });
  });
  it("expires abandoned leases without expiring successfully used meetings", async () => {
    state.store.set("server_ai_usage/alice", { meetings: { old: { state: "pending", expiresAt: Date.now() - 1 }, used: { state: "used", expiresAt: 0 } } });
    expect(await getAiAccountStatus("alice")).toMatchObject({ freeUsed: 1, freePending: 0, freeRemaining: 9 });
  });
  it("maps extension live and final summary to the same meeting, and verifies ownership", async () => {
    state.store.set("ext_sessions/session-1", { ownerUid: "alice" });
    state.store.set("meetings/ext_session-1", { userId: "alice" });
    expect(await canonicalAiMeeting("alice", { kind: "extension", id: "session-1" })).toBe("ext_session-1");
    expect(await canonicalAiMeeting("alice", { kind: "meeting", id: "ext_session-1" })).toBe("ext_session-1");
    await expect(canonicalAiMeeting("bob", { kind: "extension", id: "session-1" })).rejects.toMatchObject({ status: 403 });
    await expect(canonicalAiMeeting("alice", { kind: "meeting", id: "../bad" })).rejects.toMatchObject({ status: 400 });
    await expect(canonicalAiMeeting("alice", undefined)).rejects.toMatchObject({ code: "AI_MEETING_REQUIRED" });
  });
  it("refunds a multi-meeting request when any reservation cannot fit", async () => {
    for (let i = 0; i < 9; i++) { await reserveFreeMeeting("alice", `m${i}`, `r${i}`); await finishFreeMeeting("alice", `m${i}`, `r${i}`, true); }
    state.store.set("meetings/a", { userId: "alice" }); state.store.set("meetings/b", { userId: "alice" });
    await expect(authorizeAiUsage("alice", [{ kind: "meeting", id: "a" }, { kind: "meeting", id: "b" }], "multi")).rejects.toMatchObject({ code: "AI_KEY_REQUIRED" });
    expect(await getAiAccountStatus("alice")).toMatchObject({ freeUsed: 9, freePending: 0, freeRemaining: 1 });
  });
});
