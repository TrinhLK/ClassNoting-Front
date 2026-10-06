import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMeeting } from "@/tests/helpers/fixtures";
import { MEETING_STATUS } from "@/app/lib/constants";
import { snapshotMeetingForReprocess } from "@/app/lib/reprocessBackup";
import MeetingDetailState from "@/app/components/MeetingDetailState";

const toastSuccess = vi.fn();
const toastError = vi.fn();
const updateMeetingProcessMock = vi.fn(async () => {});

vi.mock("@/app/context/GlobalUIProvider", () => ({
  useGlobalUI: () => ({
    toast: { success: toastSuccess, error: toastError, info: vi.fn(), warning: vi.fn() },
    confirm: vi.fn(async () => true),
  }),
}));

vi.mock("@/app/hooks/useMeetingDetail", () => ({
  useMeetingDetail: (initialMeeting: { id: string }) => ({
    meeting: initialMeeting,
    setMeeting: vi.fn(),
    showTemplateModal: false,
    setShowTemplateModal: vi.fn(),
    activeTab: "transcript",
    setActiveTab: vi.fn(),
    filteredSpeakerId: null,
    setFilteredSpeakerId: vi.fn(),
    handleShare: vi.fn(),
    handleSummarizeRequest: vi.fn(),
  }),
}));

vi.mock("@/app/hooks/useAudioPlayer", () => ({
  useAudioPlayer: () => ({
    audioRef: { current: null },
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    setCurrentTime: vi.fn(),
    setDuration: vi.fn(),
    togglePlay: vi.fn(),
    seekTo: vi.fn(),
    skipTime: vi.fn(),
    togglePlaybackRate: vi.fn(),
    formatTime: (s: number) => `00:${String(Math.floor(s)).padStart(2, "0")}`,
  }),
}));

vi.mock("@/app/hooks/useExport", () => ({
  useExport: () => ({
    exportTxt: vi.fn(),
    exportDocx: vi.fn(),
    exportPdf: vi.fn(),
    downloadAudio: vi.fn(),
  }),
}));

vi.mock("@/app/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/db")>();
  return { ...actual, updateMeetingProcess: (...args: unknown[]) => updateMeetingProcessMock(...args) };
});

vi.mock("@/app/components/Meeting/Header", () => ({ default: () => <div data-testid="meeting-header" /> }));
vi.mock("@/app/components/Meeting/AudioPlayer", () => ({ default: () => <div data-testid="meeting-audio" /> }));
vi.mock("@/app/components/Meeting/SummaryPanel", () => ({ default: () => <div data-testid="summary-panel" /> }));
vi.mock("@/app/components/Meeting/TabSwitcher", () => ({ default: () => <div data-testid="tab-switcher" /> }));
vi.mock("@/app/components/Meeting/SpeakerFilter", () => ({ default: () => <div data-testid="speaker-filter" /> }));
vi.mock("@/app/components/Meeting/ChatPanel", () => ({ default: () => <div data-testid="chat-panel" /> }));
vi.mock("@/app/components/Meeting/RefinementControl", () => ({ default: () => <div data-testid="refinement" /> }));
vi.mock("@/app/components/TranscriptRow", () => ({ default: () => <div data-testid="transcript-row" /> }));
vi.mock("@/app/components/TemplateManagerModal", () => ({ default: () => null }));
vi.mock("@/app/components/DocsFillModal", () => ({ default: () => null }));

const baseProps = {
  audioSrc: "",
  onBack: vi.fn(),
  onEdit: vi.fn(),
};

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("MeetingDetailState failed banner + restore", () => {
  it("hiện banner lỗi với errorMessage khi FAILED", () => {
    const meeting = mockMeeting({
      status: MEETING_STATUS.FAILED,
      errorMessage: "Job vượt quá thời gian chờ (30 phút).",
    });
    render(<MeetingDetailState meeting={meeting} {...baseProps} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Xử lý thất bại")).toBeTruthy();
    expect(screen.getByText("Job vượt quá thời gian chờ (30 phút).")).toBeTruthy();
    // Không có backup → không có nút khôi phục.
    expect(screen.queryByText(/Khôi phục bản trước/)).toBeNull();
  });

  it("không hiện banner khi meeting OK", () => {
    const meeting = mockMeeting({ status: MEETING_STATUS.COMPLETED });
    render(<MeetingDetailState meeting={meeting} {...baseProps} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("khôi phục bản backup khi bấm nút", async () => {
    const user = userEvent.setup();
    const original = mockMeeting({ status: MEETING_STATUS.COMPLETED, summary: "Tóm tắt cũ" });
    snapshotMeetingForReprocess(original);
    const failed = mockMeeting({
      status: MEETING_STATUS.FAILED,
      errorMessage: "RunPod FAILED",
      segments: [],
      summary: undefined,
    });
    render(<MeetingDetailState meeting={failed} {...baseProps} />);
    await user.click(screen.getByText(/Khôi phục bản trước/));
    expect(updateMeetingProcessMock).toHaveBeenCalledWith(
      failed.id,
      expect.objectContaining({
        status: MEETING_STATUS.COMPLETED,
        summary: "Tóm tắt cũ",
      })
    );
    expect(toastSuccess).toHaveBeenCalledWith("Đã khôi phục bản trước khi xử lý lại.");
  });
});
