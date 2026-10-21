import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { getAdminDb } from "./firebase-admin";
import { isValidAiSessionId } from "./ai-session";

export const FREE_MEETING_LIMIT = 10;
export const AI_SETTINGS_URL = "/settings#gemini";
export class AiAccountError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

// These top-level collections are denied to client SDKs by the deployed default-deny
// Firestore rules. Never put credentials or quota under the client-writable users tree.
const keyRef = (uid: string) => getAdminDb().collection("server_ai_keys").doc(uid);
const usageRef = (uid: string) => getAdminDb().collection("server_ai_usage").doc(uid);
function encryptionKey() {
  const secret = process.env.GEMINI_KEY_ENCRYPTION_SECRET
    || JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}").private_key;
  if (!secret || secret.length < 32) throw new AiAccountError("AI_CONFIG", "Chưa cấu hình lưu key an toàn.", 503);
  return Buffer.from(hkdfSync("sha256", secret, "smart-noting", "gemini-user-key-v1", 32));
}
export function encryptGeminiKey(uid: string, value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(uid));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: encrypted.toString("base64") };
}
export function decryptGeminiKey(uid: string, record: Record<string, any>) {
  if (record.version !== 1) throw new Error("Unsupported credential version");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(record.iv, "base64"));
  decipher.setAAD(Buffer.from(uid));
  decipher.setAuthTag(Buffer.from(record.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
export async function saveGeminiKey(uid: string, key: string) {
  await keyRef(uid).set({ ...encryptGeminiKey(uid, key), suffix: key.slice(-4), paidServiceConfirmed: true, updatedAt: Date.now() });
}
export async function removeGeminiKey(uid: string) {
  // Clear credential only; never reset the free-meeting ledger.
  await keyRef(uid).set({ removed: true, updatedAt: Date.now() });
}
export async function getGeminiKey(uid: string): Promise<string | null> {
  const snap = await keyRef(uid).get();
  const record = snap.data();
  return !record || record.removed ? null : decryptGeminiKey(uid, record);
}
type Entry = { state: "used" | "pending"; requestId: string; expiresAt: number };
type Ledger = Record<string, Entry>;
const activeLedger = (data: any, now = Date.now()): Ledger => Object.fromEntries(
  Object.entries((data?.meetings || {}) as Ledger).filter(([, entry]) => entry.state === "used" || entry.expiresAt > now)
);
export async function getAiAccountStatus(uid: string) {
  // A non-reversible configuration tag lets operators identify the active system
  // credential without revealing a write-only deployment secret or its suffix.
  if (process.env.NODE_ENV === "production" && process.env.GOOGLE_AI_API_KEY) {
    console.info("[ai-account]", { event: "system_key_config", tag: createHash("sha256").update(process.env.GOOGLE_AI_API_KEY).digest("hex").slice(0, 12) });
  }
  const [key, usage] = await Promise.all([keyRef(uid).get(), usageRef(uid).get()]);
  const record = key.data();
  const meetings = Object.values(activeLedger(usage.data()));
  const used = meetings.filter(entry => entry.state === "used").length;
  const pending = meetings.length - used;
  return { hasKey: !!record && !record.removed, keySuffix: record && !record.removed ? record.suffix : null,
    freeLimit: FREE_MEETING_LIMIT, freeUsed: used, freePending: pending, freeRemaining: Math.max(0, FREE_MEETING_LIMIT - used - pending) };
}

export type AiMeetingScope = { kind: "meeting" | "live" | "extension"; id: string };
export async function canonicalAiMeeting(uid: string, input: unknown): Promise<string> {
  const scope = input as AiMeetingScope | undefined;
  if (!scope || !["meeting", "live", "extension"].includes(scope.kind) || !isValidAiSessionId(scope.id)) {
    throw new AiAccountError("AI_MEETING_REQUIRED", "Cần chọn cuộc họp hợp lệ để dùng lượt tóm tắt miễn phí.");
  }
  const collection = scope.kind === "meeting" ? "meetings" : scope.kind === "live" ? "live_sessions" : "ext_sessions";
  const snap = await getAdminDb().collection(collection).doc(scope.id).get();
  const data = snap.data();
  const owner = scope.kind === "meeting" ? data?.userId : scope.kind === "live" ? data?.hostId : data?.ownerUid;
  if (!data || owner !== uid) throw new AiAccountError("AI_MEETING_FORBIDDEN", "Không có quyền dùng AI cho cuộc họp này.", 403);
  const id = scope.kind === "extension" ? data.meetingId || `ext_${scope.id}` : scope.id;
  if (!isValidAiSessionId(id)) throw new AiAccountError("AI_MEETING_REQUIRED", "ID cuộc họp không hợp lệ.");
  return id;
}

export async function reserveFreeMeeting(uid: string, meetingId: string, requestId: string) {
  const ref = usageRef(uid);
  return getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const ledger = activeLedger(snap.data());
    if (ledger[meetingId]?.state === "used") return false;
    if (ledger[meetingId]) throw new AiAccountError("AI_MEETING_BUSY", "Cuộc họp đang được tóm tắt. Vui lòng đợi kết quả.", 409);
    if (Object.keys(ledger).length >= FREE_MEETING_LIMIT) {
      throw new AiAccountError("AI_KEY_REQUIRED", "Bạn đã dùng hoặc đang xử lý đủ 10 cuộc họp miễn phí. Hãy thêm Gemini API key riêng trong Thiết lập tài khoản để tóm tắt cuộc họp mới. Các cuộc họp đã tính lượt vẫn có thể tóm tắt lại.", 402);
    }
    ledger[meetingId] = { state: "pending", requestId, expiresAt: Date.now() + 12 * 60_000 };
    tx.set(ref, { meetings: ledger, updatedAt: Date.now() });
    return true;
  });
}
export async function finishFreeMeeting(uid: string, meetingId: string, requestId: string, success: boolean) {
  const ref = usageRef(uid);
  await getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const ledger = (snap.data()?.meetings || {}) as Ledger;
    if (ledger[meetingId]?.state !== "pending" || ledger[meetingId].requestId !== requestId) return;
    if (success) ledger[meetingId] = { state: "used", requestId, expiresAt: 0 };
    else delete ledger[meetingId];
    tx.set(ref, { meetings: ledger, updatedAt: Date.now() });
  });
}

export async function authorizeAiUsage(uid: string, scope: unknown, requestId: string) {
  const personalKey = await getGeminiKey(uid);
  if (personalKey) return { apiKey: personalKey, personal: true, finish: async (_success: boolean) => {} };
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new AiAccountError("AI_CONFIG", "AI hệ thống chưa được cấu hình. Bạn có thể thêm Gemini API key riêng.", 503);
  const scopes = Array.isArray(scope) ? scope : [scope];
  if (scopes.length < 1 || scopes.length > FREE_MEETING_LIMIT) {
    throw new AiAccountError("AI_KEY_REQUIRED", "Hãy thêm Gemini API key riêng hoặc chọn tối đa 10 cuộc họp.", 402);
  }
  const meetingIds = [...new Set(await Promise.all(scopes.map(item => canonicalAiMeeting(uid, item))))];
  const reserved: string[] = [];
  try {
    for (const id of meetingIds) if (await reserveFreeMeeting(uid, id, requestId)) reserved.push(id);
  } catch (error) {
    await Promise.all(reserved.map(id => finishFreeMeeting(uid, id, requestId, false)));
    throw error;
  }
  return { apiKey, personal: false, finish: async (success: boolean) => {
    await Promise.all(reserved.map(id => finishFreeMeeting(uid, id, requestId, success)));
  } };
}
