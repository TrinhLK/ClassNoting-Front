import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { getAdminDb } from "./firebase-admin";
import { isValidAiSessionId } from "./ai-session";

import { aiQuotaStatus, effectiveAiQuota, FREE_MEETING_LIMIT, normalizeAiUsage } from "./ai-quota";
export { FREE_MEETING_LIMIT } from "./ai-quota";
export const AI_SETTINGS_URL = "/settings#gemini";
export class AiAccountError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

// These top-level collections are denied to client SDKs by the deployed default-deny
// Firestore rules. Never put credentials or quota under the client-writable users tree.
const keyRef = (uid: string) => getAdminDb().collection("server_ai_keys").doc(uid);
const policyRef = (uid: string) => getAdminDb().collection("server_ai_policies").doc(uid);
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
export async function getAiAccountStatus(uid: string) {
  // A non-reversible configuration tag lets operators identify the active system
  // credential without revealing a write-only deployment secret or its suffix.
  if (process.env.NODE_ENV === "production" && process.env.GOOGLE_AI_API_KEY) {
    console.info("[ai-account]", { event: "system_key_config", tag: createHash("sha256").update(process.env.GOOGLE_AI_API_KEY).digest("hex").slice(0, 12) });
  }
  const [key, usage, policy] = await Promise.all([keyRef(uid).get(), usageRef(uid).get(), policyRef(uid).get()]);
  const record = key.data();
  return { hasKey: !!record && !record.removed, keySuffix: record && !record.removed ? record.suffix : null,
    ...aiQuotaStatus(uid, usage.data(), policy.data()) };
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
  const meetingRef = ref.collection("meetings").doc(createHash("sha256").update(meetingId).digest("hex"));
  return getAdminDb().runTransaction(async tx => {
    const [snap, policy, meeting] = await Promise.all([tx.get(ref), tx.get(policyRef(uid)), tx.get(meetingRef)]);
    const ledger = normalizeAiUsage(snap.data());
    if (meeting.exists || ledger.legacyMeetingIds.includes(meetingId)) return false;
    if (Object.hasOwn(ledger.pending, meetingId)) throw new AiAccountError("AI_MEETING_BUSY", "Cuộc họp đang được tóm tắt. Vui lòng đợi kết quả.", 409);
    const quota = effectiveAiQuota(uid, policy.data());
    const pendingCount = Object.keys(ledger.pending).length;
    if (!quota.unlimited && ledger.usedCount + pendingCount >= quota.limit) {
      throw new AiAccountError("AI_KEY_REQUIRED", `Bạn đã dùng hoặc đang xử lý đủ ${quota.limit} cuộc họp được cấp. Hãy thêm Gemini API key riêng trong Thiết lập tài khoản để tóm tắt cuộc họp mới. Các cuộc họp đã tính lượt vẫn có thể tóm tắt lại.`, 402);
    }
    if (pendingCount >= 50) throw new AiAccountError("AI_MEETING_BUSY", "Đang có quá nhiều cuộc họp xử lý đồng thời. Vui lòng chờ.", 429);
    ledger.pending[meetingId] = { requestId, expiresAt: Date.now() + 12 * 60_000 };
    tx.set(ref, { ...snap.data(), ...ledger, schemaVersion: 2, updatedAt: Date.now() });
    return true;
  });
}
export async function finishFreeMeeting(uid: string, meetingId: string, requestId: string, success: boolean) {
  const ref = usageRef(uid);
  const meetingRef = ref.collection("meetings").doc(createHash("sha256").update(meetingId).digest("hex"));
  await getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const ledger = normalizeAiUsage(snap.data(), 0);
    if (ledger.pending[meetingId]?.requestId !== requestId) return;
    delete ledger.pending[meetingId];
    if (success) {
      ledger.usedCount += 1;
      tx.set(meetingRef, { usedAt: Date.now() });
    }
    tx.set(ref, { ...snap.data(), ...ledger, schemaVersion: 2, updatedAt: Date.now(), ...(success ? { lastAiAt: Date.now() } : {}) });
  });
}

export async function authorizeAiUsage(uid: string, scope: unknown, requestId: string) {
  const personalKey = await getGeminiKey(uid);
  if (personalKey) return { apiKey: personalKey, personal: true, finish: async (_success: boolean) => {} };
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new AiAccountError("AI_CONFIG", "AI hệ thống chưa được cấu hình. Bạn có thể thêm Gemini API key riêng.", 503);
  const scopes = Array.isArray(scope) ? scope : [scope];
  if (scopes.length < 1 || scopes.length > FREE_MEETING_LIMIT) {
    throw new AiAccountError("AI_KEY_REQUIRED", "Chọn tối đa 10 cuộc họp trong mỗi yêu cầu AI.", 402);
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
