import { describe, expect, it } from "vitest";
import { meetingEvidence } from "@/app/lib/meeting-evidence";
import type { Meeting } from "@/app/lib/db";

const fixture = {
  id: "meeting-1",
  userId: "user-1",
  title: "Trao đổi kế hoạch",
  createdAt: 1000,
  duration: 60,
  status: "COMPLETED",
  isDeleted: false,
  segments: [{ id: "seg_1_123456", start: 2, end: 3, text: "Rà soát số liệu.", speakerId: "spk-1" }],
  speakers: [{ id: "spk-1", name: "Nguyễn An", color: "blue" }],
  chatMessages: [{ id: "chat_123_abc", sender: "Nguyễn An", text: "Đã rõ.", timestamp: 2000 }],
} as unknown as Meeting;

describe("meetingEvidence", () => {
  it("giữ ID nguồn cho trích xuất nhiệm vụ theo mặc định", () => {
    const content = meetingEvidence(fixture);
    expect(content).toContain("[segment:seg_1_123456]");
    expect(content).toContain("[chat:chat_123_abc]");
  });

  it("bỏ ID nguồn khỏi ngữ cảnh dùng tạo biên bản cho người đọc", () => {
    const content = meetingEvidence(fixture, { includeEvidenceIds: false });
    expect(content).toContain("Rà soát số liệu.");
    expect(content).toContain("Nguyễn An: Đã rõ.");
    expect(content).not.toContain("seg_1_123456");
    expect(content).not.toContain("chat_123_abc");
    expect(content).not.toContain("Dẫn ID nguồn");
  });
});
