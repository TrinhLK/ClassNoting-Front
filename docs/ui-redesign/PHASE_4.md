# Phase 4 — Minutes (Kho biên bản)

> **Tham chiếu:** Plan tổng thể ở [`UI-IMPROVEMENT-PLAN.md`](./UI-IMPROVEMENT-PLAN.md) Phần B. File này ghi lại chi tiết implementation Phase 4.
> **Yêu cầu:** Phase 0 + 1 + 2 + 3 hoàn thành.

## Tổng quan

| Sub-phase | Nội dung | Trạng thái |
|-----------|----------|-----------|
| **4.1 Redesign `Minutes/Header.tsx`** | Dùng `PageHeader` | ⏳ |
| **4.2 Tạo `Minutes/MeetingCard.tsx`** (mới) | Tách từ MeetingList | ⏳ |
| **4.3 Redesign `Minutes/MeetingList.tsx`** | Dùng `MeetingCard` (1 phiên bản) | ⏳ |
| **4.4 Redesign `Minutes/FolderGrid.tsx`** | Card đẹp, có hover lift | ⏳ |
| **4.5 Tạo `Minutes/FolderCard.tsx`** | Card riêng | ⏳ |
| **4.6 Redesign `MinutesState.tsx`** | Tách hooks + UI | ⏳ |
| **4.7 Redesign `AIChatModal.tsx`** | Dùng `<Modal>` chuẩn | ⏳ |
| **4.8 Redesign `TemplateManagerModal.tsx`** | Dùng `<Modal>` + card view | ⏳ |
| **4.9 Tạo `useHighlightedSnippet` hook** | Tách logic highlight | ⏳ |
| **4.10 Bỏ `dangerouslySetInnerHTML`** trong MeetingList | Dùng React render | ⏳ |
| **Verify** | Build + Lint + Test | ⏳ |

**Tổng effort ước tính:** 1-2 ngày
**Số commits khuyến nghị:** 2-3 commit (Minutes Header/List, Folder, AIChat/Template)

---

## 4.1 Redesign `Minutes/Header.tsx`

### Lý do
- Dùng `<PageHeader>` chuẩn, search bar đẹp hơn

### File: `app/components/Minutes/Header.tsx` (CẬP NHẬT)
```tsx
"use client";
import { useRef } from "react";
import { ArrowLeft, Plus, RefreshCw, FolderPlus } from "lucide-react";
import PageHeader from "../ui/PageHeader";
import Input from "../ui/Input";
import Button from "../ui/Button";
import Spinner from "../ui/Spinner";

interface MinutesHeaderProps {
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  onImport: (file: File) => void;
  onNewFolder: () => void;
}

export default function MinutesHeader({
  loading, searchQuery, onSearchChange,
  onRefresh, onImport, onNewFolder
}: MinutesHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <PageHeader
        variant="default"
        sticky
        onBack={() => window.history.back()}
        title="Biên bản cuộc họp"
        subtitle="Quản lý và chỉnh sửa biên bản các cuộc họp"
        icon={<FileText className="w-5 h-5" />}
        actions={
          <>
            <Button
              intent="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Làm mới"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              intent="outline"
              size="sm"
              onClick={onNewFolder}
              leftIcon={<FolderPlus className="w-4 h-4" />}
              className="hidden sm:flex"
            >
              Tạo thư mục
            </Button>
            <Button
              intent="primary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Import biên bản
            </Button>
          </>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.doc,.docx"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
      />

      {/* Search bar */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-3">
        <Input
          placeholder="Tìm kiếm theo tên cuộc họp hoặc nội dung..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
        />
      </div>
    </>
  );
}
```

### Kết quả
- ✅ Header đồng nhất với các page khác
- ✅ Search bar dùng `<Input>` chuẩn

---

## 4.2 Tạo `Minutes/MeetingCard.tsx`

### Lý do
- Tách từ `MeetingList.tsx` (84-225)
- 1 component responsive thay vì 2 phiên bản

### File: `app/components/Minutes/MeetingCard.tsx` (MỚI)
```tsx
"use client";
import { useRouter } from "next/navigation";
import { CheckSquare, Square, Calendar, Clock, ChevronRight, FileText } from "lucide-react";
import type { Meeting } from "@/app/lib/db";
import { cn } from "@/app/lib/cn";
import Avatar from "../ui/Avatar";
import { useMemo } from "react";

interface MeetingCardProps {
  meeting: Meeting;
  searchQuery: string;
  isSelected: boolean;
  onToggleSelect: (e: React.MouseEvent) => void;
  getHighlightedSnippet: (content: string, query: string) => React.ReactNode;
  getSummaryPreview: (summary: string) => string;
  formatDate: (ts: number) => string;
  formatDuration: (sec: number) => string;
}

export default function MeetingCard({
  meeting, searchQuery, isSelected, onToggleSelect,
  getHighlightedSnippet, getSummaryPreview,
  formatDate, formatDuration
}: MeetingCardProps) {
  const router = useRouter();

  const snippet = useMemo(() => {
    if (!meeting.summary) return null;
    if (searchQuery.trim()) {
      return getHighlightedSnippet(meeting.summary, searchQuery.trim());
    }
    return getSummaryPreview(meeting.summary);
  }, [meeting.summary, searchQuery, getHighlightedSnippet, getSummaryPreview]);

  const handleClick = () => {
    const url = `/minutes/${meeting.id}${searchQuery.trim() ? `?highlight=${encodeURIComponent(searchQuery.trim())}` : ""}`;
    router.push(url);
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("meetingId", meeting.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={handleClick}
      className={cn(
        "group bg-white rounded-2xl border p-4 cursor-pointer transition-all",
        isSelected
          ? "border-primary-300 bg-primary-50/30 ring-2 ring-primary-200"
          : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
          className="mt-1 shrink-0"
          aria-label={isSelected ? "Bỏ chọn" : "Chọn"}
          onClickCapture={onToggleSelect}
        >
          {isSelected ? (
            <CheckSquare className="w-5 h-5 text-primary-600" />
          ) : (
            <Square className="w-5 h-5 text-slate-300 group-hover:text-primary-400" />
          )}
        </button>

        {/* Avatar */}
        <Avatar
          name={meeting.title}
          size="md"
          colorScheme={{ bg: "bg-primary-100", text: "text-primary-600" }}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 mb-1 line-clamp-1 group-hover:text-primary-700 transition-colors">
            {meeting.title}
          </h3>
          <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(meeting.createdAt)}
            </span>
            {meeting.duration > 0 && (
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3" />
                {formatDuration(meeting.duration)}
              </span>
            )}
          </div>
          {snippet && (
            <div className="text-sm text-slate-600 line-clamp-2">
              {snippet}
            </div>
          )}
        </div>

        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary-600 transition-colors shrink-0 mt-1" />
      </div>
    </div>
  );
}
```

### Kết quả
- ✅ 1 component responsive (không còn 2 phiên bản)
- ✅ An toàn: snippet render qua React (không `dangerouslySetInnerHTML`)

---

## 4.3 Redesign `Minutes/MeetingList.tsx`

### Lý do
- Bỏ 2 phiên bản (table + card) → dùng `MeetingCard`
- Bỏ `dangerouslySetInnerHTML`

### File: `app/components/Minutes/MeetingList.tsx` (CẬP NHẬT)
```tsx
"use client";
import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Meeting } from "@/app/lib/db";
import MeetingCard from "./MeetingCard";
import EmptyState from "../ui/EmptyState";
import Button from "../ui/Button";
import SkeletonBlock from "../ui/LoadingSkeleton";

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
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="w-5 h-5 rounded" />
              <SkeletonBlock className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-2/3" />
                <SkeletonBlock className="h-3 w-1/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="w-8 h-8" />}
        title={searchQuery.trim() ? "Không tìm thấy biên bản" : "Chưa có biên bản nào"}
        description={
          searchQuery.trim()
            ? "Thử thay đổi từ khóa tìm kiếm."
            : "Tạo cuộc họp để biên bản xuất hiện ở đây."
        }
        action={
          !searchQuery.trim() && onNavigateToDashboard ? (
            <Button intent="primary" onClick={onNavigateToDashboard}>
              Tạo cuộc họp
            </Button>
          ) : undefined
        }
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
```

### Kết quả
- ✅ 1 phiên bản (responsive)
- ✅ Dùng `<EmptyState>`, `<SkeletonBlock>` chuẩn
- ✅ `getHighlightedSnippet` giờ return ReactNode (an toàn)

---

## 4.4 Redesign `Minutes/FolderGrid.tsx`

### Lý do
- Folder card hiện chỉ là text + icon, cần đẹp hơn
- Hover lift

### File: `app/components/Minutes/FolderGrid.tsx` (CẬP NHẬT)
```tsx
"use client";
import { Folder, FolderOpen, MoreVertical, Plus } from "lucide-react";
import { cn } from "@/app/lib/cn";
import Avatar from "../ui/Avatar";
import type { Folder } from "@/app/lib/db";
import Tooltip from "../ui/Tooltip";

interface FolderGridProps {
  folders: Folder[];
  currentFolder: Folder | null;
  dragOverFolderId: string | null;
  onSelectFolder: (folder: Folder | null) => void;
  onDragOver: (e: React.DragEvent, folderId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, folderId: string) => void;
  onContextMenu?: (folder: Folder) => void;
}

export default function FolderGrid({
  folders, currentFolder, dragOverFolderId,
  onSelectFolder, onDragOver, onDragLeave, onDrop
}: FolderGridProps) {
  if (folders.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Folder className="w-4 h-4" />
        Thư mục của bạn
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {folders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            isActive={currentFolder?.id === folder.id}
            isDragOver={dragOverFolderId === folder.id}
            onClick={() => onSelectFolder(folder)}
            onDragOver={(e) => onDragOver(e, folder.id)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, folder.id)}
          />
        ))}
      </div>
    </section>
  );
}

interface FolderCardProps {
  folder: Folder;
  isActive: boolean;
  isDragOver: boolean;
  onClick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

function FolderCard({ folder, isActive, isDragOver, onClick, onDragOver, onDragLeave, onDrop }: FolderCardProps) {
  return (
    <button
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "group relative bg-white rounded-2xl border p-4 text-left transition-all",
        "hover:shadow-md hover:-translate-y-0.5",
        isActive
          ? "border-primary-300 ring-2 ring-primary-200"
          : "border-slate-200",
        isDragOver && "border-primary-400 bg-primary-50 ring-2 ring-primary-300"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
          isActive
            ? "bg-primary-600 text-white"
            : "bg-primary-50 text-primary-600 group-hover:bg-primary-100"
        )}>
          <FolderOpen className="w-5 h-5" />
        </div>
        {folder.itemCount !== undefined && (
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {folder.itemCount}
          </span>
        )}
      </div>
      <h3 className="font-bold text-slate-800 truncate text-sm">{folder.name}</h3>
      {folder.description && (
        <p className="text-xs text-slate-500 mt-1 line-clamp-1">{folder.description}</p>
      )}
    </button>
  );
}
```

### Kết quả
- ✅ Folder card đẹp, có item count, hover lift
- ✅ Active state + drag over state rõ ràng

---

## 4.5 Tạo `Minutes/FolderCard.tsx`

(Đã tích hợp vào `FolderGrid.tsx` ở 4.4)

---

## 4.6 Redesign `MinutesState.tsx`

### Lý do
- File 448 dòng, lẫn logic + UI
- Tách hooks + sử dụng `BulkActionBar` (đã tạo ở Phase 2)

### Plan tách
- Giữ `MinutesState.tsx` làm coordinator
- Logic `handleImportFile`, `handleMoveToFolder`, `handleDragDropMove` giữ trong file (không quá phức tạp)
- Render sử dụng các component đã refactor ở 4.1-4.4

### File: `app/components/MinutesState.tsx` (CẬP NHẬT — thay BulkActionBar inline)
```tsx
// Thay block 339-396 (floating action panel) bằng:
<BulkActionBar
  selectedCount={selectedIds.size}
  actions={[
    {
      label: "Hỏi AI",
      icon: <Sparkles className="w-4 h-4" />,
      onClick: () => setShowAIChat(true),
      intent: "primary",
    },
    {
      label: "Chuyển vào...",
      icon: <FolderOpen className="w-4 h-4" />,
      onClick: () => setShowMoveDropdown(!showMoveDropdown),
      intent: "success",
    },
  ]}
  onClear={() => { setSelectedIds(new Set()); setShowMoveDropdown(false); }}
/>

{/* Move dropdown vẫn giữ riêng */}
{showMoveDropdown && folders.length > 0 && (
  <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50">
    {/* ... */}
  </div>
)}
```

### Kết quả
- ✅ Bulk action dùng component chuẩn
- ✅ Consistent với Dashboard (Phase 2)

---

## 4.7 Redesign `AIChatModal.tsx`

### Lý do
- Hiện dùng custom backdrop + gradient header
- Cần `<Modal>` chuẩn

### File: `app/components/AIChatModal.tsx` (CẬP NHẬT phần UI)
```tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { Send, Loader2, User, Bot, Trash2, Sparkles, X } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Input from "./ui/Input";
import Avatar from "./ui/Avatar";
import MarkdownContent from "./ui/MarkdownContent";

interface Message {
  role: "user" | "model";
  content: string;
}

interface AIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearContext: () => void;
  contextText: string;
  contextCount: number;
}

export default function AIChatModal({ isOpen, onClose, onClearContext, contextText, contextCount }: AIChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, isOpen]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || loading) return;
    const userMsg: Message = { role: "user", content: inputValue };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setLoading(true);
    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: contextText,
          question: userMsg.content,
          mode: "qa",
          history: messages,
        }),
      });
      const data = await res.json();
      const aiMsg: Message = { role: "model", content: data.summary || "Lỗi: Không nhận được phản lời." };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "model", content: "Lỗi: " + (e as Error).message }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Hỏi AI về biên bản"
      description={`Đang context: ${contextCount} biên bản`}
      icon={<Sparkles className="w-5 h-5" />}
      size="lg"
      footer={
        <div className="flex gap-2">
          <Input
            placeholder="Nhập câu hỏi..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
            leftIcon={<Send className="w-4 h-4" />}
            className="flex-1"
          />
          <Button intent="primary" onClick={handleSendMessage} loading={loading} disabled={!inputValue.trim()}>
            Gửi
          </Button>
        </div>
      }
    >
      <div className="space-y-4 min-h-[400px] max-h-[60vh] overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Bắt đầu hỏi AI về nội dung {contextCount} biên bản đã chọn.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <Avatar
              name={msg.role === "user" ? "U" : "AI"}
              size="sm"
              colorScheme={msg.role === "user"
                ? { bg: "bg-primary-100", text: "text-primary-700" }
                : { bg: "bg-orange-100", text: "text-orange-700" }}
            />
            <div className={`flex-1 rounded-2xl p-3 ${
              msg.role === "user"
                ? "bg-primary-600 text-white"
                : "bg-slate-100 text-slate-800"
            }`}>
              {msg.role === "user" ? (
                <p className="text-sm">{msg.content}</p>
              ) : (
                <MarkdownContent content={msg.content} className="text-sm" />
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <Avatar name="AI" size="sm" colorScheme={{ bg: "bg-orange-100", text: "text-orange-700" }} />
            <div className="bg-slate-100 rounded-2xl p-3">
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </Modal>
  );
}
```

### Kết quả
- ✅ Dùng `<Modal>` chuẩn
- ✅ Message bubble đẹp (avatar + content)
- ✅ AI response dùng `<MarkdownContent>` (an toàn)
- ✅ Input area trong footer

---

## 4.8 Redesign `TemplateManagerModal.tsx`

### Lý do
- Hiện inline form, dùng custom backdrop
- Cần `<Modal>` + card view đẹp

### File: `app/components/TemplateManagerModal.tsx` (CẬP NHẬT phần UI)
```tsx
// Phần render chính:
return (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Mẫu tóm tắt"
    description="Chọn mẫu có sẵn hoặc tạo mới"
    icon={<LayoutTemplate className="w-5 h-5" />}
    size="xl"
  >
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
      {templates.map((t) => (
        <button
          key={t.id}
          onClick={() => setSelectedTemplate(t)}
          className={cn(
            "text-left p-4 rounded-xl border transition-all",
            selectedTemplate?.id === t.id
              ? "border-primary-300 bg-primary-50/50 ring-2 ring-primary-200"
              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <LayoutTemplate className="w-4 h-4 text-primary-600" />
            <h4 className="font-bold text-slate-800 text-sm">{t.name}</h4>
            {selectedTemplate?.id === t.id && (
              <Check className="w-4 h-4 text-primary-600 ml-auto" />
            )}
          </div>
          {t.description && (
            <p className="text-xs text-slate-500 line-clamp-2 mb-2">{t.description}</p>
          )}
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer text-primary-600 hover:underline">
              Xem cấu trúc
            </summary>
            <pre className="mt-2 p-2 bg-slate-50 rounded text-[10px] whitespace-pre-wrap">
              {t.structure.substring(0, 200)}...
            </pre>
          </details>
        </button>
      ))}
    </div>

    {/* Create new form */}
    {isCreatingTemplate ? (
      <div className="border-t pt-4 space-y-3">
        <Input
          label="Tên mẫu"
          value={newTemplateName}
          onChange={(e) => setNewTemplateName(e.target.value)}
        />
        <Input
          label="Mô tả"
          value={newTemplateDesc}
          onChange={(e) => setNewTemplateDesc(e.target.value)}
        />
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
            Cấu trúc
          </label>
          <textarea
            ref={templateStructRef}
            value={newTemplateStructure}
            onChange={(e) => setNewTemplateStructure(e.target.value)}
            rows={6}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-mono"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button intent="outline" onClick={() => setIsCreatingTemplate(false)}>Hủy</Button>
          <Button intent="primary" onClick={handleCreateTemplate}>Tạo mẫu</Button>
        </div>
      </div>
    ) : (
      <Button intent="outline" onClick={() => setIsCreatingTemplate(true)} leftIcon={<Plus className="w-4 h-4" />} className="w-full">
        Tạo mẫu mới
      </Button>
    )}
  </Modal>
);
```

### Kết quả
- ✅ Card view cho templates
- ✅ Có preview cấu trúc (collapse)
- ✅ Dùng `<Modal>`, `<Input>`, `<Button>` chuẩn

---

## 4.9 Tạo `useHighlightedSnippet` hook

### Lý do
- Tách logic highlight search query
- Trả về ReactNode (an toàn) thay vì HTML string

### File: `app/hooks/useHighlightedSnippet.ts` (MỚI)
```ts
import { useCallback } from "react";

export function useHighlightedSnippet() {
  return useCallback((content: string, query: string): React.ReactNode => {
    if (!query.trim() || !content) return content;
    const parts = content.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-amber-100 text-amber-900 font-bold px-0.5 rounded">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }, []);
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function useSummaryPreview() {
  return useCallback((summary: string): string => {
    return summary.replace(/[#*`>]/g, "").substring(0, 200) + (summary.length > 200 ? "..." : "");
  }, []);
}
```

### Kết quả
- ✅ An toàn (React render, không `dangerouslySetInnerHTML`)
- ✅ Dùng `<mark>` chuẩn cho highlight

---

## 4.10 Bỏ `dangerouslySetInnerHTML` trong MeetingList

Đã tích hợp ở 4.2 (`MeetingCard`) và 4.3 (`MeetingList`).

---

## Verify Phase 4

### Checklist
- [ ] Vào `/minutes` → header đẹp, search bar dùng `<Input>`
- [ ] Folder grid hiển thị card đẹp, hover lift
- [ ] Click folder → vào folder, hiện meetings
- [ ] Drag meeting vào folder → di chuyển thành công
- [ ] List meetings: 1 phiên bản responsive (không còn table + card)
- [ ] Search "abc" → highlight "abc" trong snippet (màu vàng)
- [ ] **Không có `dangerouslySetInnerHTML`** trong Minutes (search verify)
- [ ] Chọn nhiều meeting → BulkActionBar xuất hiện
- [ ] Click "Hỏi AI" → AIChatModal mở với `<Modal>` chuẩn
- [ ] Gõ câu hỏi → AI trả lời render markdown đẹp
- [ ] Template modal: card view, click chọn → "Sử dụng mẫu này"
- [ ] Mobile (375px): folder grid stack 2 cột, list stack 1 cột
- [ ] `npm run build` pass
- [ ] `npm run lint` pass

### Rollback
- Revert Phase 4, restore các file cũ
- Phase 0-3 vẫn giữ

---

## Output Phase 4

Sau Phase 4:
- ✅ Minutes đẹp, đồng nhất với design system
- ✅ 4 file cập nhật: `Header`, `MeetingList`, `FolderGrid`, `AIChatModal`, `TemplateManagerModal`, `MinutesState`
- ✅ 1 hook mới: `useHighlightedSnippet`
- ✅ **Bỏ hoàn toàn `dangerouslySetInnerHTML`** ở Minutes

Sẵn sàng cho Phase 5 (Tasks/Team/Training/Live).
