import { beforeEach, describe, expect, it } from "vitest";
import {
  clearReprocessBackup,
  getReprocessBackup,
  snapshotMeetingForReprocess,
} from "@/app/lib/reprocessBackup";
import { MEETING_STATUS } from "@/app/lib/constants";
import type { Meeting } from "@/app/lib/db";

const baseMeeting = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: "m-reprocess-1",
  userId: "u1",
  title: "Cuộc họp test",
  createdAt: 1700000000000,
  duration: 161,
  audioUrl: "https://example.com/a.mp3",
  segments: [
    { id: "s1", speakerId: "SPEAKER_00", start: 0, end: 2, text: "Xin chào" },
  ],
  speakers: [{ id: "SPEAKER_00", name: "Người nói 1", color: "x" }],
  summary: "Tóm tắt cũ",
  status: MEETING_STATUS.COMPLETED,
  isDeleted: false,
  ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("reprocessBackup", () => {
  it("snapshot rồi đọc lại đầy đủ segments/speakers/summary/status", () => {
    const meeting = baseMeeting();
    expect(snapshotMeetingForReprocess(meeting)).toBe(true);
    const backup = getReprocessBackup(meeting.id);
    expect(backup).not.toBeNull();
    expect(backup?.segments).toHaveLength(1);
    expect(backup?.segments[0].text).toBe("Xin chào");
    expect(backup?.speakers).toHaveLength(1);
    expect(backup?.summary).toBe("Tóm tắt cũ");
    expect(backup?.status).toBe(MEETING_STATUS.COMPLETED);
    expect(backup?.savedAt).toBeGreaterThan(0);
  });

  it("trả null khi chưa snapshot, clear thì mất", () => {
    expect(getReprocessBackup("m-missing")).toBeNull();
    const meeting = baseMeeting();
    snapshotMeetingForReprocess(meeting);
    clearReprocessBackup(meeting.id);
    expect(getReprocessBackup(meeting.id)).toBeNull();
  });

  it("snapshot bản mới ghi đè bản cũ", () => {
    const meeting = baseMeeting();
    snapshotMeetingForReprocess(meeting);
    snapshotMeetingForReprocess(baseMeeting({ summary: "Tóm tắt mới" }));
    expect(getReprocessBackup(meeting.id)?.summary).toBe("Tóm tắt mới");
  });

  it("không đụng backup của meeting khác", () => {
    snapshotMeetingForReprocess(baseMeeting({ id: "m-a" }));
    snapshotMeetingForReprocess(baseMeeting({ id: "m-b", summary: "B" }));
    expect(getReprocessBackup("m-a")?.summary).toBe("Tóm tắt cũ");
    expect(getReprocessBackup("m-b")?.summary).toBe("B");
  });
});
