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
