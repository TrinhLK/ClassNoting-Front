import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { mockMeeting } from "@/tests/helpers/fixtures";
import { MEETING_STATUS } from "@/app/lib/constants";
import MeetingCard from "@/app/components/Dashboard/MeetingCard";

vi.mock("lucide-react", () => ({
  Calendar: () => <svg data-testid="icon" />,
  Clock: () => <svg data-testid="icon" />,
  RotateCcw: () => <svg data-testid="icon" />,
  Edit3: () => <svg data-testid="icon" />,
  Trash2: () => <svg data-testid="icon" />,
  FolderOpen: () => <svg data-testid="icon" />,
  Loader2: () => <svg data-testid="icon" />,
  Wand2: () => <svg data-testid="icon" />,
  Pencil: () => <svg data-testid="icon" />,
}));

const baseProps = {
  currentTab: "all" as const,
  isSelected: false,
  isFinalizing: false,
  onToggleSelect: vi.fn(),
  onOpen: vi.fn(),
  onReprocess: vi.fn(),
  onFinalizeDraft: vi.fn(),
  onMoveToTrash: vi.fn(),
  onRestore: vi.fn(),
  onDeleteForever: vi.fn(),
};

describe("MeetingCard failed state", () => {
  it("hiện errorMessage khi meeting FAILED", () => {
    const meeting = mockMeeting({
      status: MEETING_STATUS.FAILED,
      errorMessage: "Job vượt quá thời gian chờ (30 phút).",
    });
    render(<MeetingCard meeting={meeting} {...baseProps} />);
    expect(screen.getByText("Job vượt quá thời gian chờ (30 phút).")).toBeTruthy();
  });

  it("không hiện dòng lỗi khi meeting không FAILED hoặc không có errorMessage", () => {
    const ok = mockMeeting({ status: MEETING_STATUS.COMPLETED });
    const { unmount } = render(<MeetingCard meeting={ok} {...baseProps} />);
    expect(screen.queryByText(/Job vượt quá/)).toBeNull();
    unmount();

    const failedNoMsg = mockMeeting({ status: MEETING_STATUS.FAILED, errorMessage: undefined });
    render(<MeetingCard meeting={failedNoMsg} {...baseProps} />);
    // Chỉ có badge "Lỗi", không có dòng message rỗng.
    expect(screen.getByText("Lỗi")).toBeTruthy();
  });
});
