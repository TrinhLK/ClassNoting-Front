import type { Meeting, Segment, Speaker } from "../../app/lib/db";
import { MEETING_STATUS } from "../../app/lib/constants";

export const mockSpeaker = (overrides: Partial<Speaker> = {}): Speaker => ({
  id: "SPEAKER_00",
  name: "Người nói 1",
  color: "bg-blue-50 text-blue-700 border-blue-200",
  ...overrides,
});

export const mockSegment = (overrides: Partial<Segment> = {}): Segment => ({
  id: "seg_1",
  speakerId: "SPEAKER_00",
  start: 0,
  end: 4,
  text: "Xin chào",
  ...overrides,
});

export const mockMeeting = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: "meeting_test_1",
  userId: "user_test_1",
  title: "Cuộc họp test",
  createdAt: 1700000000000,
  duration: 60,
  segments: [mockSegment()],
  speakers: [mockSpeaker()],
  status: MEETING_STATUS.TRANSCRIBING,
  isDeleted: false,
  jobId: "job_test_1",
  jobStartedAt: Date.now(),
  ...overrides,
});

export const authHeader = (uid = "user_test_1") => {
  return `Bearer fake-token-${uid}`;
};

export const makeRequest = (
  body: unknown,
  options: { headers?: Record<string, string>; ip?: string } = {}
) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  if (options.ip) {
    headers["x-forwarded-for"] = options.ip;
  }
  return new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};
