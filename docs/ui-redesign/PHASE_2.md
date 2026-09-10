# Phase 2 — Dashboard Redesign

> **Tham chiếu:** Plan tổng thể ở [`UI-IMPROVEMENT-PLAN.md`](./UI-IMPROVEMENT-PLAN.md) Phần B. File này ghi lại chi tiết implementation Phase 2.
> **Yêu cầu:** Phase 0 + Phase 1 hoàn thành.

## Tổng quan

| Sub-phase | Nội dung | Trạng thái |
|-----------|----------|-----------|
| **2.1 Tạo `HeroCard`** | Card CTA chính (Upload/Live) | ⏳ |
| **2.2 Redesign `StatsCards.tsx`** | 1 hero + 4 stat cards | ⏳ |
| **2.3 Tạo `MeetingCard.tsx`** | Card-based list (1 phiên bản duy nhất) | ⏳ |
| **2.4 Tạo `MeetingListFilter.tsx`** | Search + sort + status filter | ⏳ |
| **2.5 Tạo `BulkActionBar.tsx`** | Floating bulk actions | ⏳ |
| **2.6 Redesign `MeetingListView.tsx`** | Dùng các component mới | ⏳ |
| **2.7 Gộp `UploadModal` + `LiveSetupModal`** | Thành `RecordSetupModal` | ⏳ |
| **2.8 Redesign `BotJoinModal`** | Dùng `<Modal>` | ⏳ |
| **2.9 Redesign `DriveImportModal`** | Dùng `<Modal>` | ⏳ |
| **2.10 Refactor `app/(dashboard)/page.tsx`** | Tách upload logic | ⏳ |
| **2.11 Tạo `useUpload` hook** | Tách logic upload | ⏳ |
| **2.12 Tạo `UploadProgressToast`** | Replace inline progress | ⏳ |
| **Verify** | Build + Lint + Test | ⏳ |

**Tổng effort ước tính:** 2-3 ngày
**Số commits khuyến nghị:** 3-4 commit (Stats, List, Modals, Cleanup)

---

## 2.1 Tạo `HeroCard`

### Lý do
- 2 CTA chính (Upload/Live) cần nổi bật, không phải border-dashed
- Pattern sẽ dùng ở Dashboard và có thể share cho các page khác sau

### File: `app/components/Dashboard/HeroCard.tsx` (MỚI)
```tsx
"use client";
import { cn } from "@/app/lib/cn";
import type { ReactNode } from "react";

interface HeroCardProps {
  title: string;
  description?: string;
  icon: ReactNode;
  primaryAction: { label: string; onClick: () => void; icon?: ReactNode };
  secondaryAction?: { label: string; onClick: () => void; icon?: ReactNode };
  stepNumber?: number;
  totalSteps?: number;
  className?: string;
}

export default function HeroCard({
  title, description, icon, primaryAction, secondaryAction,
  stepNumber, totalSteps, className
}: HeroCardProps) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border border-primary-100",
      "bg-gradient-to-br from-primary-50 via-white to-primary-50/50",
      "p-6 md:p-8",
      className
    )}>
      {/* Decorative blob */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary-200 rounded-full opacity-30 blur-3xl" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-primary-300 rounded-full opacity-20 blur-3xl" />

      <div className="relative flex flex-col md:flex-row md:items-center gap-6">
        {/* Icon */}
        <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-primary-600 text-white flex items-center justify-center shadow-lg shrink-0">
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {stepNumber && totalSteps && (
            <p className="text-[10px] font-bold text-primary-600 uppercase tracking-wider mb-1">
              Bước {stepNumber} / {totalSteps}
            </p>
          )}
          <h2 className="text-lg md:text-xl font-bold text-slate-800 mb-1">{title}</h2>
          {description && (
            <p className="text-sm text-slate-600 max-w-md">{description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          {secondaryAction && (
            <Button
              intent="outline"
              size="md"
              onClick={secondaryAction.onClick}
              leftIcon={secondaryAction.icon}
            >
              {secondaryAction.label}
            </Button>
          )}
          <Button
            intent="primary"
            size="md"
            onClick={primaryAction.onClick}
            leftIcon={primaryAction.icon}
          >
            {primaryAction.label}
          </Button>
        </div>
      </div>
    </div>
  );
}

// NOTE: Import Button from ui/Button
import Button from "@/app/components/ui/Button";
```

### Kết quả
- ✅ Hero card gradient, có 1-2 CTA, có stepper
- ✅ Replace border-dashed cũ

---

## 2.2 Redesign `StatsCards.tsx`

### Lý do
- Bỏ border-dashed → dùng HeroCard (2.1) + StatCard (Phase 0)
- Cấu trúc: 1 HeroCard (CTA) + 4 StatCard (KPI)

### File: `app/components/Dashboard/StatsCards.tsx` (CẬP NHẬT hoàn toàn)
```tsx
"use client";
import { useRef } from "react";
import {
  UploadCloud, Mic, Calendar, Clock, Loader2, Trash2, Sparkles
} from "lucide-react";
import HeroCard from "./HeroCard";
import StatCard from "@/app/components/ui/StatCard";
import SegmentedControl from "@/app/components/ui/SegmentedControl";

interface StatsCardsProps {
  totalMeetings: number;
  totalDuration: number;  // seconds
  processingCount: number;
  trashCount: number;
  uploadLanguage: "vi" | "en";
  liveLanguage: "vi" | "en";
  onUploadLanguageChange: (lang: "vi" | "en") => void;
  onLiveLanguageChange: (lang: "vi" | "en") => void;
  onFileSelected: (file: File) => void;
  onLiveClick: () => void;
}

export default function StatsCards({
  totalMeetings, totalDuration, processingCount, trashCount,
  uploadLanguage, liveLanguage,
  onUploadLanguageChange, onLiveLanguageChange,
  onFileSelected, onLiveClick
}: StatsCardsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatDuration = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div className="space-y-4 md:space-y-6 mb-6 md:mb-8">
      {/* Hero CTA */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="audio/*"
        onChange={handleFileChange}
      />
      <HeroCard
        icon={<Sparkles className="w-7 h-7 md:w-8 md:h-8" />}
        title="Bắt đầu một cuộc họp mới"
        description="Tải lên file ghi âm có sẵn hoặc ghi âm trực tiếp. AI sẽ tự động phiên âm, phân biệt người nói và tóm tắt."
        stepNumber={1}
        totalSteps={3}
        primaryAction={{
          label: "Tải file lên",
          icon: <UploadCloud className="w-4 h-4" />,
          onClick: () => fileInputRef.current?.click(),
        }}
        secondaryAction={{
          label: "Ghi âm trực tiếp",
          icon: <Mic className="w-4 h-4" />,
          onClick: onLiveClick,
        }}
      />

      {/* 4 Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          icon={<Calendar className="w-5 h-5" />}
          label="Tổng cuộc họp"
          value={totalMeetings}
          intent="primary"
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Tổng thời lượng"
          value={formatDuration(totalDuration)}
          intent="success"
        />
        <StatCard
          icon={<Loader2 className="w-5 h-5" />}
          label="Đang xử lý"
          value={processingCount}
          intent="warning"
        />
        <StatCard
          icon={<Trash2 className="w-5 h-5" />}
          label="Thùng rác"
          value={trashCount}
          intent="danger"
        />
      </div>

      {/* Language segmented control (compact, hidden by default, show in expanded settings) */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Ngôn ngữ upload:</span>
        <SegmentedControl
          options={[
            { value: "vi", label: "🇻🇳 VI" },
            { value: "en", label: "🇬🇧 EN" },
          ]}
          value={uploadLanguage}
          onChange={onUploadLanguageChange}
          size="sm"
        />
        <span className="ml-2">Ngôn ngữ live:</span>
        <SegmentedControl
          options={[
            { value: "vi", label: "🇻🇳 VI" },
            { value: "en", label: "🇬🇧 EN" },
          ]}
          value={liveLanguage}
          onChange={onLiveLanguageChange}
          size="sm"
        />
      </div>
    </div>
  );
}
```

### Kết quả
- ✅ Hero card nổi bật, không còn border-dashed
- ✅ 4 stat cards với icon + value + intent
- ✅ Language dùng SegmentedControl (đẹp hơn `<select>`)

### Cập nhật caller
File `app/components/DashboardState.tsx` cần pass thêm props:
```tsx
<StatsCards
  totalMeetings={meetings.filter(m => !m.isDeleted).length}
  totalDuration={meetings.filter(m => !m.isDeleted).reduce((sum, m) => sum + (m.duration || 0), 0)}
  processingCount={meetings.filter(m => [MEETING_STATUS.TRANSCRIBING, MEETING_STATUS.SUMMARIZING].includes(m.status)).length}
  trashCount={meetings.filter(m => m.isDeleted).length}
  uploadLanguage={uploadLanguage}
  ...
/>
```

---

## 2.3 Tạo `MeetingCard.tsx`

### Lý do
- Replace 2 phiên bản (table + card) trong `MeetingListView.tsx:149-322`
- 1 component responsive dùng được cả desktop + mobile
- Action bar LUÔN hiển thị (touch-friendly)

### File: `app/components/Dashboard/MeetingCard.tsx` (MỚI)
```tsx
"use client";
import { useRouter } from "next/navigation";
import {
  Calendar, Clock, RotateCcw, Edit3, Trash2, RotateCcw as RestoreIcon,
  Eye, Loader2, Wand2, FolderOpen
} from "lucide-react";
import type { Meeting } from "@/app/lib/db";
import { MEETING_STATUS } from "@/app/lib/constants";
import { cn } from "@/app/lib/cn";
import Avatar from "@/app/components/ui/Avatar";
import Badge from "@/app/components/ui/Badge";
import Tooltip from "@/app/components/ui/Tooltip";
import Button from "@/app/components/ui/Button";

interface MeetingCardProps {
  meeting: Meeting;
  currentTab: "all" | "trash";
  isSelected: boolean;
  isFinalizing: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onReprocess: () => void;
  onFinalizeDraft: () => void;
  onMoveToTrash: () => void;
  onRestore: () => void;
  onDeleteForever: () => void;
}

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export default function MeetingCard({
  meeting, currentTab, isSelected, isFinalizing,
  onToggleSelect, onOpen, onReprocess, onFinalizeDraft,
  onMoveToTrash, onRestore, onDeleteForever
}: MeetingCardProps) {
  const router = useRouter();
  const isInteractive = [
    MEETING_STATUS.TRANSCRIBED, MEETING_STATUS.SUMMARIZING,
    MEETING_STATUS.COMPLETED, MEETING_STATUS.FAILED, MEETING_STATUS.DRAFT
  ].includes(meeting.status);

  const avatarColor = meeting.status === MEETING_STATUS.FAILED
    ? { bg: "bg-red-100", text: "text-red-600" }
    : meeting.status === MEETING_STATUS.COMPLETED
    ? { bg: "bg-emerald-100", text: "text-emerald-700" }
    : meeting.status === MEETING_STATUS.TRANSCRIBING
    ? { bg: "bg-blue-100", text: "text-blue-600" }
    : { bg: "bg-primary-100", text: "text-primary-600" };

  return (
    <div
      onClick={() => isInteractive && onOpen()}
      className={cn(
        "group bg-white rounded-2xl border p-4 transition-all",
        isSelected
          ? "border-primary-300 bg-primary-50/30 ring-2 ring-primary-200"
          : "border-slate-200 hover:border-slate-300 hover:shadow-sm",
        isInteractive ? "cursor-pointer" : "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          className="mt-1 shrink-0"
          aria-label={isSelected ? "Bỏ chọn" : "Chọn"}
        >
          <div className={cn(
            "w-4 h-4 rounded border-2 transition-colors flex items-center justify-center",
            isSelected
              ? "bg-primary-600 border-primary-600"
              : "bg-white border-slate-300 group-hover:border-primary-400"
          )}>
            {isSelected && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
              </svg>
            )}
          </div>
        </button>

        {/* Avatar */}
        <Avatar name={meeting.title} size="md" colorScheme={avatarColor} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-800 truncate">{meeting.title}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(meeting.createdAt).toLocaleDateString("vi-VN")}
            </span>
            <span className="flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3" />
              {formatDuration(meeting.duration)}
            </span>
          </div>
          <div className="mt-2">
            <Badge status={meeting.status} />
          </div>
        </div>

        {/* Actions (always visible) */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {currentTab === "all" && [MEETING_STATUS.COMPLETED, MEETING_STATUS.TRANSCRIBED, MEETING_STATUS.FAILED].includes(meeting.status) && (
            <Tooltip content="Xử lý lại">
              <button
                onClick={onReprocess}
                className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </Tooltip>
          )}

          {meeting.status === MEETING_STATUS.DRAFT && (
            <Tooltip content="Lưu lên cloud">
              <button
                onClick={onFinalizeDraft}
                disabled={isFinalizing}
                className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              </button>
            </Tooltip>
          )}

          {[MEETING_STATUS.COMPLETED, MEETING_STATUS.TRANSCRIBED].includes(meeting.status) && (
            <Tooltip content="Xem / Sửa">
              <button
                onClick={onOpen}
                className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </Tooltip>
          )}

          {currentTab === "all" && (
            <Tooltip content="Xóa">
              <button
                onClick={onMoveToTrash}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </Tooltip>
          )}

          {currentTab === "trash" && (
            <>
              <Tooltip content="Khôi phục">
                <button
                  onClick={onRestore}
                  className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                >
                  <RestoreIcon className="w-4 h-4" />
                </button>
              </Tooltip>
              <Tooltip content="Xóa vĩnh viễn">
                <button
                  onClick={onDeleteForever}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Kết quả
- ✅ 1 component dùng cả desktop + mobile (responsive với `flex-wrap` của metadata)
- ✅ Action bar luôn hiển thị (touch-friendly)
- ✅ Tooltip giải thích action

---

## 2.4 Tạo `MeetingListFilter.tsx`

### Lý do
- Filter bar phía trên list: search + sort + status filter
- Hiện không có → khó tìm meeting khi list dài

### File: `app/components/Dashboard/MeetingListFilter.tsx` (MỚI)
```tsx
"use client";
import { Search, ArrowUpDown, Filter } from "lucide-react";
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
```

### Kết quả
- ✅ Search + status filter + sort
- ✅ Filter state quản lý trong `DashboardState`

---

## 2.5 Tạo `BulkActionBar.tsx`

### Lý do
- Khi select nhiều meeting, cần floating action bar
- Đã có pattern ở `MinutesState.tsx:339-396` → extract ra component riêng

### File: `app/components/ui/BulkActionBar.tsx` (MỚI — nằm trong ui vì reusable)
```tsx
"use client";
import { X } from "lucide-react";
import { cn } from "@/app/lib/cn";
import type { ReactNode } from "react";

interface BulkActionProps {
  label?: string;
  icon?: ReactNode;
  onClick: () => void;
  intent?: "primary" | "success" | "warning" | "danger" | "neutral";
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  actions: BulkActionProps[];
  onClear: () => void;
  className?: string;
}

const intentMap = {
  primary: "text-primary-300 hover:text-white",
  success: "text-emerald-300 hover:text-white",
  warning: "text-amber-300 hover:text-white",
  danger:  "text-red-300 hover:text-white",
  neutral: "text-slate-300 hover:text-white",
};

export default function BulkActionBar({
  selectedCount, actions, onClear, className
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className={cn(
      "fixed bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-50",
      "bg-slate-900 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-full shadow-xl",
      "flex items-center gap-3 md:gap-6 animate-in slide-in-from-bottom-4",
      "w-[90%] md:w-auto max-w-sm md:max-w-none justify-between md:justify-start",
      className
    )}>
      <span className="font-semibold text-xs md:text-sm whitespace-nowrap">
        Đã chọn {selectedCount}
      </span>
      <div className="h-4 md:h-6 w-px bg-slate-700" />
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={action.onClick}
          disabled={action.disabled}
          className={cn(
            "flex items-center gap-1.5 md:gap-2 font-bold text-xs md:text-sm whitespace-nowrap transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            intentMap[action.intent || "primary"]
          )}
        >
          {action.icon}
          <span className="hidden sm:inline">{action.label}</span>
        </button>
      ))}
      <div className="h-4 md:h-6 w-px bg-slate-700" />
      <button
        onClick={onClear}
        className="text-slate-500 hover:text-white transition-colors"
        aria-label="Bỏ chọn"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
```

### Kết quả
- ✅ Reusable cho Minutes (Phase 4) và Dashboard

---

## 2.6 Redesign `MeetingListView.tsx`

### Lý do
- Bỏ 2 phiên bản (table + card) → dùng `MeetingCard`
- Dùng `BulkActionBar` thay inline div

### File: `app/components/Dashboard/MeetingListView.tsx` (CẬP NHẬT)
```tsx
"use client";
import { useState, useMemo } from "react";
import type { Meeting } from "@/app/lib/db";
import { MEETING_STATUS, type MeetingStatus } from "@/app/lib/constants";
import { Calendar } from "lucide-react";
import MeetingCard from "./MeetingCard";
import MeetingListFilter, { type SortBy, type StatusFilter } from "./MeetingListFilter";
import BulkActionBar from "@/app/components/ui/BulkActionBar";
import EmptyState from "@/app/components/ui/EmptyState";
import Spinner from "@/app/components/ui/Spinner";
import Button from "@/app/components/ui/Button";
import { Trash2, MoveToTrash } from "lucide-react";

type DashboardTab = "all" | "trash";

interface MeetingListViewProps {
  meetings: Meeting[];
  currentTab: DashboardTab;
  selectedIds: string[];
  loading: boolean;
  isFinalizing: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onToggleSelect: (id: string) => void;
  onOpenMeeting: (m: Meeting) => void;
  onReprocess: (m: Meeting) => void;
  onFinalizeDraft: (e: React.MouseEvent, m: Meeting) => void;
  onMoveToTrash: (e: React.MouseEvent, id: string) => void;
  onRestore: (e: React.MouseEvent, id: string) => void;
  onDeleteForever: (e: React.MouseEvent, id: string) => void;
  onMoveSelectedToTrash: () => void;
  onDeleteSelected: () => void;
  onEmptyTrash: () => void;
  onNavigateToUpload?: () => void;
  onNavigateToLive?: () => void;
}

export default function MeetingListView({
  meetings, currentTab, selectedIds, loading,
  isFinalizing, hasMore, onLoadMore, onToggleSelect,
  onOpenMeeting, onReprocess, onFinalizeDraft,
  onMoveToTrash, onRestore, onDeleteForever,
  onMoveSelectedToTrash, onDeleteSelected, onEmptyTrash,
  onNavigateToUpload, onNavigateToLive
}: MeetingListViewProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Filter + sort
  const filteredMeetings = useMemo(() => {
    let result = meetings;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(m => m.title.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      result = result.filter(m => m.status === statusFilter);
    }
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "newest": return b.createdAt - a.createdAt;
        case "oldest": return a.createdAt - b.createdAt;
        case "title": return a.title.localeCompare(b.title);
        case "duration": return (b.duration || 0) - (a.duration || 0);
      }
    });
    return result;
  }, [meetings, search, sortBy, statusFilter]);

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

  if (filteredMeetings.length === 0) {
    if (currentTab === "trash") {
      return (
        <EmptyState
          icon={<Trash2 className="w-8 h-8" />}
          title="Thùng rác trống"
          description="Các cuộc họp đã xóa sẽ xuất hiện ở đây."
        />
      );
    }
    return (
      <EmptyState
        icon={<Calendar className="w-8 h-8" />}
        title="Chưa có cuộc họp nào"
        description="Tải lên file audio hoặc ghi âm trực tiếp để bắt đầu."
        action={
          <>
            {onNavigateToUpload && (
              <Button intent="primary" onClick={onNavigateToUpload}>
                Tải file lên
              </Button>
            )}
            {onNavigateToLive && (
              <Button intent="outline" onClick={onNavigateToLive}>
                Ghi âm trực tiếp
              </Button>
            )}
          </>
        }
      />
    );
  }

  return (
    <div>
      {/* Filter bar */}
      {currentTab === "all" && meetings.length > 0 && (
        <MeetingListFilter
          search={search}
          sortBy={sortBy}
          statusFilter={statusFilter}
          onSearchChange={setSearch}
          onSortChange={setSortBy}
          onStatusFilterChange={setStatusFilter}
        />
      )}

      {/* List */}
      <div id="tour-list" className="space-y-2 md:space-y-3">
        {currentTab === "trash" && (
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">
              {meetings.length} mục trong thùng rác
            </p>
            <Button intent="danger" size="sm" onClick={onEmptyTrash}>
              Dọn sạch thùng rác
            </Button>
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
            onFinalizeDraft={() => onFinalizeDraft({ stopPropagation: () => {} } as any, m)}
            onMoveToTrash={() => onMoveToTrash({ stopPropagation: () => {} } as any, m.id)}
            onRestore={() => onRestore({ stopPropagation: () => {} } as any, m.id)}
            onDeleteForever={() => onDeleteForever({ stopPropagation: () => {} } as any, m.id)}
          />
        ))}
      </div>

      {/* Load more */}
      {hasMore && currentTab === "all" && (
        <div className="text-center py-4">
          <Button intent="outline" onClick={onLoadMore}>
            Tải thêm
          </Button>
        </div>
      )}

      {/* Bulk actions */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        actions={
          currentTab === "all"
            ? [{
                label: "Xóa đã chọn",
                icon: <Trash2 className="w-4 h-4" />,
                onClick: onMoveSelectedToTrash,
                intent: "danger",
              }]
            : [{
                label: "Xóa vĩnh viễn",
                icon: <Trash2 className="w-4 h-4" />,
                onClick: onDeleteSelected,
                intent: "danger",
              }]
        }
        onClear={() => {/* setSelectedIds([]) ở parent */}}
      />
    </div>
  );
}
```

### Kết quả
- ✅ 1 component duy nhất (không còn table + card song song)
- ✅ Search + sort + filter
- ✅ Bulk action bar floating
- ✅ Empty state đẹp

---

## 2.7 Gộp `UploadModal` + `LiveSetupModal` thành `RecordSetupModal`

### Lý do
- 2 modal giống nhau 90%
- Chỉ khác: title, icon, action label, ngôn ngữ color

### File: `app/components/Dashboard/RecordSetupModal.tsx` (MỚI)
```tsx
"use client";
import { AlertTriangle, UploadCloud, Mic } from "lucide-react";
import Modal from "@/app/components/ui/Modal";
import Input from "@/app/components/ui/Input";
import Select from "@/app/components/ui/Select";
import Button from "@/app/components/ui/Button";

export type RecordMode = "upload" | "live";

interface RecordSetupModalProps {
  mode: RecordMode;
  isOpen: boolean;
  selectedFile?: File;
  defaultTitle: string;
  defaultObjectives?: string;
  defaultLanguage: "vi" | "en";
  loading?: boolean;
  onTitleChange: (v: string) => void;
  onObjectivesChange: (v: string) => void;
  onLanguageChange: (v: "vi" | "en") => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function RecordSetupModal({
  mode, isOpen, selectedFile, defaultTitle, defaultObjectives = "",
  defaultLanguage, loading = false, onTitleChange, onObjectivesChange,
  onLanguageChange, onConfirm, onCancel
}: RecordSetupModalProps) {
  const isUpload = mode === "upload";
  const Icon = isUpload ? UploadCloud : Mic;
  const title = isUpload ? "Cấu hình tải file lên" : "Cấu hình ghi âm trực tiếp";
  const description = isUpload
    ? "Tệp sẽ được tải lên và AI sẽ tự động phiên âm."
    : "Thiết lập thông tin trước khi bắt đầu thu âm.";
  const confirmLabel = isUpload ? "Bắt đầu tải lên" : "Bắt đầu ghi âm";
  const intent = isUpload ? "primary" : "danger";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      description={description}
      icon={<Icon className="w-5 h-5" />}
      size="md"
      footer={
        <div className="flex gap-3">
          <Button intent="secondary" onClick={onCancel} className="flex-1">
            Hủy bỏ
          </Button>
          <Button
            intent={intent}
            loading={loading}
            disabled={!defaultTitle.trim()}
            onClick={onConfirm}
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* File info (only for upload) */}
        {isUpload && selectedFile && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-xs text-slate-500">Tệp đã chọn:</p>
            <p className="text-sm font-bold text-slate-800 truncate">
              {selectedFile.name}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
        )}

        {isUpload && selectedFile && selectedFile.size > 100 * 1024 * 1024 && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            File lớn (&gt;100MB) có thể mất nhiều thời gian để xử lý.
          </div>
        )}

        <Input
          label="Tiêu đề cuộc họp"
          placeholder="Nhập tên cuộc họp..."
          value={defaultTitle}
          onChange={(e) => onTitleChange(e.target.value)}
        />

        <Select
          label="Ngôn ngữ phiên âm"
          value={defaultLanguage}
          onChange={(e) => onLanguageChange(e.target.value as "vi" | "en")}
          options={[
            { value: "vi", label: "🇻🇳 Tiếng Việt" },
            { value: "en", label: "🇬🇧 English" },
          ]}
        />

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
            Mục tiêu cuộc họp
          </label>
          <textarea
            placeholder="Nhập mục tiêu để AI bám sát và tóm tắt chuẩn hơn..."
            value={defaultObjectives}
            onChange={(e) => onObjectivesChange(e.target.value)}
            rows={4}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm font-medium text-slate-700 resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}
```

### Files cần xóa (sau khi caller update)
- `app/components/Dashboard/UploadModal.tsx` (đã gộp)
- `app/components/Dashboard/LiveSetupModal.tsx` (đã gộp)

### Cập nhật caller
File `app/components/DashboardState.tsx`:
```tsx
{showUploadModal && (
  <RecordSetupModal
    mode="upload"
    isOpen={showUploadModal}
    selectedFile={selectedFileForUpload}
    defaultTitle={uploadTitle}
    defaultObjectives={uploadObjectives}
    defaultLanguage={uploadLanguageState}
    onTitleChange={setUploadTitle}
    onObjectivesChange={setUploadObjectives}
    onLanguageChange={setUploadLanguageState}
    loading={isUploadLoading}
    onConfirm={handleUploadConfirm}
    onCancel={() => setShowUploadModal(false)}
  />
)}

{showLiveSetupModal && (
  <RecordSetupModal
    mode="live"
    isOpen={showLiveSetupModal}
    defaultTitle={liveTitle}
    defaultObjectives={liveObjectives}
    defaultLanguage={liveLanguageState}
    onTitleChange={setLiveTitle}
    onObjectivesChange={setLiveObjectives}
    onLanguageChange={setLiveLanguageState}
    loading={isLiveLoading}
    onConfirm={handleLiveConfirm}
    onCancel={() => setShowLiveSetupModal(false)}
  />
)}
```

### Kết quả
- ✅ 1 modal dùng cho cả upload + live
- ✅ Giảm 100+ dòng code trùng lặp

---

## 2.8 Redesign `BotJoinModal`

### Lý do
- Hiện dùng `fixed inset-0` thủ công, gradient header
- Cần dùng `<Modal>` chuẩn

### File: `app/components/BotJoinModal.tsx` (CẬP NHẬT phần UI)
```tsx
// Chỉ cập nhật phần render, giữ nguyên logic
import Modal from "./ui/Modal";
import Spinner from "./ui/Spinner";
import Input from "./ui/Input";
import Select from "./ui/Select";
import Button from "./ui/Button";

// ... (giữ nguyên logic handleJoin, useEffect, etc.)

if (!isOpen) return null;

return (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Mời Bot Tham Gia"
    description="Bot sẽ tự động ghi âm và phiên âm cuộc họp trên Google Meet / Zoom."
    icon={<Bot className="w-5 h-5" />}
    size="md"
  >
    {botId ? (
      // ... phần hiển thị status (giữ nguyên logic)
      <div className="text-center space-y-6 py-4">
        {status === 'completed' ? (
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10" />
          </div>
        ) : (
          <Spinner size="xl" intent="primary" />
        )}
        {/* ... */}
      </div>
    ) : (
      <div className="space-y-4">
        <Input
          label="Link cuộc họp (Google Meet / Zoom)"
          placeholder="https://meet.google.com/..."
          value={meetingUrl}
          onChange={(e) => setMeetingUrl(e.target.value)}
          leftIcon={<LinkIcon className="w-4 h-4" />}
        />
        <Select
          label="Ngôn ngữ ghi âm"
          value={language}
          onChange={(e) => setLanguage(e.target.value as "vi" | "en")}
          options={[
            { value: "vi", label: "🇻🇳 Tiếng Việt" },
            { value: "en", label: "🇬🇧 English" },
          ]}
        />
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
            Mục tiêu cuộc họp
          </label>
          <textarea
            placeholder="Ví dụ: Chốt ngân sách marketing Q3..."
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            rows={3}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-medium text-slate-700 text-sm resize-none"
          />
        </div>
        <p className="text-xs text-slate-500 italic">* Bot sẽ tự động rời phòng khi kết thúc.</p>
        <Button intent="primary" loading={loading} onClick={handleJoin} className="w-full">
          <Video className="w-4 h-4 mr-2" />
          Mời Bot vào ngay
        </Button>
      </div>
    )}
  </Modal>
);
```

### Kết quả
- ✅ Dùng `<Modal>` chuẩn, ESC close, body lock
- ✅ Bỏ gradient header riêng

---

## 2.9 Redesign `DriveImportModal`

### Tương tự BotJoinModal
- Dùng `<Modal>`
- Dùng `<Spinner>`, `<Button>`
- Bỏ custom backdrop

(Chi tiết tương tự 2.8, không lặp lại code)

---

## 2.10 Refactor `app/(dashboard)/page.tsx`

### Lý do
- Hiện 172 dòng, lẫn logic + UI
- Tách upload logic ra hook

### File: `app/(dashboard)/page.tsx` (CẬP NHẬT)
```tsx
"use client";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardState from "../components/DashboardState";
import DriveImportModal from "../components/DriveImportModal";
import BotJoinModal from "../components/BotJoinModal";
import { useAuth } from "../context/AuthContext";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { useUpload } from "../hooks/useUpload";
import UploadProgressToast from "../components/Dashboard/UploadProgressToast";

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useGlobalUI();
  const router = useRouter();
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isBotModalOpen, setIsBotModalOpen] = useState(false);

  const { uploadProgress, uploadFile, resetProgress } = useUpload(user, toast);

  const triggerRefresh = useCallback(() => {
    setRefreshSignal((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const handler = () => triggerRefresh();
    window.addEventListener("dashboard-refresh", handler);
    return () => window.removeEventListener("dashboard-refresh", handler);
  }, [triggerRefresh]);

  return (
    <>
      <DashboardState
        refreshSignal={refreshSignal}
        onImport={(file, lang, title, obj) => uploadFile(file, lang, title, obj, triggerRefresh)}
        onUseSample={...}
        onLive={(lang, title, obj) => router.push(`/live?${new URLSearchParams({lang, title, obj}).toString()}`)}
        onOpenMeeting={(m) => router.push(`/meeting/${m.id}`)}
        onReprocess={...}
        onOpenDrive={() => setIsDriveModalOpen(true)}
        onOpenBot={() => setIsBotModalOpen(true)}
      />

      <DriveImportModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onImportSuccess={triggerRefresh}
      />
      <BotJoinModal
        isOpen={isBotModalOpen}
        onClose={() => setIsBotModalOpen(false)}
        onUpdate={triggerRefresh}
      />

      {/* Upload progress toast */}
      {uploadProgress !== null && (
        <UploadProgressToast
          progress={uploadProgress}
          onClose={resetProgress}
        />
      )}
    </>
  );
}
```

### Kết quả
- ✅ Component gọn từ 172 → ~70 dòng
- ✅ Upload logic tách riêng

---

## 2.11 Tạo `useUpload` hook

### Lý do
- Tách logic upload khỏi page

### File: `app/hooks/useUpload.ts` (MỚI)
```ts
"use client";
import { useState, useCallback } from "react";
import { uploadAudioToFirebase, startTranscriptionJob } from "../lib/api";
import { saveMeeting, type Meeting } from "../lib/db";
import { MEETING_STATUS } from "../lib/constants";
import type { User } from "firebase/auth";

export function useUpload(
  user: User | null,
  toast: { success: (msg: string) => void; error: (msg: string) => void }
) {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const uploadFile = useCallback(
    async (
      file: File,
      language: "vi" | "en",
      title?: string,
      objectives?: string,
      onSuccess?: () => void
    ) => {
      if (!user) {
        toast.error("Vui lòng đăng nhập!");
        return;
      }
      const tempId = crypto.randomUUID();
      setUploadProgress(0);
      try {
        const url = await uploadAudioToFirebase(file, user.uid, setUploadProgress);
        setUploadProgress(null);
        const jobId = await startTranscriptionJob(url, language);

        const newMeeting: Meeting = {
          id: tempId,
          userId: user.uid,
          jobId,
          jobStartedAt: Date.now(),
          title: title?.trim() || file.name.replace(/\.[^/.]+$/, ""),
          createdAt: Date.now(),
          duration: 0,
          audioUrl: url,
          segments: [],
          speakers: [],
          status: MEETING_STATUS.TRANSCRIBING,
          isDeleted: false,
          language,
          objectives: objectives?.trim() || undefined,
        };

        await saveMeeting(newMeeting);
        toast.success("Đã gửi yêu cầu xử lý! Hệ thống sẽ tự động cập nhật.");
        onSuccess?.();
      } catch (error) {
        console.error("Lỗi upload:", error);
        toast.error("Có lỗi xảy ra: " + (error as Error).message);
        setUploadProgress(null);
      }
    },
    [user, toast]
  );

  const resetProgress = useCallback(() => setUploadProgress(null), []);

  return { uploadProgress, uploadFile, resetProgress };
}
```

### Kết quả
- ✅ Tái sử dụng được ở nhiều page
- ✅ Dễ test

---

## 2.12 Tạo `UploadProgressToast`

### Lý do
- Hiện progress card inline trong `page.tsx:150-169`
- Cần component riêng + dùng `<ProgressBar>`

### File: `app/components/Dashboard/UploadProgressToast.tsx` (MỚI)
```tsx
"use client";
import { X, UploadCloud } from "lucide-react";
import Spinner from "@/app/components/ui/Spinner";
import ProgressBar from "@/app/components/ui/ProgressBar";

interface UploadProgressToastProps {
  progress: number;
  onClose: () => void;
  fileName?: string;
}

export default function UploadProgressToast({ progress, onClose, fileName }: UploadProgressToastProps) {
  return (
    <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-[var(--z-toast)] animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-72 md:w-80 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center shrink-0">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-slate-800 font-bold text-sm">Đang tải file lên</h3>
            {fileName && <p className="text-slate-500 text-xs truncate">{fileName}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <ProgressBar value={progress} variant="primary" showLabel />
      </div>
    </div>
  );
}
```

### Kết quả
- ✅ Replace inline progress card
- ✅ Reusable

---

## Verify Phase 2

### Checklist
- [ ] Dashboard load không lỗi
- [ ] HeroCard hiển thị 2 CTA (Upload / Live), có stepper
- [ ] 4 StatCard hiển thị đúng số liệu
- [ ] Language SegmentedControl hoạt động
- [ ] Click "Tải file lên" → chọn file → RecordSetupModal mở
- [ ] Click "Ghi âm trực tiếp" → LiveSetupModal mở (dùng cùng RecordSetupModal mode="live")
- [ ] List meeting hiển thị dạng card (không còn table)
- [ ] Search box filter theo title
- [ ] Status filter hoạt động
- [ ] Sort (newest/oldest/title/duration) hoạt động
- [ ] Click checkbox → bulk action bar xuất hiện ở dưới
- [ ] Click "Xóa đã chọn" → confirm → thực hiện
- [ ] Action button trên card (Reprocess, Edit, Trash) LUÔN hiển thị (không hover-only)
- [ ] Mobile (375px): cards stack dọc, action buttons vẫn bấm được
- [ ] Click "Dọn sạch thùng rác" trên tab trash
- [ ] Upload progress hiện dạng toast, không che UI
- [ ] BotJoinModal, DriveImportModal mở/đóng bằng ESC, backdrop
- [ ] `npm run build` pass
- [ ] `npm run lint` pass

### Rollback
- Revert Phase 2, restore `MeetingListView.tsx` (149-322 dòng cũ), `UploadModal.tsx`, `LiveSetupModal.tsx`
- Phase 0 + 1 vẫn giữ

---

## Output Phase 2

Sau Phase 2:
- ✅ Dashboard đẹp, đồng nhất với design system
- ✅ 5 file mới: `HeroCard`, `MeetingCard`, `MeetingListFilter`, `BulkActionBar`, `RecordSetupModal`, `UploadProgressToast`, `useUpload`
- ✅ 5 file cập nhật: `StatsCards`, `MeetingListView`, `BotJoinModal`, `DriveImportModal`, `(dashboard)/page.tsx`
- ✅ 2 file xóa: `UploadModal.tsx`, `LiveSetupModal.tsx` (gộp vào `RecordSetupModal`)
- ✅ List meeting 1 phiên bản duy nhất (responsive)

Sẵn sàng cho Phase 3 (Editor & Meeting Detail).
