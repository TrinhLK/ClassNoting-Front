import { describe, it, expect } from "vitest";
import { mockMeeting, mockSegment, mockSpeaker } from "@/tests/helpers/fixtures";
import { MEETING_STATUS } from "@/app/lib/constants";
import {
  meetingIdFor,
  normalizeMeetingUrl,
  dayKey,
} from "@/app/lib/ext-sessions";
import { mergeMeetingDocs, unionById } from "@/app/lib/meeting-merge";

describe("normalizeMeetingUrl", () => {
  it("strip query/hash/trailing-slash, lowercase", () => {
    expect(normalizeMeetingUrl("https://meet.google.com/abc-defg-hij?authuser=0")).toBe(
      "https://meet.google.com/abc-defg-hij"
    );
    expect(normalizeMeetingUrl("https://meet.google.com/abc-defg-hij/#x")).toBe(
      "https://meet.google.com/abc-defg-hij"
    );
    expect(normalizeMeetingUrl("  HTTPS://meet.google.com/ABC-DEFG-HIJ/ ")).toBe(
      "https://meet.google.com/abc-defg-hij"
    );
  });
});

describe("meetingIdFor", () => {
  it("ổn định với cùng input, khác ngày/link/user thì khác id", () => {
    const a = meetingIdFor("u1", "https://meet.google.com/abc-defg-hij", 1700000000000);
    const b = meetingIdFor("u1", "https://meet.google.com/abc-defg-hij?authuser=1", 1700000005000);
    expect(a).toBe(b);
    expect(meetingIdFor("u2", "https://meet.google.com/abc-defg-hij", 1700000000000)).not.toBe(a);
    expect(meetingIdFor("u1", "https://meet.google.com/xxx-yyyy-zzz", 1700000000000)).not.toBe(a);
    // Ngày khác (link Meet tái dùng) → biên bản khác
    expect(meetingIdFor("u1", "https://meet.google.com/abc-defg-hij", 1700000000000 + 86400000)).not.toBe(a);
  });

  it("dayKey định dạng YYYY-MM-DD", () => {
    expect(dayKey(1700000000000)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("unionById", () => {
  it("giữ cũ trước, bỏ trùng id", () => {
    const r = unionById([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]);
    expect(r.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("mergeMeetingDocs", () => {
  it("null existing → trả incoming nguyên vẹn", () => {
    const inc = mockMeeting({ id: "m1" });
    expect(mergeMeetingDocs(null, inc)).toBe(inc);
  });

  it("gộp segments theo id + sắp xếp theo start", () => {
    const existing = mockMeeting({
      segments: [mockSegment({ id: "s1", start: 10, end: 12 })],
    });
    const incoming = mockMeeting({
      segments: [mockSegment({ id: "s1", start: 10, end: 12 }), mockSegment({ id: "s2", start: 0, end: 2 })],
    });
    const merged = mergeMeetingDocs(existing, incoming);
    expect(merged.segments.map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("giữ audioUrl/summary bên nào có, status bên đi xa hơn thắng", () => {
    const existing = mockMeeting({
      audioUrl: "",
      summary: "có rồi",
      status: MEETING_STATUS.COMPLETED,
    });
    const incoming = mockMeeting({
      audioUrl: "https://x/audio.mp3",
      summary: "",
      status: MEETING_STATUS.TRANSCRIBED,
    });
    const merged = mergeMeetingDocs(existing, incoming);
    expect(merged.audioUrl).toBe("https://x/audio.mp3");
    expect(merged.summary).toBe("có rồi");
    expect(merged.status).toBe(MEETING_STATUS.COMPLETED);
    // id/userId của doc cũ được giữ
    expect(merged.id).toBe(existing.id);
  });

  it("gộp participants theo tên (không phân biệt hoa thường), giữ chat tối đa 500", () => {
    const existing = mockMeeting({
      participants: [{ name: "Nguyen A" }],
      chatMessages: [{ id: "c1", sender: "Nguyen A", text: "hi", timestamp: 1 }],
      speakers: [mockSpeaker({ id: "SPEAKER_00", name: "Nguyen A" })],
    });
    const incoming = mockMeeting({
      participants: [{ name: "nguyen  van a" }, { name: "Tran B" }],
      chatMessages: [{ id: "c2", sender: "Tran B", text: "ok", timestamp: 2 }],
      speakers: [mockSpeaker({ id: "SPEAKER_01", name: "Tran B" })],
    });
    const merged = mergeMeetingDocs(existing, incoming);
    // "nguyen van a" khác "nguyen a" → thêm mới; không trùng lặp
    expect(merged.participants.map((p) => p.name)).toEqual([
      "Nguyen A",
      "nguyen  van a",
      "Tran B",
    ]);
    expect(merged.chatMessages.map((m) => m.id)).toEqual(["c1", "c2"]);
    expect(merged.speakers.map((s) => s.id)).toEqual(["SPEAKER_00", "SPEAKER_01"]);
    expect(merged.chatStats?.totalMessages).toBe(2);
  });
});
