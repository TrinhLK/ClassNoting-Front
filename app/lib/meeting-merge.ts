import { computeChatStats } from "./chat-stats";
import { MEETING_STATUS, type MeetingStatus } from "./constants";
import type { ChatMessage, Meeting, MeetingParticipant } from "./db";

export const MERGED_CHAT_CAP = 500;

/** Hợp nhất 2 mảng theo `id` (giữ thứ tự: cũ trước, mới sau). */
export function unionById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const seen = new Set(a.map((x) => x.id));
  return [...a, ...b.filter((x) => !seen.has(x.id))];
}

const normName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

// Thứ tự tiến triển của pipeline — luồng nào đi xa hơn thì thắng field `status`.
const STATUS_RANK: Record<MeetingStatus, number> = {
  [MEETING_STATUS.DRAFT]: 0,
  [MEETING_STATUS.TRANSCRIBING]: 1,
  [MEETING_STATUS.TRANSCRIBED]: 2,
  [MEETING_STATUS.SUMMARIZING]: 3,
  [MEETING_STATUS.COMPLETED]: 4,
  [MEETING_STATUS.FAILED]: -1,
};

/**
 * Gộp biên bản luồng kép (bot + extension) thành 1 doc.
 * - segments/chat/participants/speakers: hợp nhất theo id/tên, sắp xếp theo thời gian.
 * - status: luồng đi xa hơn thắng; summary/audioUrl: bên nào có thì giữ.
 * - chatStats tính lại từ chat + participants đã gộp.
 */
export function mergeMeetingDocs(existing: Meeting | null, incoming: Meeting): Meeting {
  if (!existing) return incoming;

  const segments = unionById(existing.segments || [], incoming.segments || []).sort(
    (x, y) => x.start - y.start
  );
  const speakers = unionById(existing.speakers || [], incoming.speakers || []);
  const chatMessages = unionById(existing.chatMessages || [], incoming.chatMessages || [])
    .filter((m: ChatMessage) => (m.text || "").trim() !== "")
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MERGED_CHAT_CAP);

  const seenNames = new Set(
    (existing.participants || []).map((p: MeetingParticipant) =>
      normName(p.displayName || p.name || "")
    )
  );
  const participants = [
    ...(existing.participants || []),
    ...(incoming.participants || []).filter((p) => {
      const key = normName(p.displayName || p.name || "");
      if (!key || seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    }),
  ];

  const rank = (s: MeetingStatus) => STATUS_RANK[s] ?? 0;
  const status =
    rank(existing.status) >= rank(incoming.status) ? existing.status : incoming.status;

  return {
    ...incoming,
    id: existing.id,
    userId: existing.userId,
    createdAt: Math.min(existing.createdAt, incoming.createdAt),
    title: existing.title || incoming.title,
    duration: Math.max(existing.duration || 0, incoming.duration || 0),
    audioUrl: existing.audioUrl || incoming.audioUrl,
    segments,
    speakers,
    participants,
    chatMessages,
    chatStats: computeChatStats(chatMessages, participants),
    summary: existing.summary || incoming.summary,
    status,
    jobId: incoming.jobId ?? existing.jobId,
    jobStartedAt: incoming.jobStartedAt ?? existing.jobStartedAt,
    botId: existing.botId ?? incoming.botId,
    source: existing.source ?? incoming.source,
  };
}
