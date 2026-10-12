import { describe, it, expect, vi, beforeEach } from "vitest";
const { get, load } = vi.hoisted(() => ({ get: vi.fn(), load: vi.fn() }));
vi.mock("@/app/lib/firebase-admin", () => ({ getAdminDb: () => ({ collection: () => ({ where: () => ({ limit: () => ({ get }) }) }) }) }));
vi.mock("@/app/lib/meeting-content", () => ({ loadMeetingContent: load }));
import { GET } from "@/app/api/share/[token]/route";
import { completeSpeakers } from "@/app/lib/speakers";
import { mockMeeting, mockSegment } from "@/tests/helpers/fixtures";
const request = () => GET(new Request("http://localhost/api/share/token"), { params: Promise.resolve({ token: "token" }) });
beforeEach(() => { vi.clearAllMocks(); load.mockImplementation(async m => ({ ...m, segments: [mockSegment()] })); });
describe("public share", () => {
  it("serves full content anonymously and excludes private metadata", async () => {
    get.mockResolvedValue({ docs: [{ id: "m1", data: () => mockMeeting({ userId: "secret", jobId: "internal", shareToken: "token", contentPaged: true }) }] });
    const response = await request();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.segments).toHaveLength(1);
    expect(body.userId).toBeUndefined();
    expect(body.jobId).toBeUndefined();
    expect(body.shareToken).toBeUndefined();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it.each([{ docs: [] }, { docs: [{ id: "m1", data: () => mockMeeting({ isDeleted: true }) }] }])("rejects absent or deleted meetings", async ({ docs }) => {
    get.mockResolvedValue({ docs });
    expect((await request()).status).toBe(404);
    expect(load).not.toHaveBeenCalled();
  });
});
it("makes missing speaker IDs editable without assigning another person's name", () => {
  const segments = [mockSegment({ speakerId: "SPEAKER_-1" }), mockSegment({ speakerId: "SPEAKER_-1" })];
  const speakers = completeSpeakers([], segments);
  expect(speakers).toHaveLength(1);
  expect(speakers[0].name).toBe("Chưa xác định");
  expect(completeSpeakers([{ ...speakers[0], name: "Lan" }], segments)[0].name).toBe("Lan");
});
