import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { mockMeeting } from "@/tests/helpers/fixtures";
import { MEETING_STATUS } from "@/app/lib/constants";

vi.mock("@/app/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const updateMeetingProcessMock = vi.fn(async () => {});
const onSnapshotImpl: ((cb: (meetings: unknown[]) => void) => () => void) = vi.fn();

vi.mock("@/app/lib/db", () => ({
  subscribeToActiveMeetings: (...args: unknown[]) => {
    const cb = args[1] as (meetings: unknown[]) => void;
    return onSnapshotImpl(cb);
  },
  updateMeetingProcess: (...args: unknown[]) => updateMeetingProcessMock(...args),
}));

const checkJobStatusMock = vi.fn();
vi.mock("@/app/lib/api", () => ({
  checkJobStatusOnce: (...args: unknown[]) => checkJobStatusMock(...args),
}));

const deleteFieldValueMock = vi.fn(() => "DELETE_FIELD");
vi.mock("@/app/lib/utils/firestore", () => ({
  deleteFieldValue: (...args: unknown[]) => deleteFieldValueMock(...args),
}));

import { useAuth } from "@/app/context/AuthContext";
import PollingManager from "@/app/components/PollingManager";

describe("PollingManager — timeout 30 phút + status update (bug 1.4, 1.6)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    updateMeetingProcessMock.mockClear();
    updateMeetingProcessMock.mockResolvedValue(undefined);
    checkJobStatusMock.mockReset();
    checkJobStatusMock.mockResolvedValue({ status: "IN_PROGRESS" });
    deleteFieldValueMock.mockClear();
    deleteFieldValueMock.mockReturnValue("DELETE_FIELD");
    onSnapshotImpl.mockReset();
    onSnapshotImpl.mockImplementation((cb) => {
      cb([]);
      return () => {};
    });
  });

  const setupActiveJob = (meetingOverrides = {}) => {
    const meeting = mockMeeting({
      jobId: "job_active_1",
      jobStartedAt: Date.now() - 5 * 60 * 1000,
      ...meetingOverrides,
    });

    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: "user_test_1" },
    });

    onSnapshotImpl.mockImplementation((cb) => {
      cb([meeting]);
      return () => {};
    });
    return meeting;
  };

  const flushAndAdvance = async (ms = 5000) => {
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms + 1000);
    });
  };

  it("mark FAILED khi job > 30 phút (bug 1.4)", async () => {
    const oldMeeting = mockMeeting({
      jobId: "job_old",
      jobStartedAt: Date.now() - 31 * 60 * 1000,
    });

    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: "user_test_1" },
    });

    onSnapshotImpl.mockImplementation((cb) => {
      cb([oldMeeting]);
      return () => {};
    });

    const onUpdate = vi.fn();
    render(<PollingManager onUpdate={onUpdate} />);
    await flushAndAdvance();

    expect(updateMeetingProcessMock).toHaveBeenCalled();
    const [meetingId, updates] = updateMeetingProcessMock.mock.calls[0];
    expect(meetingId).toBe(oldMeeting.id);
    expect(updates.status).toBe(MEETING_STATUS.FAILED);
    expect(updates.errorMessage).toMatch(/30 phút|timeout|thời gian/i);
  });

  it("mark FAILED khi RunPod trả FAILED status", async () => {
    const meeting = setupActiveJob();
    checkJobStatusMock.mockResolvedValueOnce({ status: "FAILED" });

    const onUpdate = vi.fn();
    render(<PollingManager onUpdate={onUpdate} />);
    await flushAndAdvance();

    expect(updateMeetingProcessMock).toHaveBeenCalled();
    const [meetingId, updates] = updateMeetingProcessMock.mock.calls[0];
    expect(meetingId).toBe(meeting.id);
    expect(updates.status).toBe(MEETING_STATUS.FAILED);
  });

  it("mark TRANSCRIBED khi RunPod trả COMPLETED có output segments", async () => {
    const meeting = setupActiveJob();
    checkJobStatusMock.mockResolvedValueOnce({
      status: "COMPLETED",
      output: {
        transcript: [
          {
            speaker: "SPEAKER_00",
            words: [
              { word: "xin", start: 0, end: 0.5 },
              { word: "chào", start: 0.5, end: 1 },
            ],
          },
        ],
      },
    });

    const onUpdate = vi.fn();
    render(<PollingManager onUpdate={onUpdate} />);
    await flushAndAdvance();

    expect(updateMeetingProcessMock).toHaveBeenCalled();
    const [meetingId, updates] = updateMeetingProcessMock.mock.calls[0];
    expect(meetingId).toBe(meeting.id);
    expect(updates.status).toBe(MEETING_STATUS.TRANSCRIBED);
    expect(updates.segments).toBeInstanceOf(Array);
    expect(updates.speakers).toBeInstanceOf(Array);
  });

  it("mark FAILED khi RunPod trả COMPLETED nhưng output rỗng", async () => {
    const meeting = setupActiveJob();
    checkJobStatusMock.mockResolvedValueOnce({
      status: "COMPLETED",
      output: {},
    });

    const onUpdate = vi.fn();
    render(<PollingManager onUpdate={onUpdate} />);
    await flushAndAdvance();

    expect(updateMeetingProcessMock).toHaveBeenCalled();
    const [meetingId, updates] = updateMeetingProcessMock.mock.calls[0];
    expect(meetingId).toBe(meeting.id);
    expect(updates.status).toBe(MEETING_STATUS.FAILED);
    expect(updates.errorMessage).toMatch(/empty|rỗng/i);
  });

  it("không poll khi không có active job (Phase 4.4 optimization)", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: "user_test_1" },
    });

    onSnapshotImpl.mockImplementation((cb) => {
      cb([]);
      return () => {};
    });

    const onUpdate = vi.fn();
    render(<PollingManager onUpdate={onUpdate} />);
    await flushAndAdvance();

    expect(checkJobStatusMock).not.toHaveBeenCalled();
  });

  it("không hoạt động khi user chưa login", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });

    const onUpdate = vi.fn();
    render(<PollingManager onUpdate={onUpdate} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(checkJobStatusMock).not.toHaveBeenCalled();
    expect(updateMeetingProcessMock).not.toHaveBeenCalled();
  });
});
