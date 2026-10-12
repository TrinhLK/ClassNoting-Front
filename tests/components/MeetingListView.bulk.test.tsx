import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { mockMeeting } from "@/tests/helpers/fixtures";
vi.mock("@/app/components/Dashboard/MeetingCard", () => ({ default: ({ meeting, isSelected, onToggleSelect }: any) => <label><input type="checkbox" aria-label={meeting.title} checked={isSelected} onChange={onToggleSelect} />{meeting.title}</label> }));
import MeetingListView from "@/app/components/Dashboard/MeetingListView";
it("selects only matching meetings, offers inline bulk delete and clears selection on filter change", () => {
  const remove = vi.fn();
  function Harness() {
    const [selected, select] = useState<string[]>([]);
    return <MeetingListView meetings={[mockMeeting({ id: "a", title: "Họp tuần" }), mockMeeting({ id: "b", title: "Họp tháng" })]} currentTab="all" selectedIds={selected}
      loading={false} isFinalizing={null} hasMore={false} onLoadMore={vi.fn()} onToggleSelect={id => select(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id])}
      onToggleSelectAll={vi.fn()} onOpenMeeting={vi.fn()} onReprocess={vi.fn()} onFinalizeDraft={vi.fn()} onMoveToTrash={vi.fn()} onRestore={vi.fn()} onDeleteForever={vi.fn()}
      onMoveSelectedToTrash={remove} onDeleteSelected={vi.fn()} onEmptyTrash={vi.fn()} onClearSelection={() => select([])} />;
  }
  render(<Harness />);
  fireEvent.change(screen.getByPlaceholderText("Tìm kiếm cuộc họp..."), { target: { value: "tuần" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn tất cả cuộc họp đang hiển thị" }));
  expect(screen.getByRole("checkbox", { name: "Họp tuần" })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Xóa 1 cuộc họp đã chọn" }));
  expect(remove).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByPlaceholderText("Tìm kiếm cuộc họp..."), { target: { value: "" } });
  expect(screen.getByRole("checkbox", { name: "Họp tháng" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Họp tuần" })).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn tất cả cuộc họp đang hiển thị" }));
  expect(screen.getByRole("button", { name: "Xóa 2 cuộc họp đã chọn" })).toBeInTheDocument();
});
