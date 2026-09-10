"use client";
import { useState, useMemo, useCallback } from "react";
import type { Meeting } from "@/app/lib/db";
import { Calendar, Search, Trash2 } from "lucide-react";
import MeetingCard from "./MeetingCard";
import MeetingListFilter, { type SortBy, type StatusFilter } from "./MeetingListFilter";
import BulkActionBar from "@/app/components/ui/BulkActionBar";
import EmptyState from "@/app/components/ui/EmptyState";
import Button from "@/app/components/ui/Button";

type DashboardTab = "all" | "trash";

interface MeetingListViewProps {
  meetings: Meeting[];
  currentTab: DashboardTab;
  selectedIds: string[];
  loading: boolean;
  loadingMore?: boolean;
  isFinalizing: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpenMeeting: (m: Meeting) => void;
  onReprocess: (m: Meeting) => void;
  onFinalizeDraft: (m: Meeting) => void;
  onMoveToTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onRename?: (m: Meeting, newTitle: string) => void;
  onMoveSelectedToTrash: () => void;
  onDeleteSelected: () => void;
  onEmptyTrash: () => void;
  onClearSelection: () => void;
  onNavigateToUpload?: () => void;
  onNavigateToLive?: () => void;
}

export default function MeetingListView({
  meetings, currentTab, selectedIds, loading, loadingMore, isFinalizing, hasMore, onLoadMore,
  onToggleSelect, onOpenMeeting, onReprocess, onFinalizeDraft,
  onMoveToTrash, onRestore, onDeleteForever, onRename,
  onMoveSelectedToTrash, onDeleteSelected, onEmptyTrash, onClearSelection,
  onNavigateToUpload, onNavigateToLive
}: MeetingListViewProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [prevTab, setPrevTab] = useState(currentTab);

  if (prevTab !== currentTab) {
    setPrevTab(currentTab);
    setSearch("");
    setStatusFilter("all");
    setSortBy("newest");
  }

  const filteredMeetings = useMemo(() => {
    let result = meetings;
    if (currentTab === "all") {
      if (search.trim()) {
        const q = search.toLowerCase();
        result = result.filter(m => m.title.toLowerCase().includes(q));
      }
      if (statusFilter !== "all") {
        result = result.filter(m => m.status === statusFilter);
      }
    }
    result = [...result].sort((a, b) => {
      let primary = 0;
      switch (sortBy) {
        case "newest": primary = b.createdAt - a.createdAt; break;
        case "oldest": primary = a.createdAt - b.createdAt; break;
        case "title": primary = a.title.localeCompare(b.title); break;
        case "duration": primary = (b.duration || 0) - (a.duration || 0); break;
        default: primary = 0;
      }
      return primary !== 0 ? primary : a.id.localeCompare(b.id);
    });
    return result;
  }, [meetings, currentTab, search, sortBy, statusFilter]);

  const resetFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setSortBy("newest");
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-1/2" />
                <div className="h-3 bg-slate-100 rounded w-1/4" />
              </div>
              <div className="h-6 w-16 rounded-full bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const showFilter = currentTab === "all" && meetings.length > 0;

  return (
    <div>
      {showFilter && (
        <MeetingListFilter
          search={search}
          sortBy={sortBy}
          statusFilter={statusFilter}
          onSearchChange={setSearch}
          onSortChange={setSortBy}
          onStatusFilterChange={setStatusFilter}
        />
      )}

      {filteredMeetings.length === 0 ? (
        currentTab === "trash" ? (
          <EmptyState
            icon={<Trash2 className="w-8 h-8" />}
            title="Thùng rác trống"
            description="Các cuộc họp đã xóa sẽ xuất hiện ở đây."
          />
        ) : meetings.length === 0 ? (
          <EmptyState
            icon={<Calendar className="w-8 h-8" />}
            title="Chưa có cuộc họp nào"
            description="Tải lên file audio hoặc ghi âm trực tiếp để bắt đầu."
            action={
              <div className="flex gap-3">
                {onNavigateToUpload && (
                  <Button variant="primary" onClick={onNavigateToUpload}>Tải file lên</Button>
                )}
                {onNavigateToLive && (
                  <Button variant="outline" onClick={onNavigateToLive}>Ghi âm trực tiếp</Button>
                )}
              </div>
            }
          />
        ) : (
          <EmptyState
            icon={<Search className="w-8 h-8" />}
            title="Không có kết quả phù hợp"
            description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."
            action={<Button variant="primary" onClick={resetFilters}>Xóa bộ lọc</Button>}
          />
        )
      ) : (
        <div id="tour-list" className="space-y-2 md:space-y-3">
          {currentTab === "trash" && (
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">{meetings.length} mục trong thùng rác</p>
              <Button variant="danger" size="sm" onClick={onEmptyTrash}>Dọn sạch thùng rác</Button>
            </div>
          )}

          {filteredMeetings.map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              currentTab={currentTab}
              isSelected={selectedIds.includes(m.id)}
              isFinalizing={isFinalizing === m.id}
              onToggleSelect={() => onToggleSelect(m.id)}
              onOpen={() => onOpenMeeting(m)}
              onReprocess={() => onReprocess(m)}
              onFinalizeDraft={() => onFinalizeDraft(m)}
              onMoveToTrash={() => onMoveToTrash(m.id)}
              onRestore={() => onRestore(m.id)}
              onDeleteForever={() => onDeleteForever(m.id)}
              onRename={onRename ? (newTitle) => onRename(m, newTitle) : undefined}
            />
          ))}
        </div>
      )}

      {selectedIds.length > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.length}
          actions={
            currentTab === "all"
              ? [{ label: "Xóa đã chọn", icon: <Trash2 className="w-4 h-4" />, onClick: onMoveSelectedToTrash, intent: "danger" }]
              : [{ label: "Xóa vĩnh viễn", icon: <Trash2 className="w-4 h-4" />, onClick: onDeleteSelected, intent: "danger" }]
          }
          onClear={onClearSelection}
        />
      )}

      {hasMore && currentTab === "all" && (
        <div className="text-center py-4">
          <Button variant="outline" onClick={onLoadMore} loading={loadingMore} disabled={loadingMore}>
            {loadingMore ? "Đang tải..." : "Tải thêm"}
          </Button>
        </div>
      )}
    </div>
  );
}
