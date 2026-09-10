"use client";
import { FileText } from "lucide-react";
import type { Meeting } from "@/app/lib/db";
import MeetingCard from "./MeetingCard";
import EmptyState from "../ui/EmptyState";
import Button from "../ui/Button";
import { MeetingListSkeleton } from "../ui/LoadingSkeleton";

interface MeetingListProps {
  meetings: Meeting[];
  loading: boolean;
  searchQuery: string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  getHighlightedSnippet: (content: string, query: string) => React.ReactNode;
  getSummaryPreview: (summary: string) => string;
  formatDate: (ts: number) => string;
  formatDuration: (sec: number) => string;
  onNavigateToDashboard?: () => void;
}

export default function MeetingList({
  meetings, loading, searchQuery, selectedIds,
  onToggleSelect, getHighlightedSnippet, getSummaryPreview,
  formatDate, formatDuration, onNavigateToDashboard
}: MeetingListProps) {
  if (loading) {
    return <MeetingListSkeleton count={5} />;
  }

  if (meetings.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="w-8 h-8" />}
        title={searchQuery.trim() ? "Không tìm thấy biên bản" : "Chưa có biên bản nào"}
        description={searchQuery.trim() ? "Thử thay đổi từ khóa tìm kiếm." : "Tạo cuộc họp để biên bản xuất hiện ở đây."}
        action={!searchQuery.trim() && onNavigateToDashboard ? (
          <Button variant="primary" onClick={onNavigateToDashboard}>Tạo cuộc họp</Button>
        ) : undefined}
      />
    );
  }

  return (
    <div className="space-y-2 md:space-y-3">
      {meetings.map((meeting) => (
        <MeetingCard
          key={meeting.id}
          meeting={meeting}
          searchQuery={searchQuery}
          isSelected={selectedIds.has(meeting.id)}
          onToggleSelect={(e) => onToggleSelect(meeting.id, e)}
          getHighlightedSnippet={getHighlightedSnippet}
          getSummaryPreview={getSummaryPreview}
          formatDate={formatDate}
          formatDuration={formatDuration}
        />
      ))}
    </div>
  );
}
