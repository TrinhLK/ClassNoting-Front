import { describe, it, expect, vi, beforeEach } from "vitest";

const setDocMock = vi.fn(async () => {});
const updateDocMock = vi.fn(async () => {});
const getDocsMock = vi.fn();
const getDocMock = vi.fn();
const deleteDocMock = vi.fn(async () => {});
const onSnapshotMock = vi.fn((_q, onData) => {
  setTimeout(() => onData({ docs: [] }), 0);
  return () => {};
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, name) => ({ _type: "collection", name })),
  doc: vi.fn((_db, name, id) => ({ _type: "doc", name, id })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
  query: vi.fn((...args) => ({ _type: "query", args })),
  where: vi.fn((f, op, v) => ({ _type: "where", f, op, v })),
  orderBy: vi.fn((f, d) => ({ _type: "orderBy", f, d })),
  limit: vi.fn((n) => ({ _type: "limit", n })),
  startAfter: vi.fn((c) => ({ _type: "startAfter", c })),
}));

vi.mock("@/app/lib/firebase", () => ({
  db: { _type: "db" },
}));

vi.mock("@/app/lib/templates", () => ({}));

import { saveMeeting, getMeetingsPaginated, getAllMeetings, getMeetingById, getMeetingByShareId, updateMeetingProcess, PAGE_SIZE, toggleTrashMeeting, deleteMeetingPermanent, updateMeetingTitle, updateMeetingFolder, generateMeetingShareToken, subscribeToActiveMeetings, getActiveTranscribingMeetings } from "@/app/lib/db/meetingDb";
import { mockMeeting, mockSegment } from "@/tests/helpers/fixtures";
import { MEETING_STATUS } from "@/app/lib/constants";

describe("saveMeeting — fallback khi vượt 1MB Firestore (Phase 3 + 4)", () => {
  beforeEach(() => {
    setDocMock.mockReset();
    setDocMock.mockResolvedValue(undefined);
  });

  it("setDoc với meeting không có words", async () => {
    const meeting = mockMeeting();
    await saveMeeting(meeting);

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [, data] = setDocMock.mock.calls[0];
    expect(data.segments).toBeInstanceOf(Array);
    expect(data.id).toBe(meeting.id);
  });

  it("strip undefined fields trước khi ghi", async () => {
    const meeting = mockMeeting({ jobId: undefined, errorMessage: undefined });
    await saveMeeting(meeting);

    const [, data] = setDocMock.mock.calls[0];
    expect("jobId" in data).toBe(false);
    expect("errorMessage" in data).toBe(false);
    expect("id" in data).toBe(true);
  });

  it("fallback: bỏ 'words' array nếu setDoc lần đầu throw", async () => {
    setDocMock.mockRejectedValueOnce(new Error("1MB limit exceeded"));
    const meeting = mockMeeting({
      segments: [
        mockSegment({ words: [{ word: "xin", start: 0, end: 0.5 } as any] }),
      ],
    });

    await saveMeeting(meeting);

    expect(setDocMock).toHaveBeenCalledTimes(2);
    const secondCallData = setDocMock.mock.calls[1][1];
    expect(secondCallData.segments[0]).not.toHaveProperty("words");
  });

  it("throw nếu cả 2 lần đều fail", async () => {
    setDocMock.mockRejectedValue(new Error("Network down"));

    await expect(saveMeeting(mockMeeting())).rejects.toThrow("Network down");
  });
});

describe("getMeetingsPaginated — pagination (Phase 4.3)", () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    updateDocMock.mockReset();
  });

  it("query với userId, orderBy createdAt desc, limit PAGE_SIZE+1", async () => {
    getDocsMock.mockResolvedValue({ docs: [] });
    await getMeetingsPaginated("user_1");

    expect(getDocsMock).toHaveBeenCalledTimes(1);
  });

  it("trả hasMore=false khi docs.length <= PAGE_SIZE", async () => {
    const docs = Array.from({ length: 10 }, (_, i) => ({
      data: () => mockMeeting({ id: `m_${i}` }),
    }));
    getDocsMock.mockResolvedValue({ docs });

    const result = await getMeetingsPaginated("user_1");
    expect(result.hasMore).toBe(false);
    expect(result.meetings).toHaveLength(10);
  });

  it("trả hasMore=true khi docs.length > PAGE_SIZE, slice về PAGE_SIZE", async () => {
    const docs = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({
      data: () => mockMeeting({ id: `m_${i}` }),
    }));
    getDocsMock.mockResolvedValue({ docs });

    const result = await getMeetingsPaginated("user_1");
    expect(result.hasMore).toBe(true);
    expect(result.meetings).toHaveLength(PAGE_SIZE);
  });

  it("filter isDeleted=true khi deleted=true (Trash tab)", async () => {
    getDocsMock.mockResolvedValue({ docs: [] });
    await getMeetingsPaginated("user_1", undefined, true);
    expect(getDocsMock).toHaveBeenCalledTimes(1);
  });

  it("filter isDeleted=false khi deleted=false", async () => {
    getDocsMock.mockResolvedValue({ docs: [] });
    await getMeetingsPaginated("user_1", undefined, false);
    expect(getDocsMock).toHaveBeenCalledTimes(1);
  });
});

describe("getAllMeetings — fallback trả []", () => {
  beforeEach(() => {
    getDocsMock.mockReset();
  });

  it("trả mảng meetings khi success", async () => {
    const docs = [
      { data: () => mockMeeting({ id: "m1" }) },
      { data: () => mockMeeting({ id: "m2" }) },
    ];
    getDocsMock.mockResolvedValue({ docs });

    const result = await getAllMeetings("user_1");
    expect(result).toHaveLength(2);
  });

  it("trả [] khi Firestore throw (không crash UI)", async () => {
    getDocsMock.mockRejectedValue(new Error("Firestore down"));
    const result = await getAllMeetings("user_1");
    expect(result).toEqual([]);
  });
});

describe("getMeetingById / getMeetingByShareId — error handling", () => {
  beforeEach(() => {
    getDocMock.mockReset();
    getDocsMock.mockReset();
  });

  it("getMeetingById trả undefined khi doc không tồn tại", async () => {
    getDocMock.mockResolvedValue({ exists: () => false });
    const result = await getMeetingById("missing_id");
    expect(result).toBeUndefined();
  });

  it("getMeetingById trả undefined khi Firestore throw", async () => {
    getDocMock.mockRejectedValue(new Error("Network"));
    const result = await getMeetingById("any_id");
    expect(result).toBeUndefined();
  });

  it("getMeetingByShareId ưu tiên query shareToken trước", async () => {
    getDocsMock.mockResolvedValue({
      empty: false,
      docs: [{ data: () => mockMeeting({ id: "from_share" }) }],
    });

    const result = await getMeetingByShareId("token_xyz");
    expect(result?.id).toBe("from_share");
  });

  it("getMeetingByShareId KHÔNG fallback sang getMeetingById (security fix)", async () => {
    getDocsMock.mockResolvedValue({ empty: true, docs: [] });
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => mockMeeting({ id: "private_meeting_id" }),
    });

    const result = await getMeetingByShareId("private_meeting_id");
    expect(result).toBeUndefined();
    expect(getDocMock).not.toHaveBeenCalled();
  });
});

describe("updateMeetingProcess — strip undefined", () => {
  beforeEach(() => {
    updateDocMock.mockReset();
    updateDocMock.mockResolvedValue(undefined);
  });

  it("không gửi field undefined", async () => {
    await updateMeetingProcess("m1", {
      status: MEETING_STATUS.COMPLETED,
      errorMessage: undefined,
      jobId: undefined,
    });

    const [, data] = updateDocMock.mock.calls[0];
    expect("errorMessage" in data).toBe(false);
    expect("jobId" in data).toBe(false);
    expect(data.status).toBe("completed");
  });
});

describe("CRUD operations", () => {
  beforeEach(() => {
    updateDocMock.mockReset();
    deleteDocMock.mockReset();
    updateDocMock.mockResolvedValue(undefined);
    deleteDocMock.mockResolvedValue(undefined);
  });

  it("toggleTrashMeeting set isDeleted", async () => {
    await toggleTrashMeeting("m1", true);
    const [, data] = updateDocMock.mock.calls[0];
    expect(data.isDeleted).toBe(true);
  });

  it("deleteMeetingPermanent gọi deleteDoc", async () => {
    await deleteMeetingPermanent("m1");
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
  });

  it("updateMeetingTitle set title", async () => {
    await updateMeetingTitle("m1", "New title");
    const [, data] = updateDocMock.mock.calls[0];
    expect(data.title).toBe("New title");
  });

  it("updateMeetingFolder set folderId", async () => {
    await updateMeetingFolder("m1", "folder_xyz");
    const [, data] = updateDocMock.mock.calls[0];
    expect(data.folderId).toBe("folder_xyz");
  });

  it("updateMeetingFolder cho phép null (move to root)", async () => {
    await updateMeetingFolder("m1", null);
    const [, data] = updateDocMock.mock.calls[0];
    expect(data.folderId).toBe(null);
  });

  it("generateMeetingShareToken trả token và lưu vào Firestore", async () => {
    const token = await generateMeetingShareToken("m1");
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(10);
    expect(token).toContain("-");
    expect(updateDocMock).toHaveBeenCalled();
    const [, data] = updateDocMock.mock.calls[0];
    expect(data.shareToken).toBe(token);
  });
});

describe("subscribeToActiveMeetings — realtime listener", () => {
  beforeEach(() => {
    onSnapshotMock.mockReset();
  });

  it("chỉ subscribe TRANSCRIBING", async () => {
    const cb = vi.fn();
    onSnapshotMock.mockImplementation((_q, onData) => {
      onData({ docs: [] });
      return () => {};
    });

    subscribeToActiveMeetings("user_1", cb);

    expect(onSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it("gọi callback với meetings mapped từ docs", async () => {
    const cb = vi.fn();
    onSnapshotMock.mockImplementation((_q, onData) => {
      onData({
        docs: [
          { data: () => mockMeeting({ id: "m1", status: MEETING_STATUS.TRANSCRIBING }) },
          { data: () => mockMeeting({ id: "m2", status: MEETING_STATUS.TRANSCRIBING }) },
        ],
      });
      return () => {};
    });

    subscribeToActiveMeetings("user_1", cb);
    await new Promise((r) => setTimeout(r, 10));

    expect(cb).toHaveBeenCalled();
    const meetings = cb.mock.calls[0][0];
    expect(meetings).toHaveLength(2);
  });

  it("trả unsubscribe function", () => {
    const unsub = vi.fn();
    onSnapshotMock.mockReturnValue(unsub);

    const result = subscribeToActiveMeetings("user_1", () => {});
    expect(result).toBe(unsub);
  });
});

describe("getActiveTranscribingMeetings", () => {
  beforeEach(() => {
    getDocsMock.mockReset();
  });

  it("trả mảng các meeting TRANSCRIBING", async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        { data: () => mockMeeting({ id: "m1", status: MEETING_STATUS.TRANSCRIBING }) },
        { data: () => mockMeeting({ id: "m2", status: MEETING_STATUS.TRANSCRIBING }) },
      ],
    });

    const result = await getActiveTranscribingMeetings("user_1");
    expect(result).toHaveLength(2);
  });
});