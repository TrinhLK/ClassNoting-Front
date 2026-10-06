import { describe, it, expect, vi } from "vitest";
import { parseServerMessage, splitSpeakerTurns, speakersFromSegments } from "@/app/lib/realtime-protocol";
import { zoomPacket, teamsEvent } from "@/app/lib/integrations/adapters";
import { meetingEvidence } from "@/app/lib/meeting-evidence";
import { mockMeeting, mockSegment, mockSpeaker } from "@/tests/helpers/fixtures";
vi.mock("@/app/lib/firebase-admin", () => ({ getAdminDb: vi.fn(), getAdminStorage: vi.fn() }));
import { applyRefinement } from "@/app/lib/refinement";

describe("speaker pipeline", () => {
  it("splits one packet by word speakers, retaining punctuation and order", () => {
    const packet = parseServerMessage({ protocol: 2, speaker_scope: "connection-a", is_final: true, channel: { alternatives: [{
      transcript: "Chào anh. Vâng!", speaker: 0, words: [
        { word: "Chào", start: 1, end: 1.3, speaker: 0 },
        { word: "anh.", start: 1.3, end: 2, speaker: 0 },
        { word: "Vâng!", start: 2, end: 3, speaker: 1 },
      ] }] } })!;
    const turns = splitSpeakerTurns(packet);
    expect(turns.map(t => [t.serverSpeaker, t.rawTranscript])).toEqual([[0, "Chào anh."], [1, "Vâng!"]]);
    expect(turns[1].rawWords[0].start).toBe(2);
    expect(turns.every(t => t.speakerScope === "connection-a")).toBe(true);
  });
  it("does not invent a speaker when labels are absent or overlapping", () => {
    const packet = parseServerMessage({ is_final: true, channel: { alternatives: [{ transcript: "test", words: [
      { word: "test", start: 1, end: 2, speaker: 5, overlap: true },
    ] }] } })!;
    expect(splitSpeakerTurns(packet)[0].serverSpeaker).toBe(-1);
    expect(speakersFromSegments([{ speakerId: "SPEAKER_-1" }])[0].name).toBe("Chưa xác định");
  });
  it("preserves original text when tokenization does not require a speaker split", () => {
    expect(splitSpeakerTurns({ kind: "final", rawTranscript: "Xin chào!", rawWords: [], serverSpeaker: -1 })[0].rawTranscript).toBe("Xin chào!");
  });
  it("Zoom namespaced participant IDs disambiguate identical names", () => {
    const event = { msg_type: 17, content: { user_id: 5, user_name: "An", start_time: 11000, end_time: 12000, timestamp: 13000, data: "Xin chào" } };
    const a = zoomPacket(event, 10000), b = zoomPacket({ ...event, content: { ...event.content, user_id: 6 } }, 10000);
    expect(a.liveSegments?.[0]).toMatchObject({ start: 1, end: 2, participantId: "5", uncertain: false });
    expect(a.liveSegments?.[0].id).not.toBe(b.liveSegments?.[0].id);
    expect(zoomPacket(event, 10000)).toEqual(a); // retry idempotency
  });
  it("ignores non-public Zoom chat and reaction packets", () => {
    expect(zoomPacket({ msg_type: 18, content: { chat_session: { type: 2 }, operation_type: 1, data: "private" } }, 0)).toEqual({});
    expect(zoomPacket({ msg_type: 18, content: { chat_session: { type: 1 }, operation_type: 4, data: "like" } }, 0)).toEqual({});
  });
  it("validates Teams timing instead of assigning receipt time", () => {
    expect(() => teamsEvent({ kind: "transcript", id: "x", participant: { id: "a", displayName: "An" }, text: "test", startTimeMs: 5, endTimeMs: 2 }, 0)).toThrow();
    expect(teamsEvent({ kind: "transcript", id: "x", participant: { id: "a", displayName: "An" }, text: "test", startTimeMs: 1000, endTimeMs: 2000 }, 500).liveSegments?.[0].start).toBe(.5);
  });
  it("includes chat and uncertainty with traceable source IDs in summary input", () => {
    const text = meetingEvidence(mockMeeting({ segments: [mockSegment({ id: "s", uncertain: true })], chatMessages: [{ id: "c", sender: "Bình", text: "Hạn thứ sáu", timestamp: 1000 }] }));
    expect(text).toContain("[segment:s]"); expect(text).toContain("[chat:c]");
    expect(text).toContain("danh tính chưa xác nhận");
  });
  it("preserves manual corrections and avoids mapping weak names during refinement", () => {
    const original = mockMeeting({ segments: [mockSegment({ id: "manual", start: 1, end: 2, text: "Đã sửa", manuallyEdited: true })], speakers: [mockSpeaker()] });
    const result = applyRefinement(original, [mockSegment({ id: "offline", start: 3, end: 4, speakerId: "tab:0", text: "Mới" })]);
    expect(result.segments.find(s => s.id === "manual")?.text).toBe("Đã sửa");
    expect(result.segments.find(s => s.id === "offline")?.uncertain).toBe(true);
    expect(result.refinement?.status).toBe("completed");
  });
});
