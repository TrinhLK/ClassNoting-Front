import type { Meeting, Segment, Speaker } from "./db";

const KEY_PREFIX = "reprocess-backup:";

export interface ReprocessBackup {
  segments: Segment[];
  speakers: Speaker[];
  summary?: string;
  status: Meeting["status"];
  savedAt: number;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Chụp nhanh biên bản trước khi "Xử lý lại" wipe segments/summary.
 * Trả false khi không lưu được (VD quota) — caller vẫn tiếp tục nhưng nên báo user.
 */
export function snapshotMeetingForReprocess(meeting: Meeting): boolean {
  const store = storage();
  if (!store) return false;
  try {
    const backup: ReprocessBackup = {
      segments: meeting.segments || [],
      speakers: meeting.speakers || [],
      summary: meeting.summary,
      status: meeting.status,
      savedAt: Date.now(),
    };
    store.setItem(KEY_PREFIX + meeting.id, JSON.stringify(backup));
    return true;
  } catch {
    return false;
  }
}

export function getReprocessBackup(meetingId: string): ReprocessBackup | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY_PREFIX + meetingId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReprocessBackup;
    if (!Array.isArray(parsed.segments) || !Array.isArray(parsed.speakers)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearReprocessBackup(meetingId: string): void {
  try {
    storage()?.removeItem(KEY_PREFIX + meetingId);
  } catch {
    // Bỏ qua — backup local không ảnh hưởng dữ liệu chính.
  }
}
