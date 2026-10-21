import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryFirestore } from "@/tests/helpers/admin-firestore";
import { SYSTEM_ADMIN_EMAIL, SYSTEM_ADMIN_UID } from "@/app/lib/admin-identity";

const state = vi.hoisted(() => ({ store: new Map<string, any>(), db: null as any, users: new Map<string, any>(), verify: vi.fn(), getUser: vi.fn(), listUsers: vi.fn() }));
vi.mock("@/app/lib/firebase-admin", () => ({ getAdminDb: () => state.db, getAdminAuth: () => ({ verifyIdToken: state.verify, getUser: state.getUser, listUsers: state.listUsers, getUserByEmail: async (email: string) => {
  const user = [...state.users.values()].find(u => u.email === email);
  if (!user) throw Object.assign(new Error("Not found"), { code: "auth/user-not-found" }); return user;
} }) }));
vi.mock("@/app/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
import { GET } from "@/app/api/admin/accounts/route";
import { PATCH } from "@/app/api/admin/accounts/[uid]/quota/route";
import { POST as activity } from "@/app/api/account/activity/route";
import { getAiAccountStatus, reserveFreeMeeting, finishFreeMeeting } from "@/app/lib/ai-account";
const req = (token = "root", method = "GET", body?: any, query = "") => new Request(`https://smart-noting.vercel.app/api/admin/accounts${query}`, {
  method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
});
const change = (body: any, token = "root", uid = "normal") => PATCH(req(token, "PATCH", body), { params: Promise.resolve({ uid }) });
const user = (uid: string, email: string, extra: any = {}) => ({ uid, email, emailVerified: true, disabled: false, displayName: uid,
  providerData: [{ providerId: "google.com" }], metadata: { creationTime: new Date().toUTCString(), lastSignInTime: new Date().toUTCString() }, ...extra });

beforeEach(() => {
  vi.clearAllMocks(); state.store.clear(); state.users.clear();
  state.db = memoryFirestore(state.store);
  state.db.getAll = vi.fn(async (...args: any[]) => {
    const mask = args.at(-1)?.fieldMask;
    const refs = args.filter(a => a.path);
    return Promise.all(refs.map(async ref => { const snap = await ref.get(); return { ...snap, data: () => {
      const data = snap.data(); return !data || !mask ? data : Object.fromEntries(mask.filter((k: string) => k in data).map((k: string) => [k, data[k]]));
    } }; }));
  });
  state.users.set(SYSTEM_ADMIN_UID, user(SYSTEM_ADMIN_UID, SYSTEM_ADMIN_EMAIL));
  state.users.set("normal", user("normal", "user@example.com"));
  state.users.set("disabled", user("disabled", "disabled@example.com", { disabled: true }));
  state.getUser.mockImplementation(async uid => { const u = state.users.get(uid); if (!u) throw Object.assign(new Error("Not found"), { code: "auth/user-not-found" }); return u; });
  state.listUsers.mockImplementation(async () => ({ users: [...state.users.values()] }));
  state.verify.mockImplementation(async token => {
    if (token === "revoked") throw new Error("revoked");
    const uid = token === "root" ? SYSTEM_ADMIN_UID : "normal";
    return { uid, email: token === "spoof-email" || token === "root" ? SYSTEM_ADMIN_EMAIL : "user@example.com", email_verified: token !== "unverified" };
  });
});
describe("root administrator boundary", () => {
  it.each([["", 401], ["normal", 403], ["spoof-email", 403], ["unverified", 403], ["revoked", 401]])("denies %s on listing and quota writes", async (token, status) => {
    expect((await GET(req(String(token)))).status).toBe(status);
    expect((await change({ action: "add", amount: 10 }, String(token))).status).toBe(status);
    expect(state.store.size).toBe(0); expect(state.listUsers).not.toHaveBeenCalled();
  });
  it.each([{ disabled: true }, { emailVerified: false }, { email: "changed@example.com" }, { providerData: [{ providerId: "password" }] }])("checks current Auth state %j", async extra => {
    state.users.set(SYSTEM_ADMIN_UID, user(SYSTEM_ADMIN_UID, SYSTEM_ADMIN_EMAIL, extra));
    expect((await GET(req())).status).toBe(403);
    expect(state.verify).toHaveBeenCalledWith("root", true);
  });
  it("lists operational metadata without keys or meeting content", async () => {
    state.store.set("server_ai_keys/normal", { ciphertext: "TOP-SECRET-CIPHERTEXT", suffix: "abcd" });
    state.store.set("server_ai_usage/normal", { meetings: { m1: { state: "used", requestId: "r", expiresAt: 0 } } });
    const response = await GET(req()); expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.accounts).toHaveLength(3);
    const normal = data.accounts.find((u: any) => u.uid === "normal");
    expect(normal).toMatchObject({ email: "user@example.com", freeUsed: 1, freeLimit: 10, hasPersonalKey: true });
    expect(JSON.stringify(data)).not.toContain("TOP-SECRET"); expect(JSON.stringify(data)).not.toContain("abcd");
    expect(data.accounts.find((u: any) => u.uid === SYSTEM_ADMIN_UID)).toMatchObject({ unlimited: true, freeLimit: null });
    expect(state.db.getAll.mock.calls.some((args: any[]) => JSON.stringify(args.at(-1)) === '{"fieldMask":["removed"]}')).toBe(true);
  });
});
describe("quota grants and audit", () => {
  it("adds grants atomically without changing existing usage and audits both changes", async () => {
    await reserveFreeMeeting("normal", "m1", "r"); await finishFreeMeeting("normal", "m1", "r", true);
    const results = await Promise.all([change({ action: "add", amount: 5 }), change({ action: "add", amount: 7 })]);
    expect(results.every(r => r.status === 200)).toBe(true);
    expect(await getAiAccountStatus("normal")).toMatchObject({ freeLimit: 22, freeUsed: 1, freeRemaining: 21 });
    const audits = [...state.store.entries()].filter(([key]) => key.startsWith("server_admin_audit/"));
    expect(audits).toHaveLength(2);
    expect(audits.every(([, record]) => record.adminUid === SYSTEM_ADMIN_UID && record.targetUid === "normal")).toBe(true);
  });
  it("enables unlimited and can restore the finite grant without resetting usage", async () => {
    expect((await change({ action: "unlimited", unlimited: true })).status).toBe(200);
    for (let i = 0; i < 12; i++) { await reserveFreeMeeting("normal", `m${i}`, `r${i}`); await finishFreeMeeting("normal", `m${i}`, `r${i}`, true); }
    expect(await getAiAccountStatus("normal")).toMatchObject({ unlimited: true, freeLimit: null, freeUsed: 12, freeRemaining: null });
    expect((await change({ action: "unlimited", unlimited: false })).status).toBe(200);
    expect(await getAiAccountStatus("normal")).toMatchObject({ unlimited: false, freeLimit: 10, freeUsed: 12, freeRemaining: 0 });
    await expect(reserveFreeMeeting("normal", "new", "r-new")).rejects.toMatchObject({ status: 402 });
    expect(await reserveFreeMeeting("normal", "m0", "retry")).toBe(false);
  });
  it("migrates an exhausted legacy ledger after a grant and preserves old meeting retries", async () => {
    state.store.set("server_ai_usage/normal", { meetings: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`old-${i}`, { state: "used", requestId: `r-${i}`, expiresAt: 0 }])) });
    await expect(reserveFreeMeeting("normal", "new", "new-r")).rejects.toMatchObject({ status: 402 });
    expect((await change({ action: "add", amount: 5 })).status).toBe(200);
    await reserveFreeMeeting("normal", "new", "new-r"); await finishFreeMeeting("normal", "new", "new-r", true);
    expect(await getAiAccountStatus("normal")).toMatchObject({ freeUsed: 11, freeLimit: 15, freeRemaining: 4 });
    expect(await reserveFreeMeeting("normal", "old-0", "retry")).toBe(false);
    expect(await reserveFreeMeeting("normal", "new", "retry")).toBe(false);
  });
  it("unlimited usage stores meeting receipts separately instead of growing a single Firestore document", async () => {
    await change({ action: "unlimited", unlimited: true });
    for (let i = 0; i < 60; i++) { await reserveFreeMeeting("normal", `m-${i}`, `r-${i}`); await finishFreeMeeting("normal", `m-${i}`, `r-${i}`, true); }
    const summary = state.store.get("server_ai_usage/normal");
    expect(summary.usedCount).toBe(60);
    expect(JSON.stringify(summary).length).toBeLessThan(2000);
    expect([...state.store.keys()].filter(k => k.startsWith("server_ai_usage/normal/meetings/"))).toHaveLength(60);
  });
  it.each([{ action: "add", amount: -1 }, { action: "add", amount: 0 }, { action: "add", amount: 1.5 }, { action: "add", amount: "10" }, { action: "unlimited", unlimited: "true" }, { action: "make-admin" }])("rejects invalid action %j", async body => {
    expect((await change(body)).status).toBe(400); expect(state.store.size).toBe(0);
  });
  it("rejects disabled, missing and root targets", async () => {
    expect((await change({ action: "add", amount: 5 }, "root", "disabled")).status).toBe(409);
    expect((await change({ action: "add", amount: 5 }, "root", "missing")).status).toBe(404);
    expect((await change({ action: "add", amount: 5 }, "root", SYSTEM_ADMIN_UID)).status).toBe(400);
    expect(state.store.size).toBe(0);
  });
});
it("activity is recorded for token UID, throttled and never for a client-supplied UID", async () => {
  expect((await activity(req("", "POST"))).status).toBe(401);
  expect((await activity(req("normal", "POST", { uid: SYSTEM_ADMIN_UID, lastSeenAt: 99999999999999 }))).status).toBe(204);
  const value = state.store.get("server_account_activity/normal"); expect(value.lastSeenAt).toBeLessThanOrEqual(Date.now());
  expect(state.store.has(`server_account_activity/${SYSTEM_ADMIN_UID}`)).toBe(false);
  await activity(req("normal", "POST")); expect(state.store.get("server_account_activity/normal")).toEqual(value);
});
