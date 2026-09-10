"use client";
import { Search } from "lucide-react";
import Input from "@/app/components/ui/Input";
import Select from "@/app/components/ui/Select";

export type SortBy = "newest" | "oldest" | "title" | "duration";
export type StatusFilter = "all" | "transcribing" | "completed" | "failed" | "draft";

interface MeetingListFilterProps {
  search: string;
  sortBy: SortBy;
  statusFilter: StatusFilter;
  onSearchChange: (v: string) => void;
  onSortChange: (v: SortBy) => void;
  onStatusFilterChange: (v: StatusFilter) => void;
}

export default function MeetingListFilter({
  search, sortBy, statusFilter,
  onSearchChange, onSortChange, onStatusFilterChange
}: MeetingListFilterProps) {
  return (
    <div className="flex flex-col md:flex-row gap-3 mb-4">
      <div className="flex-1">
        <Input
          placeholder="Tìm kiếm cuộc họp..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
        />
      </div>
      <div className="md:w-48">
        <Select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
          options={[
            { value: "all", label: "Tất cả trạng thái" },
            { value: "transcribing", label: "Đang xử lý" },
            { value: "completed", label: "Hoàn thành" },
            { value: "failed", label: "Thất bại" },
            { value: "draft", label: "Bản nháp" },
          ]}
        />
      </div>
      <div className="md:w-48">
        <Select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortBy)}
          options={[
            { value: "newest", label: "Mới nhất" },
            { value: "oldest", label: "Cũ nhất" },
            { value: "title", label: "Theo tên A-Z" },
            { value: "duration", label: "Thời lượng dài nhất" },
          ]}
        />
      </div>
    </div>
  );
}
