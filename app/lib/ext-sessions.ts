import { getAdminDb } from "@/app/lib/firebase-admin";
import type { ChatMessage, MeetingParticipant } from "@/app/lib/db";
import type { MeetingProvider } from "@/app/lib/meeting-links";

export type ExtSessionStatus = "live" | "finalizing" | "ended";

/** Một dòng transcript live đã gán tên người nói (từ extension). */
export interface ExtLiveSegment {
  id: string;
  speaker: string;
  text: string;
  start: number;
  end: number;
  uncertain?: boolean;
  participantId?: string;
  voiceId?: string;
  speakerSource?: import("./mockData").Segment["speakerSource"];
  words?: import("./mockData").Word[];
  revision?: number;
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
  historyVersion?: number;
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
  try {
    const url = new URL(rawUrl.trim());
    url.hash = "";
    // Keep Teams context and Zoom passcodes. Meet tracking params are not identity.
    if (url.hostname === "meet.google.com") { url.search = ""; url.pathname = url.pathname.toLowerCase(); }
    return url.toString().replace(/\/$/, "");
  } catch { return rawUrl.trim(); }
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
  data: Pick<ExtSession, "ownerUid" | "meetingUrl" | "provider" | "title"> & { startedAt?: number }
): Promise<ExtSession> {
  const now = Date.now();
  const ref = db().collection(COLLECTION).doc();
  const session: ExtSession = {
    id: ref.id,
    ...data,
    status: "live",
    startedAt: data.startedAt ?? now,
    updatedAt: now,
    participants: [],
    chatMessages: [],
    liveSegments: [],
    audioManifest: [],
    historyVersion: 2,
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
    historyVersion: 2,
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
  title?: string;
  participants?: MeetingParticipant[];
  chatMessages?: ChatMessage[];
  liveSegments?: ExtLiveSegment[];
  audioManifestAppend?: string[];
  status?: ExtSessionStatus;
  meetingId?: string;
}

/**
 * Deep-clean object trước khi ghi Firestore: Admin SDK ném lỗi với value
 * `undefined` (kể cả phần tử undefined trong mảng) → từng gây HTTP 500.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined)
      .map((v) => stripUndefinedDeep(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
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
  const before = (await ref.get()).data() as ExtSession | undefined;
  if (before && before.historyVersion !== 2) {
    // Migrate legacy inline history using create-only writes, never overwriting a newer revision.
    const legacy = [...before.liveSegments.map(value => ({ kind: "segments", value })),
      ...before.chatMessages.map(value => ({ kind: "chat", value }))];
    for (let i = 0; i < legacy.length; i += 50) await Promise.all(legacy.slice(i, i + 50).map(async ({ kind, value }) => {
      try { await ref.collection(kind).doc(encodeURIComponent(value.id)).create(stripUndefinedDeep({ ...value, revision: 1 })); }
      catch (e) { if ((e as { code?: number }).code !== 6) throw e; }
    }));
    await ref.update({ historyVersion: 2 });
  }
  return db().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const cur = snap.data() as ExtSession;
    if (cur.status !== "live" && (patch.liveSegments?.length || patch.chatMessages?.length || patch.participants?.length)) throw new Error("Session ended");
    const next: ExtSession = { ...cur, updatedAt: Date.now() };
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.participants) {
      const people = new Map(cur.participants.map(p => [String(p.id ?? p.name), p]));
      patch.participants.forEach(p => people.set(String(p.id ?? p.name), p));
      next.participants = [...people.values()];
    }
    // Read every prior revision before making transaction writes.
    const candidates = [
      ...(patch.chatMessages || []).map(value => ({ collection: "chat", value })),
      ...(patch.liveSegments || []).map(value => ({ collection: "segments", value })),
    ].filter(c => c.value.id && c.value.text.trim());
    const changeMap = new Map<string, typeof candidates[number]>();
    for (const c of candidates) {
      const key = `${c.collection}/${c.value.id}`;
      const old = changeMap.get(key);
      if (!old || Number(("revision" in c.value && c.value.revision) || 1) >= Number(("revision" in old.value && old.value.revision) || 1)) changeMap.set(key, c);
    }
    const changes = [...changeMap.values()];
    const prior = await Promise.all(changes.map(c => tx.get(ref.collection(c.collection).doc(encodeURIComponent(c.value.id)))));
    changes.forEach((change, i) => {
      const old = prior[i].data();
      const revision = "revision" in change.value ? change.value.revision || 1 : 1;
      if (old && (old.revision || 1) >= revision) return;
      tx.set(prior[i].ref, stripUndefinedDeep({ ...change.value, revision }));
    });
    if (patch.chatMessages) {
      const items = new Map(cur.chatMessages.map(v => [v.id, v]));
      patch.chatMessages.forEach(v => items.set(v.id, v));
      next.chatMessages = [...items.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-EXT_MAX_CHAT);
    }
    if (patch.liveSegments) {
      const items = new Map(cur.liveSegments.map(v => [v.id, v]));
      patch.liveSegments.forEach(v => {
        const old = items.get(v.id);
        if (!old || (v.revision || 1) > (old.revision || 1)) items.set(v.id, v);
      });
      next.liveSegments = [...items.values()].sort((a, b) => a.start - b.start).slice(-EXT_MAX_SEGMENTS);
    }
    // The document is a bounded live preview; immutable history is in subcollections.
    while (Buffer.byteLength(JSON.stringify(next)) > 700_000 && (next.liveSegments.length || next.chatMessages.length)) {
      if (next.liveSegments.length > next.chatMessages.length) next.liveSegments.shift();
      else next.chatMessages.shift();
    }
    if (patch.audioManifestAppend?.length) next.audioManifest = [...new Set([...cur.audioManifest, ...patch.audioManifestAppend])];
    if (patch.status) next.status = patch.status;
    if (patch.meetingId) next.meetingId = patch.meetingId;
    tx.set(ref, stripUndefinedDeep(next));
    return next;
  });
}

/** Full history for finalization, including legacy inline rows. */
export async function loadExtHistory(session: ExtSession): Promise<ExtSession> {
  const ref = db().collection(COLLECTION).doc(session.id);
  const [segments, chat] = await Promise.all([ref.collection("segments").get(), ref.collection("chat").get()]);
  const merge = <T extends { id: string }>(inline: T[], stored: T[]) => [...new Map([...inline, ...stored].map(v => [v.id, v])).values()];
  return { ...session,
    liveSegments: merge(session.liveSegments, segments.docs.map(d => d.data() as ExtLiveSegment)).sort((a, b) => a.start - b.start),
    chatMessages: merge(session.chatMessages, chat.docs.map(d => d.data() as ChatMessage)).sort((a, b) => a.timestamp - b.timestamp),
  };
}
