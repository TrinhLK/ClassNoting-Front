import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMeeting } from "@/tests/helpers/fixtures";
import { MEETING_STATUS } from "@/app/lib/constants";

vi.mock("lucide-react", () => ({
  Calendar: () => <svg data-testid="icon-calendar" />,
  Search: () => <svg data-testid="icon-search" />,
  Trash2: () => <svg data-testid="icon-trash" />,
}));

vi.mock("@/app/components/Dashboard/MeetingListFilter", () => ({
  default: ({
    search,
    sortBy,
    statusFilter,
    onSearchChange,
    onSortChange,
    onStatusFilterChange,
  }: {
    search: string;
    sortBy: string;
    statusFilter: string;
    onSearchChange: (value: string) => void;
    onSortChange: (value: string) => void;
    onStatusFilterChange: (value: string) => void;
  }) => (
    <div data-testid="meeting-list-filter">
      <input
        aria-label="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <select
        aria-label="status"
        value={statusFilter}
        onChange={(event) => onStatusFilterChange(event.target.value)}
      >
        <option value="all">all</option>
        <option value="completed">completed</option>
        <option value="failed">failed</option>
      </select>
      <select
        aria-label="sort"
        value={sortBy}
        onChange={(event) => onSortChange(event.target.value)}
      >
        <option value="newest">newest</option>
        <option value="oldest">oldest</option>
      </select>
    </div>
  ),
}));

vi.mock("@/app/components/Dashboard/MeetingCard", () => ({
  default: ({ meeting }: { meeting: { id: string } }) => (
    <div data-testid="meeting-card" data-id={meeting.id} />
  ),
}));

vi.mock("@/app/components/ui/BulkActionBar", () => ({
  default: ({ onClear }: { onClear: () => void }) => (
    <div data-testid="bulk-action-bar">
      <button onClick={onClear}>Bỏ chọn</button>
    </div>
  ),
}));

vi.mock("@/app/components/ui/EmptyState", () => ({
  default: ({ title, action }: { title: string; action?: ReactNode }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      {action}
    </div>
  ),
}));

vi.mock("@/app/components/ui/Button", () => ({
  default: ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

import MeetingListView from "@/app/components/Dashboard/MeetingListView";

type MeetingListViewProps = ComponentProps<typeof MeetingListView>;

const defaultProps: MeetingListViewProps = {
  meetings: [],
  currentTab: "all",
  selectedIds: [],
  loading: false,
  loadingMore: false,
  isFinalizing: null,
  hasMore: false,
  onLoadMore: vi.fn(),
  onToggleSelect: vi.fn(),
  onToggleSelectAll: vi.fn(),
  onOpenMeeting: vi.fn(),
  onReprocess: vi.fn(),
  onFinalizeDraft: vi.fn(),
  onMoveToTrash: vi.fn(),
  onRestore: vi.fn(),
  onDeleteForever: vi.fn(),
  onMoveSelectedToTrash: vi.fn(),
  onDeleteSelected: vi.fn(),
  onEmptyTrash: vi.fn(),
  onClearSelection: vi.fn(),
};

const renderMeetingListView = (overrides: Partial<MeetingListViewProps> = {}) =>
  render(<MeetingListView {...defaultProps} {...overrides} />);

const completedMeetings = [
  mockMeeting({ id: "meeting_1", status: MEETING_STATUS.COMPLETED }),
  mockMeeting({ id: "meeting_2", status: MEETING_STATUS.COMPLETED }),
];

describe("MeetingListView", () => {
  it("vẫn hiển thị filter khi filtered=0 nhưng có meetings", async () => {
    const user = userEvent.setup();
    renderMeetingListView({ meetings: completedMeetings });

    await user.selectOptions(screen.getByLabelText("status"), "failed");

    expect(screen.getByTestId("meeting-list-filter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xóa bộ lọc" })).toBeInTheDocument();
    expect(screen.getByText("Không có kết quả phù hợp")).toBeInTheDocument();
  });

  it("không hiển thị filter khi meetings rỗng", () => {
    renderMeetingListView();

    expect(screen.queryByTestId("meeting-list-filter")).not.toBeInTheDocument();
    expect(screen.getByText("Chưa có cuộc họp nào")).toBeInTheDocument();
  });

  it("click Xóa bộ lọc reset về mặc định", async () => {
    const user = userEvent.setup();
    renderMeetingListView({ meetings: completedMeetings });

    await user.type(screen.getByLabelText("search"), "Cuộc họp");
    await user.selectOptions(screen.getByLabelText("status"), "failed");
    await user.selectOptions(screen.getByLabelText("sort"), "oldest");
    await user.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));

    expect(screen.getByLabelText("status")).toHaveValue("all");
    expect(screen.getByLabelText("search")).toHaveValue("");
    expect(screen.getByLabelText("sort")).toHaveValue("newest");
  });

  it("tab trash không hiển thị filter", () => {
    renderMeetingListView({
      currentTab: "trash",
      meetings: [mockMeeting({ id: "trashed_1", isDeleted: true })],
    });

    expect(screen.queryByTestId("meeting-list-filter")).not.toBeInTheDocument();
    expect(screen.getByTestId("meeting-card")).toHaveAttribute("data-id", "trashed_1");
  });

  it("loading=true hiển thị skeleton", () => {
    const { container } = renderMeetingListView({ loading: true });

    expect(screen.queryByTestId("meeting-list-filter")).not.toBeInTheDocument();
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(5);
  });

  it("tab trash không bị ảnh hưởng bởi filter stale từ tab all (fix #1)", async () => {
    const user = userEvent.setup();
    const trashedMeetings = [
      mockMeeting({ id: "trashed_1", status: MEETING_STATUS.COMPLETED, isDeleted: true }),
      mockMeeting({ id: "trashed_2", status: MEETING_STATUS.COMPLETED, isDeleted: true }),
    ];

    const { rerender } = renderMeetingListView({ meetings: completedMeetings, currentTab: "all" });

    await user.selectOptions(screen.getByLabelText("status"), "failed");

    rerender(
      <MeetingListView {...defaultProps} meetings={trashedMeetings} currentTab="trash" />
    );

    expect(screen.queryByTestId("meeting-list-filter")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("meeting-card")).toHaveLength(2);
  });

  it("tab trash với meetings rỗng hiển thị 'Thùng rác trống'", () => {
    renderMeetingListView({ currentTab: "trash", meetings: [] });

    expect(screen.getByText("Thùng rác trống")).toBeInTheDocument();
  });

  it("Tải thêm vẫn hiển thị khi filtered=0 và hasMore=true (fix #2)", async () => {
    const user = userEvent.setup();
    renderMeetingListView({ meetings: completedMeetings, hasMore: true });

    await user.selectOptions(screen.getByLabelText("status"), "failed");

    expect(screen.getByRole("button", { name: "Tải thêm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xóa bộ lọc" })).toBeInTheDocument();
    expect(screen.queryByTestId("meeting-card")).not.toBeInTheDocument();
  });

  it("Bỏ chọn gọi onClearSelection thay vì toggle select all (fix #3)", async () => {
    const user = userEvent.setup();
    const onClearSelection = vi.fn();
    renderMeetingListView({
      meetings: completedMeetings,
      selectedIds: ["meeting_1"],
      onClearSelection,
    });

    await user.click(screen.getByRole("button", { name: "Bỏ chọn" }));

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("click Xóa bộ lọc hiển thị lại meeting cards", async () => {
    const user = userEvent.setup();
    renderMeetingListView({ meetings: completedMeetings });

    await user.selectOptions(screen.getByLabelText("status"), "failed");
    expect(screen.queryByTestId("meeting-card")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));

    expect(screen.getAllByTestId("meeting-card")).toHaveLength(2);
  });

  it("filter state resets khi quay lại tab all (fix #1)", async () => {
    const user = userEvent.setup();
    const trashedMeetings = [
      mockMeeting({ id: "trashed_1", status: MEETING_STATUS.COMPLETED, isDeleted: true }),
    ];

    const { rerender } = renderMeetingListView({ meetings: completedMeetings, currentTab: "all" });

    await user.type(screen.getByLabelText("search"), "Cuộc họp");
    await user.selectOptions(screen.getByLabelText("status"), "failed");

    rerender(
      <MeetingListView {...defaultProps} meetings={trashedMeetings} currentTab="trash" />
    );

    rerender(
      <MeetingListView {...defaultProps} meetings={completedMeetings} currentTab="all" />
    );

    expect(screen.getByLabelText("search")).toHaveValue("");
    expect(screen.getByLabelText("status")).toHaveValue("all");
    expect(screen.getAllByTestId("meeting-card")).toHaveLength(2);
  });

  it("BulkActionBar vẫn hiển thị khi selectedIds > 0 dù filtered = 0 (fix #4)", async () => {
    const user = userEvent.setup();
    const onClearSelection = vi.fn();
    renderMeetingListView({
      meetings: completedMeetings,
      selectedIds: ["meeting_1"],
      onClearSelection,
    });

    await user.selectOptions(screen.getByLabelText("status"), "failed");

    expect(screen.getByTestId("meeting-list-filter")).toBeInTheDocument();
    expect(screen.getByText("Không có kết quả phù hợp")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-action-bar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Bỏ chọn" }));

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("BulkActionBar ẩn khi selectedIds rỗng", () => {
    renderMeetingListView({
      meetings: completedMeetings,
      selectedIds: [],
    });

    expect(screen.queryByTestId("bulk-action-bar")).not.toBeInTheDocument();
  });

  it("sort deterministic khi các meeting có cùng createdAt (fix #3)", () => {
    const sameCreatedMeetings = [
      mockMeeting({ id: "meeting_1", status: MEETING_STATUS.COMPLETED, createdAt: 1700000000000 }),
      mockMeeting({ id: "meeting_2", status: MEETING_STATUS.COMPLETED, createdAt: 1700000000000 }),
      mockMeeting({ id: "meeting_3", status: MEETING_STATUS.COMPLETED, createdAt: 1700000000000 }),
    ];

    renderMeetingListView({ meetings: sameCreatedMeetings });

    const cards = screen.getAllByTestId("meeting-card");
    expect(cards).toHaveLength(3);
    expect(cards.map(c => c.getAttribute("data-id"))).toEqual([
      "meeting_1",
      "meeting_2",
      "meeting_3",
    ]);
  });
});
