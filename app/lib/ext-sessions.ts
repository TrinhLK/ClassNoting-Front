import { getAdminDb } from "@/app/lib/firebase-admin";
import type { ChatMessage, MeetingParticipant } from "@/app/lib/db";
import type { MeetingProvider } from "@/app/lib/meeting-links";

export type ExtSessionStatus = "live" | "ended";

/** Một dòng transcript live đã gán tên người nói (từ extension). */
export interface ExtLiveSegment {
  id: string;
  speaker: string;
  text: string;
  start: number;
  end: number;
  uncertain?: boolean;
}

export interface ExtSession {
  id: string;
  ownerUid: string;
  meetingUrl: string;
  provider: MeetingProvider;
  title: string;
  status: ExtSessionStatus;
  startedAt: number;
  updatedAt: number;
  participants: MeetingParticipant[];
  chatMessages: ChatMessage[];
  liveSegments: ExtLiveSegment[];
  /** Đường dẫn các chunk audio đã upload (Storage), để ghép khi end. */
  audioManifest: string[];
  meetingId?: string;
}

const COLLECTION = "ext_sessions";
export const EXT_MAX_CHAT = 500;
export const EXT_MAX_SEGMENTS = 2000;

/**
 * Chuẩn hóa URL họp để so khớp/gộp phiên.
 * Chỉ strip query/hash/trailing-slash (an toàn cho Google Meet;
 * KHÔNG dùng cho link cần query như Zoom — ngoài phạm vi sản phẩm).
 */
export function normalizeMeetingUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .split("#")[0]
    .split("?")[0]
    .replace(/\/+$/, "")
    .toLowerCase();
}

/** Khóa ngày local (YYYY-MM-DD) — bot + extension cùng ngày họp thì gộp chung biên bản. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function hash36(s: string): string {
  return shortHash(s);
}

/**
 * ID biên bản chung cho luồng kép bot + extension:
 * cùng user + cùng link Meet + cùng ngày → cùng ID, hai luồng gộp vào 1 doc
 * thay vì tạo 2 biên bản rời rạc.
 * Lưu ý: link Meet tái dùng vào ngày khác nhau → biên bản khác nhau (đúng ý).
 */
export function meetingIdFor(
  ownerUid: string,
  meetingUrl: string,
  at: number = Date.now()
): string {
  return `m_${hash36(`${ownerUid}|${normalizeMeetingUrl(meetingUrl)}|${dayKey(at)}`)}`;
}

const db = () => getAdminDb();

export async function createExtSession(
  data: Pick<ExtSession, "ownerUid" | "meetingUrl" | "provider" | "title">
): Promise<ExtSession> {
  const now = Date.now();
  const ref = db().collection(COLLECTION).doc();
  const session: ExtSession = {
    id: ref.id,
    ...data,
    status: "live",
    startedAt: now,
    updatedAt: now,
    participants: [],
    chatMessages: [],
    liveSegments: [],
    audioManifest: [],
  };
  await ref.set(session);
  return session;
}

export async function getExtSession(id: string): Promise<ExtSession | null> {
  const snap = await db().collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as ExtSession;
}

/**
 * Tạo session với ID xác định theo (user, link chuẩn hóa, ngày).
 * Hai request đua nhau (nháy đúp nút Bắt đầu) thì một thắng qua `create()`,
 * bên thua bắt ALREADY_EXISTS và nhận lại session cũ — hết phiên trùng vĩnh viễn.
 * Link đã end trước đó trong ngày → tạo id hậu tố mới để phiên mới không đè phiên cũ.
 */
export async function getOrCreateLiveSession(
  data: Pick<ExtSession, "ownerUid" | "meetingUrl" | "provider" | "title">
): Promise<{ session: ExtSession; reused: boolean }> {
  const now = Date.now();
  const base = {
    ...data,
    status: "live" as ExtSessionStatus,
    startedAt: now,
    updatedAt: now,
    participants: [],
    chatMessages: [],
    liveSegments: [],
    audioManifest: [],
  };
  const canonicalId = `ext_${shortHash(
    `${data.ownerUid}|${normalizeMeetingUrl(data.meetingUrl)}|${dayKey(now)}`
  )}`;
  const col = db().collection(COLLECTION);
  const fresh: ExtSession = { ...base, id: canonicalId };
  try {
    await col.doc(canonicalId).create(fresh);
    return { session: fresh, reused: false };
  } catch (e: unknown) {
    const code = (e as { code?: number }).code;
    const msg = e instanceof Error ? e.message : String(e);
    if (code !== 6 && !/already[-\s]?exists/i.test(msg)) throw e;
    const snap = await col.doc(canonicalId).get();
    if (snap.exists) {
      const s = snap.data() as ExtSession;
      if (s.status === "live") return { session: s, reused: true };
    }
    // Doc cũ đã ended trong ngày → phiên mới dùng id hậu tố.
    const ref = col.doc();
    const session: ExtSession = { ...base, id: ref.id };
    await ref.set(session);
    return { session, reused: false };
  }
}

/** Tìm session live trùng (cùng user + cùng meetingUrl) để tránh tạo trùng khi auto-start. */
export async function findLiveSession(
  ownerUid: string,
  meetingUrl: string
): Promise<ExtSession | null> {
  const snap = await db()
    .collection(COLLECTION)
    .where("ownerUid", "==", ownerUid)
    .where("meetingUrl", "==", meetingUrl)
    .where("status", "==", "live")
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data() as ExtSession;
}

export async function listLiveSessions(ownerUid: string): Promise<ExtSession[]> {
  const snap = await db()
    .collection(COLLECTION)
    .where("ownerUid", "==", ownerUid)
    .where("status", "==", "live")
    .get();
  return snap.docs
    .map((d) => d.data() as ExtSession)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export interface ExtSessionPatch {
  participants?: MeetingParticipant[];
  chatMessages?: ChatMessage[];
  liveSegments?: ExtLiveSegment[];
  audioManifestAppend?: string[];
  status?: ExtSessionStatus;
  meetingId?: string;
}

/**
 * Ghi đè participants (roster mới nhất), append chat/segments có dedupe theo id + cap.
 * Trả về session sau khi cập nhật.
 */
export async function patchExtSession(
  id: string,
  patch: ExtSessionPatch
): Promise<ExtSession | null> {
  const ref = db().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const cur = snap.data() as ExtSession;

  const next: ExtSession = { ...cur, updatedAt: Date.now() };
  if (patch.participants) next.participants = patch.participants;
  if (patch.chatMessages) {
    const seen = new Set(cur.chatMessages.map((m) => m.id));
    const fresh = patch.chatMessages.filter((m) => m.id && !seen.has(m.id) && m.text.trim() !== "");
    next.chatMessages = [...cur.chatMessages, ...fresh].slice(-EXT_MAX_CHAT);
  }
  if (patch.liveSegments) {
    const seen = new Set(cur.liveSegments.map((s) => s.id));
    const fresh = patch.liveSegments.filter((s) => s.id && !seen.has(s.id) && s.text.trim() !== "");
    next.liveSegments = [...cur.liveSegments, ...fresh].slice(-EXT_MAX_SEGMENTS);
  }
  if (patch.audioManifestAppend?.length) {
    next.audioManifest = [...cur.audioManifest, ...patch.audioManifestAppend];
  }
  if (patch.status) next.status = patch.status;
  if (patch.meetingId) next.meetingId = patch.meetingId;

  await ref.set(next);
  return next;
}
