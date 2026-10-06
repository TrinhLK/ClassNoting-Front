import { describe, it, expect, vi, beforeEach } from "vitest";
import { memoryFirestore } from "@/tests/helpers/admin-firestore";
const store = new Map<string, any>();
const db = memoryFirestore(store);
vi.mock("@/app/lib/firebase-admin", () => ({ getAdminDb: () => db }));
import { createExtSession, patchExtSession, loadExtHistory, getExtSession } from "@/app/lib/ext-sessions";
import { saveMeetingContent, loadMeetingContent } from "@/app/lib/meeting-content";
import { mockMeeting, mockSegment } from "@/tests/helpers/fixtures";
beforeEach(() => store.clear());

describe("durable meeting history", () => {
  it("keeps all chat after the live preview cap and deduplicates retries", async () => {
    const session = await createExtSession({ ownerUid: "u", provider: "meet", meetingUrl: "https://meet.google.com/abc-defg-hij", title: "test" });
    for (let batch = 0; batch < 7; batch++) {
      const patch = { chatMessages: Array.from({ length: 100 }, (_, i) => ({ id: `c${batch * 100 + i}`, sender: "An", text: "hello", timestamp: batch * 100 + i })) };
      await patchExtSession(session.id, patch); await patchExtSession(session.id, patch);
    }
    const preview = (await getExtSession(session.id))!;
    expect(preview.chatMessages.length).toBeLessThanOrEqual(500);
    expect((await loadExtHistory(preview)).chatMessages).toHaveLength(700);
  });
  it("ignores stale speaker revisions and retains both concurrent batches", async () => {
    const s = await createExtSession({ ownerUid: "u", provider: "meet", meetingUrl: "x", title: "test" });
    const seg = { id: "s", speaker: "An", start: 0, end: 1, text: "Hi", revision: 2 };
    await Promise.all([patchExtSession(s.id, { liveSegments: [seg] }), patchExtSession(s.id, { chatMessages: [{ id: "c", sender: "B", text: "Yo", timestamp: 1 }] })]);
    await patchExtSession(s.id, { liveSegments: [{ ...seg, speaker: "Wrong", revision: 1 }] });
    const full = await loadExtHistory((await getExtSession(s.id))!);
    expect(full.liveSegments[0].speaker).toBe("An"); expect(full.chatMessages).toHaveLength(1);
  });
  it("pages large finalized meetings without losing rows", async () => {
    const meeting = mockMeeting({ segments: Array.from({ length: 550 }, (_, i) => mockSegment({ id: `s${i}`, text: "x".repeat(1500) })) });
    await saveMeetingContent(meeting);
    const stored = store.get(`meetings/${meeting.id}`);
    expect(stored.contentPaged).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(stored))).toBeLessThan(700000);
    expect((await loadMeetingContent(stored)).segments).toHaveLength(550);
  });
});
