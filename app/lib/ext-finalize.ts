import { getAdminDb } from "@/app/lib/firebase-admin";
import { MEETING_STATUS } from "@/app/lib/constants";
import { computeChatStats } from "@/app/lib/chat-stats";
import {
  getExtSession,
  listLiveSessions,
  meetingIdFor,
  patchExtSession,
  type ExtSession,
} from "@/app/lib/ext-sessions";
import { mergeMeetingDocs } from "@/app/lib/meeting-merge";
import type { Meeting, Segment, Speaker } from "@/app/lib/db";

const SPEAKER_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
];

export interface FinalizeResult {
  meetingId: string | null;
  /** true khi phiên không thu được gì → đóng session mà không tạo biên bản. */
  empty: boolean;
  counts: { segments: number; chat: number; participants: number };
}

/**
 * Kết xuất 1 phiên extension thành biên bản (gộp với doc bot nếu có).
 * Phiên rỗng (0 segments/chat/participants) thì chỉ đóng, không đẻ biên bản trống.
 */
export async function finalizeExtSession(
  session: ExtSession,
  ownerUid: string
): Promise<FinalizeResult> {
  const counts = {
    segments: session.liveSegments.length,
    chat: session.chatMessages.length,
    participants: session.participants.length,
  };
  const empty = counts.segments === 0 && counts.chat === 0 && counts.participants === 0;

  if (empty) {
    await patchExtSession(session.id, { status: "ended" });
    return { meetingId: null, empty: true, counts };
  }

  const nameOrder: string[] = [];
  for (const s of session.liveSegments) {
    if (!nameOrder.includes(s.speaker)) nameOrder.push(s.speaker);
  }
  const nameToId = new Map(nameOrder.map((n, i) => [n, `SPEAKER_${String(i).padStart(2, "0")}`]));
  const speakers: Speaker[] = nameOrder.map((n, i) => ({
    id: nameToId.get(n)!,
    name: n,
    color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
  }));
  const segments: Segment[] = session.liveSegments.map((s) => ({
    id: s.id,
    speakerId: nameToId.get(s.speaker) ?? "SPEAKER_00",
    start: s.start,
    end: s.end,
    text: s.text,
  }));

  const meetingId =
    session.meetingId || meetingIdFor(ownerUid, session.meetingUrl, session.startedAt);
  const incoming: Meeting = {
    id: meetingId,
    userId: ownerUid,
    title: session.title,
    createdAt: session.startedAt,
    duration: segments.length > 0 ? segments[segments.length - 1].end : 0,
    segments,
    speakers,
    summary: "",
    status: MEETING_STATUS.TRANSCRIBED,
    isDeleted: false,
    source: "extension",
    meetingUrl: session.meetingUrl,
    provider: session.provider,
    participants: session.participants,
    chatMessages: session.chatMessages,
    chatStats: computeChatStats(session.chatMessages, session.participants),
  };

  const meetingsCol = getAdminDb().collection("meetings");
  let finalMeeting = incoming;
  try {
    const snap = await meetingsCol.doc(meetingId).get();
    if (snap.exists) {
      finalMeeting = mergeMeetingDocs(snap.data() as Meeting, incoming);
    }
  } catch (e) {
    console.warn("[ext/finalize] merge read failed, overwriting:", e);
  }

  const clean = Object.fromEntries(
    Object.entries(structuredClone(finalMeeting)).filter(([, v]) => v !== undefined)
  );
  await meetingsCol.doc(meetingId).set(clean);
  await patchExtSession(session.id, { status: "ended", meetingId });

  return { meetingId, empty: false, counts };
}

/** Phiên live quá lâu không heartbeat thì coi như mồ côi → tự kết xuất. */
export const STALE_SESSION_MS = 10 * 60 * 1000;

/**
 * Quét dọn phiên thiu của user (gọi lười trong các API extension mỗi khi đọc).
 * Trả về id các session đã tự đóng.
 */
export async function endStaleSessions(
  ownerUid: string,
  maxAgeMs: number = STALE_SESSION_MS
): Promise<string[]> {
  const now = Date.now();
  const live = await listLiveSessions(ownerUid);
  const ended: string[] = [];
  for (const s of live) {
    if (now - (s.updatedAt || s.startedAt) < maxAgeMs) continue;
    try {
      const full = (await getExtSession(s.id)) ?? s;
      await finalizeExtSession(full, ownerUid);
      ended.push(s.id);
    } catch (e) {
      console.warn("[ext/finalize] stale end failed:", s.id, e);
    }
  }
  return ended;
}
