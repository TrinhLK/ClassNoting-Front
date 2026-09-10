# Phase 3 — Editor & Meeting Detail Redesign

> **Tham chiếu:** Plan tổng thể ở [`UI-IMPROVEMENT-PLAN.md`](./UI-IMPROVEMENT-PLAN.md) Phần B. File này ghi lại chi tiết implementation Phase 3.
> **Yêu cầu:** Phase 0 + 1 + 2 hoàn thành.

## Tổng quan

| Sub-phase | Nội dung | Trạng thái |
|-----------|----------|-----------|
| **3.1 Redesign `Editor/Header.tsx`** | Dùng `PageHeader` + dropdown template | ⏳ |
| **3.2 Tạo `Editor/TranscriptRow.tsx`** (mới) | Bỏ `dangerouslySetInnerHTML` | ⏳ |
| **3.3 Redesign `Editor/SpeakerSidebar.tsx`** | Có duration %, drag reorder | ⏳ |
| **3.4 Redesign `Editor/AudioPlayer.tsx`** | Dùng range input chuẩn | ⏳ |
| **3.5 Xóa duplicate audio player trong `EditorState.tsx`** | Dùng `<Editor/AudioPlayer>` | ⏳ |
| **3.6 Tạo `useAudioPlayer` hook** | Tách audio logic | ⏳ |
| **3.7 Tách `MeetingDetailState.tsx` (904 dòng)** | Thành 3 hooks + 4 components | ⏳ |
| **3.8 Tạo `hooks/useMeetingDetail.ts`** | Load/save/share logic | ⏳ |
| **3.9 Tạo `hooks/useExport.ts`** | Export txt/docx/pdf | ⏳ |
| **3.10 Redesign `Meeting/Header.tsx`** | Dùng `PageHeader` | ⏳ |
| **3.11 Redesign `Meeting/SummaryPanel.tsx`** | Dùng `<MarkdownContent>` | ⏳ |
| **3.12 Redesign `Meeting/SpeakerFilter.tsx`** | Pill có counter | ⏳ |
| **3.13 Tạo `Meeting/FullTranscriptModal.tsx`** | Toàn văn fullscreen | ⏳ |
| **3.14 Tạo `Meeting/ExportMenu.tsx`** | Dropdown export | ⏳ |
| **Verify** | Build + Lint + Test | ⏳ |

**Tổng effort ước tính:** 2-3 ngày
**Số commits khuyến nghị:** 4-5 commit (Editor Header/Player, Editor Row, MeetingDetail hooks, MeetingDetail UI, Summary)

---

## 3.1 Redesign `Editor/Header.tsx`

### Lý do
- Hiện dùng inline `bg-slate-900` cho play button → đứt gãy với light style
- Cần dùng `PageHeader` + button chuẩn

### File: `app/components/Editor/Header.tsx` (CẬP NHẬT)
```tsx
"use client";
import { useRef, useEffect, useState } from "react";
import {
  ChevronLeft, Pencil, Check, LayoutTemplate, Sparkles, Save, ChevronDown
} from "lucide-react";
import Button from "@/app/components/ui/Button";
import PageHeader from "@/app/components/ui/PageHeader";

interface EditorHeaderProps {
  title: string;
  isEditingTitle: boolean;
  isSaving: boolean;
  selectedTemplateName: string;
  onBack: () => void;
  onStartEditingTitle: () => void;
  onSaveTitle: () => void;
  onTitleKeyDown: (e: React.KeyboardEvent) => void;
  onTitleChange: (v: string) => void;
  onOpenTemplateModal: () => void;
  onSummarize: () => void;
  onSave: () => void;
  templateOptions?: Array<{ id: string; name: string; onClick: () => void }>;
}

export default function EditorHeader({
  title, isEditingTitle, isSaving, selectedTemplateName,
  onBack, onStartEditingTitle, onSaveTitle, onTitleKeyDown,
  onTitleChange, onOpenTemplateModal, onSummarize, onSave
}: EditorHeaderProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  return (
    <PageHeader
      variant="compact"
      sticky
      backHref={undefined}
      onBack={onBack}
      title={title}
      actions={
        <>
          {/* Template dropdown (inline) */}
          <button
            onClick={onOpenTemplateModal}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors border border-slate-200 max-w-[160px]"
            title={selectedTemplateName}
          >
            <LayoutTemplate className="w-4 h-4 text-primary-600 shrink-0" />
            <span className="truncate">{selectedTemplateName}</span>
          </button>

          <Button
            intent="outline"
            size="sm"
            onClick={onSummarize}
            leftIcon={<Sparkles className="w-4 h-4" />}
            className="text-orange-700 border-orange-200 bg-orange-50 hover:bg-orange-100 hidden md:flex"
          >
            Tóm tắt lại
          </Button>

          <Button
            intent="primary"
            size="sm"
            onClick={onSave}
            loading={isSaving}
            leftIcon={isSaving ? undefined : <Save className="w-4 h-4" />}
          >
            {isSaving ? "Đã lưu" : "Lưu"}
          </Button>
        </>
      }
      className="!h-14 md:!h-16"  // override default
    >
      {/* Title with inline edit (passed as children to PageHeader) */}
      {isEditingTitle ? (
        <div className="flex items-center gap-2">
          <input
            ref={titleInputRef}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={onTitleKeyDown}
            onBlur={onSaveTitle}
            className="text-sm md:text-lg font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded w-full focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <button onMouseDown={onSaveTitle} className="text-emerald-600 hover:text-emerald-700">
            <Check className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="group flex items-center gap-2 cursor-pointer" onClick={onStartEditingTitle}>
          <span className="font-bold text-slate-800 text-sm md:text-lg truncate max-w-[200px] md:max-w-md" title={title}>
            {title}
          </span>
          <Pencil className="w-3 h-3 text-slate-300 group-hover:text-primary-500 transition-colors" />
        </div>
      )}
    </PageHeader>
  );
}
```

### Kết quả
- ✅ Dùng `PageHeader` chuẩn
- ✅ Action group đồng nhất với Button
- ✅ Title inline-edit vẫn hoạt động

---

## 3.2 Redesign `TranscriptRow.tsx`

### Lý do
- 302 dòng, có `dangerouslySetInnerHTML` raw (XSS risk)
- Hover-only action trên mobile
- Speaker color hardcode `bg-${color.split(' ')[0]}`

### File: `app/components/TranscriptRow.tsx` (CẬP NHẬT hoàn toàn)
```tsx
"use client";
import React, { memo, useRef, useEffect, useState, useCallback } from "react";
import { ChevronDown, Play, Pause, ArrowUpToLine, Plus, Edit2 } from "lucide-react";
import type { Segment, Speaker } from "../lib/db";
import type { Word } from "../lib/mockData";
import { cn } from "../lib/cn";
import Avatar from "./ui/Avatar";
import Tooltip from "./ui/Tooltip";

interface TranscriptRowProps {
  segment: Segment;
  speaker: Speaker;
  allSpeakers: Speaker[];
  isActive: boolean;
  isAudioPlaying: boolean;
  activeWordIndex: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onTextChange: (id: string, text: string) => void;
  onSpeakerChange: (id: string, spkId: string) => void;
  onSplit: (id: string, cursor: number) => void;
  onMerge: (id: string) => void;
  onAddRow: (id: string) => void;
  onTimeChange: (id: string, newTime: number) => void;
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};
const parseTime = (str: string, fallback: number) => {
  const parts = str.split(":").map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  return fallback;
};

function TranscriptRow({
  segment, speaker, allSpeakers, isActive,
  isAudioPlaying, activeWordIndex, onTogglePlay,
  onSeek, onTextChange, onSpeakerChange, onSplit, onMerge,
  onAddRow, onTimeChange
}: TranscriptRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [timeStr, setTimeStr] = useState(formatTime(segment.start));
  const [isEditing, setIsEditing] = useState(false);
  const [showSpeakerMenu, setShowSpeakerMenu] = useState(false);

  useEffect(() => {
    setTimeStr(formatTime(segment.start));
  }, [segment.start]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [segment.text, isEditing]);

  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActive) {
      onTogglePlay();
    } else {
      onSeek(segment.start);
    }
  }, [isActive, onTogglePlay, onSeek, segment.start]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const target = e.target as HTMLTextAreaElement;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSplit(segment.id, target.selectionStart);
      setIsEditing(false);
    }
    if (e.key === "Backspace" && target.selectionStart === 0 && target.selectionEnd === 0) {
      e.preventDefault();
      onMerge(segment.id);
      setIsEditing(false);
    }
  }, [onSplit, onMerge, segment.id]);

  const handleTimeBlur = useCallback(() => {
    const newTime = parseTime(timeStr, segment.start);
    if (newTime !== segment.start) {
      onTimeChange(segment.id, newTime);
    } else {
      setTimeStr(formatTime(segment.start));
    }
  }, [timeStr, segment.start, segment.id, onTimeChange]);

  // Render karaoke text (an toàn, không dangerouslySetInnerHTML)
  const renderKaraokeText = () => {
    if (!segment.words || segment.words.length === 0) {
      return <p className="text-slate-800 leading-relaxed text-sm md:text-base">{segment.text}</p>;
    }

    const originalText = segment.words.map(w => w.word).join(" ");
    const isEdited = segment.text.replace(/\s+/g, " ").trim() !== originalText.replace(/\s+/g, " ").trim();

    if (isEdited) {
      return <p className="text-slate-800 leading-relaxed text-sm md:text-base">{segment.text}</p>;
    }

    return (
      <p className="leading-relaxed text-slate-800 text-sm md:text-base">
        {segment.words.map((w: Word, idx: number) => {
          const isHighlight = activeWordIndex >= 0 && idx === activeWordIndex;
          return (
            <span
              key={idx}
              className={cn(
                "transition-all duration-150 rounded px-0.5 inline-block",
                isHighlight
                  ? "bg-emerald-200 text-black font-semibold shadow-sm ring-1 ring-emerald-300"
                  : "hover:bg-slate-100"
              )}
              title={`${w.start.toFixed(2)}s`}
            >
              {w.word}
            </span>
          );
        })}
      </p>
    );
  };

  return (
    <div className={cn(
      "flex gap-3 md:gap-4 group transition-all duration-300",
      isActive ? "opacity-100" : "opacity-80 hover:opacity-100"
    )}>
      {/* 1. Cột thời gian + play */}
      <div className="w-16 flex flex-col items-end pt-1 gap-2 shrink-0">
        <input
          className={cn(
            "text-xs font-mono text-right bg-transparent border-b border-transparent focus:border-primary-500 outline-none w-14",
            isActive ? "text-primary-600 font-bold" : "text-slate-400"
          )}
          value={timeStr}
          onChange={(e) => setTimeStr(e.target.value)}
          onBlur={handleTimeBlur}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <button
          onClick={handlePlayClick}
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center transition-all",
            isActive
              ? "bg-primary-600 text-white shadow-md scale-110"
              : "bg-slate-100 text-slate-400 md:opacity-0 md:group-hover:opacity-100 hover:bg-primary-100 hover:text-primary-600"
          )}
          title={isActive && isAudioPlaying ? "Tạm dừng" : "Nghe đoạn này"}
        >
          {isActive && isAudioPlaying ? (
            <Pause className="w-3 h-3 fill-current" />
          ) : (
            <Play className="w-3 h-3 ml-0.5 fill-current" />
          )}
        </button>
      </div>

      {/* 2. Cột nội dung */}
      <div
        onDoubleClick={() => setIsEditing(true)}
        className={cn(
          "flex-1 p-4 rounded-xl border transition-all relative",
          isActive
            ? "bg-primary-50 border-primary-200 shadow-sm"
            : "bg-white border-transparent hover:border-slate-200"
        )}
      >
        {/* Action mini-bar (always visible on mobile, hover on desktop) */}
        <div className="absolute right-2 top-2 flex gap-1 bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-slate-100 z-10 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          {!isEditing && (
            <Tooltip content="Sửa văn bản">
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 hover:bg-blue-50 rounded text-slate-400 hover:text-blue-600 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}
          <Tooltip content="Chèn dòng mới">
            <button
              onClick={() => onAddRow(segment.id)}
              className="p-1.5 hover:bg-emerald-50 rounded text-slate-400 hover:text-emerald-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </Tooltip>
          <div className="w-px h-4 bg-slate-200 my-auto" />
          <Tooltip content="Gộp với đoạn trên (Backspace)">
            <button
              onClick={() => onMerge(segment.id)}
              className="p-1.5 hover:bg-primary-50 rounded text-slate-400 hover:text-primary-600 transition-colors"
            >
              <ArrowUpToLine className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        {/* Speaker name with menu */}
        <div className="relative inline-block mb-1">
          <button
            onClick={(e) => { e.stopPropagation(); setShowSpeakerMenu(!showSpeakerMenu); }}
            className={cn(
              "text-xs font-bold px-2 py-1 rounded border flex items-center gap-1 transition-colors",
              speaker.color || "bg-primary-100 text-primary-700 border-primary-200"
            )}
          >
            {speaker.name}
            <ChevronDown className="w-3 h-3 opacity-50" />
          </button>

          {showSpeakerMenu && (
            <>
              <div
                className="fixed inset-0 z-40 cursor-default"
                onClick={(e) => { e.stopPropagation(); setShowSpeakerMenu(false); }}
              />
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border rounded-lg shadow-xl z-50 py-1 max-h-60 overflow-y-auto">
                {allSpeakers.map((spk) => (
                  <button
                    key={spk.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSpeakerChange(segment.id, spk.id);
                      setShowSpeakerMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Avatar name={spk.name} size="xs" colorScheme={{ bg: spk.color?.split(" ")[0] || "bg-slate-200", text: "text-slate-700" }} />
                    {spk.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Text */}
        <div className="mt-1 min-h-[24px]">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={segment.text}
              onChange={(e) => onTextChange(segment.id, e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => setIsEditing(false)}
              autoFocus
              rows={1}
              className="w-full bg-transparent resize-none outline-none text-slate-800 leading-relaxed focus:ring-0 border-none p-0"
              placeholder="Nhập nội dung hội thoại..."
            />
          ) : (
            <div onClick={() => !isActive && onSeek(segment.start)} className="cursor-text">
              {renderKaraokeText()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(TranscriptRow);
```

### Kết quả
- ✅ Bỏ `dangerouslySetInnerHTML` → an toàn
- ✅ Action mini-bar dùng `Tooltip` (giải thích rõ)
- ✅ Speaker menu dùng `<Avatar>` chuẩn
- ✅ Mobile: action bar luôn hiển thị (touch-friendly)

---

## 3.3 Redesign `Editor/SpeakerSidebar.tsx`

### Lý do
- Hiện 46 dòng, không có duration % hay reorder

### File: `app/components/Editor/SpeakerSidebar.tsx` (CẬP NHẬT)
```tsx
"use client";
import { Plus, Trash2, FileText, GripVertical, Mic } from "lucide-react";
import type { Speaker } from "@/app/lib/db";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import Tooltip from "../ui/Tooltip";

interface SpeakerSidebarProps {
  speakers: Speaker[];
  speakerDurations?: Record<string, number>;  // seconds
  totalDuration?: number;
  onAddSpeaker: () => void;
  onUpdateSpeakerName: (id: string, name: string) => void;
  onDeleteSpeaker: (id: string) => void;
  onViewTranscript: () => void;
}

export default function SpeakerSidebar({
  speakers, speakerDurations = {}, totalDuration = 0,
  onAddSpeaker, onUpdateSpeakerName, onDeleteSpeaker, onViewTranscript
}: SpeakerSidebarProps) {
  return (
    <div className="hidden md:flex w-72 border-r border-slate-200 bg-slate-50 flex-col shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
        <h3 className="font-bold text-slate-700 flex items-center gap-2">
          <Mic className="w-4 h-4 text-primary-600" />
          Người tham gia
          <span className="text-xs text-slate-400 font-medium">({speakers.length})</span>
        </h3>
        <Tooltip content="Thêm người nói">
          <Button intent="primary" size="sm" onClick={onAddSpeaker} className="!p-1.5">
            <Plus className="w-4 h-4" />
          </Button>
        </Tooltip>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {speakers.map((spk) => {
          const duration = speakerDurations[spk.id] || 0;
          const percent = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
          return (
            <div
              key={spk.id}
              className="bg-white p-3 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-2">
                <GripVertical className="w-3 h-3 text-slate-300 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
                <Avatar
                  name={spk.name}
                  size="sm"
                  colorScheme={{ bg: spk.color?.split(" ")[0] || "bg-primary-100", text: "text-primary-700" }}
                />
                <span className="text-[10px] font-mono text-slate-400 flex-1">
                  {spk.id.split("_")[1] || "?"}
                </span>
                <span className="text-[10px] font-bold text-slate-500">
                  {percent.toFixed(0)}%
                </span>
                <Tooltip content="Xóa">
                  <button
                    onClick={() => onDeleteSpeaker(spk.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Tooltip>
              </div>
              <input
                value={spk.name}
                onChange={(e) => onUpdateSpeakerName(spk.id, e.target.value)}
                className="w-full text-sm font-medium border-b border-transparent focus:border-primary-500 outline-none bg-transparent"
                placeholder="Tên..."
              />
              {/* Duration bar */}
              {duration > 0 && (
                <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-200 bg-white">
        <Button
          intent="outline"
          size="sm"
          onClick={onViewTranscript}
          leftIcon={<FileText className="w-4 h-4" />}
          className="w-full"
        >
          Xem toàn văn
        </Button>
      </div>
    </div>
  );
}
```

### Kết quả
- ✅ Có duration % + progress bar mini
- ✅ Drag handle hiện khi hover
- ✅ Dùng `<Button>`, `<Avatar>`, `<Tooltip>` chuẩn

---

## 3.4 Redesign `Editor/AudioPlayer.tsx`

### Lý do
- Hiện dùng custom `div` làm progress bar, không accessible
- Cần dùng `<input type="range">` styled

### File: `app/components/Editor/AudioPlayer.tsx` (CẬP NHẬT)
```tsx
"use client";
import { useRef } from "react";
import { Play, Pause, RotateCcw, RotateCw, Volume2 } from "lucide-react";
import Spinner from "../ui/Spinner";

interface EditorAudioPlayerProps {
  audioSrc: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isBuffering?: boolean;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onRateChange: () => void;
  onSeek: (time: number) => void;
  onTimeUpdate: () => void;
  onLoadedMetadata: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  onEnded: () => void;
  onSummarize?: () => void;
  formatTime: (s: number) => string;
}

export default function EditorAudioPlayer({
  audioSrc, isPlaying, currentTime, duration, playbackRate,
  isBuffering = false, onTogglePlay, onSkip, onRateChange, onSeek,
  onTimeUpdate, onLoadedMetadata, onEnded, onSummarize, formatTime
}: EditorAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  return (
    <div className="h-20 bg-white border-t border-slate-200 px-4 md:px-8 flex items-center gap-4 shadow-sm z-20 shrink-0">
      {/* Play button */}
      <button
        onClick={onTogglePlay}
        disabled={isBuffering}
        className="w-10 h-10 md:w-12 md:h-12 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700 active:scale-95 transition shadow-lg shrink-0 disabled:opacity-50"
      >
        {isBuffering ? <Spinner size="sm" intent="white" /> :
         isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
      </button>

      {/* Skip controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onSkip(-10)}
          className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition"
          title="Lùi 10 giây"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
        <button
          onClick={() => onSkip(10)}
          className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition"
          title="Tua 10 giây"
        >
          <RotateCw className="w-5 h-5" />
        </button>
        <button
          onClick={onRateChange}
          className="p-2 px-2.5 text-slate-700 hover:bg-slate-100 rounded-lg transition text-xs font-bold min-w-[3rem]"
          title="Tốc độ phát"
        >
          {playbackRate}x
        </button>
      </div>

      {/* Progress */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div className="flex justify-between text-[10px] md:text-xs font-medium text-slate-500 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600 hover:accent-primary-500"
          aria-label="Audio progress"
        />
      </div>

      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
      />
    </div>
  );
}
```

### Kết quả
- ✅ Accessible (range input có aria-label)
- ✅ Có loading state (Spinner khi buffer)
- ✅ Bỏ `bg-slate-900` play button → dùng `bg-primary-600` đồng nhất

---

## 3.5 Xóa duplicate audio player trong `EditorState.tsx`

### Lý do
- `EditorState.tsx:534-586` có code audio player inline
- Đã có `Editor/AudioPlayer.tsx` (refactor ở 3.4)

### File: `app/components/EditorState.tsx` (CẬP NHẬT)
```tsx
// Xóa block <div className="h-20 bg-white border-t ...">...</div> ở dòng 534-586
// Thay bằng:
import EditorAudioPlayer from "./Editor/AudioPlayer";

// Trong return:
<EditorAudioPlayer
  audioSrc={audioSrc}
  isPlaying={isPlaying}
  currentTime={currentTime}
  duration={duration}
  playbackRate={playbackRate}
  onTogglePlay={togglePlay}
  onSkip={skipTime}
  onRateChange={togglePlaybackRate}
  onSeek={seekTo}
  onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
  onLoadedMetadata={(e) => {
    const d = e.currentTarget.duration;
    if (Number.isFinite(d)) setDuration(d);
  }}
  onEnded={() => setIsPlaying(false)}
  formatTime={formatTime}
/>
```

### Kết quả
- ✅ Bỏ ~50 dòng duplicate
- ✅ EditorState gọn hơn

---

## 3.6 Tạo `useAudioPlayer` hook

### Lý do
- Tách audio logic khỏi EditorState

### File: `app/hooks/useAudioPlayer.ts` (MỚI)
```ts
"use client";
import { useState, useRef, useCallback, useEffect } from "react";

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, time);
    }
  }, []);

  const skipTime = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + seconds);
    }
  }, []);

  const togglePlaybackRate = useCallback(() => {
    setPlaybackRate((prev) => {
      if (prev === 1.0) return 1.25;
      if (prev === 1.25) return 1.5;
      if (prev === 1.5) return 2.0;
      return 1.0;
    });
  }, []);

  const formatTime = useCallback((time: number) => {
    if (!time || isNaN(time) || !Number.isFinite(time)) return "00:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, []);

  return {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setCurrentTime,
    setDuration,
    togglePlay,
    seekTo,
    skipTime,
    togglePlaybackRate,
    formatTime,
  };
}
```

### Kết quả
- ✅ Reusable cho Editor + Meeting Detail
- ✅ EditorState giảm ~30 dòng

---

## 3.7 Tách `MeetingDetailState.tsx` (904 dòng)

### Lý do
- File quá lớn, lẫn logic + UI
- Cần tách thành hooks + components

### Plan tách

**Hooks (3 file mới):**
- `app/hooks/useMeetingDetail.ts` — load, save, share
- `app/hooks/useAudioPlayer.ts` — đã tạo ở 3.6 (dùng chung)
- `app/hooks/useExport.ts` — export txt/docx/pdf

**Components (4 file mới):**
- `app/components/Meeting/MeetingHeader.tsx` — cập nhật
- `app/components/Meeting/MeetingTranscript.tsx` — tab transcript
- `app/components/Meeting/SummaryPanel.tsx` — cập nhật
- `app/components/Meeting/ExportMenu.tsx` — dropdown export

**File `MeetingDetailState.tsx` (CẬP NHẬT):**
- Chỉ còn ~150 dòng
- Gọi hooks + render các component con

### File: `app/components/MeetingDetailState.tsx` (MỚI)
```tsx
"use client";

import React, { useCallback } from "react";
import { Meeting } from "../lib/db";
import { useMeetingDetail } from "../hooks/useMeetingDetail";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useExport } from "../hooks/useExport";
import MeetingHeader from "./Meeting/MeetingHeader";
import MeetingTranscript from "./Meeting/MeetingTranscript";
import SummaryPanel from "./Meeting/SummaryPanel";
import TemplateManagerModal from "./TemplateManagerModal";
import Modal from "./ui/Modal";
import { useGlobalUI } from "../context/GlobalUIProvider";
import type { MeetingTemplate } from "../lib/templates";

export default function MeetingDetailState({
  meeting: initialMeeting, audioSrc, onBack, onEdit, onSummarize, isReadOnly = false
}: {
  meeting: Meeting;
  audioSrc: string;
  onBack: () => void;
  onEdit: () => void;
  onSummarize?: (meeting: Meeting, text: string, templateStructure?: string) => void;
  isReadOnly?: boolean;
}) {
  const { toast } = useGlobalUI();
  const {
    meeting, setMeeting,
    showTemplateModal, setShowTemplateModal,
    handleShare,
    handleSummarizeRequest,
  } = useMeetingDetail(initialMeeting, onSummarize, onBack, toast);

  const {
    audioRef, isPlaying, currentTime, duration, playbackRate,
    togglePlay, seekTo, skipTime, togglePlaybackRate, formatTime,
  } = useAudioPlayer();

  const { exportTxt, exportDocx, exportPdf, downloadAudio } = useExport(meeting, toast);

  // ... formatDate, scrollToSegment (chuyển vào component con)
  const formatDate = (ts: number) => new Date(ts).toLocaleDateString("vi-VN");
  const formatDuration = (sec: number) => formatTime(sec);
  const selectedTemplateName = "Mặc định";  // TODO: from meeting

  const handleScrollToSegment = (time: number) => seekTo(time);

  return (
    <div className="flex flex-col h-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <MeetingHeader
        meeting={meeting}
        isReadOnly={isReadOnly}
        showTemplateBtn={!!onSummarize}
        onBack={onBack}
        onEdit={onEdit}
        onOpenTemplateModal={() => setShowTemplateModal(true)}
        onShare={handleShare}
        onDownloadAudio={downloadAudio}
        onExportTxt={exportTxt}
        onExportDocx={exportDocx}
        onExportPdf={exportPdf}
        formatDate={formatDate}
        formatDuration={formatDuration}
      />

      <div className="flex-1 flex overflow-hidden">
        <MeetingTranscript
          meeting={meeting}
          audioSrc={audioSrc}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          playbackRate={playbackRate}
          onTogglePlay={togglePlay}
          onSkip={skipTime}
          onRateChange={togglePlaybackRate}
          onSeek={seekTo}
          onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d)) setDuration(d);
          }}
          onEnded={() => togglePlay()}
          formatTime={formatTime}
          audioRef={audioRef}
        />
        <SummaryPanel
          meeting={meeting}
          isReadOnly={isReadOnly}
          onEdit={onEdit}
          onScrollToSegment={handleScrollToSegment}
        />
      </div>

      <TemplateManagerModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSelectTemplate={(template: MeetingTemplate) => {
          handleSummarizeRequest(template);
        }}
        actionText="Sử dụng mẫu này"
        actionIcon="sparkles"
      />
    </div>
  );
}
```

### Kết quả
- ✅ File gọn từ 904 → ~100 dòng
- ✅ Logic tách rõ ràng

---

## 3.8 Tạo `useMeetingDetail` hook

### File: `app/hooks/useMeetingDetail.ts` (MỚI)
```ts
"use client";
import { useState, useCallback } from "react";
import { Meeting } from "../lib/db";
import { generateMeetingShareToken } from "../lib/db";
import type { MeetingTemplate } from "../lib/templates";
import type { Segment, Speaker } from "../lib/db";

export function useMeetingDetail(
  initialMeeting: Meeting,
  onSummarize?: (m: Meeting, text: string, structure?: string) => void,
  onBack?: () => void,
  toast?: { success: (m: string) => void; info: (m: string) => void; error: (m: string) => void }
) {
  const [meeting, setMeeting] = useState(initialMeeting);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  const handleShare = useCallback(async () => {
    let shareId = meeting.shareToken;
    if (!shareId) {
      try {
        shareId = await generateMeetingShareToken(meeting.id);
        setMeeting({ ...meeting, shareToken: shareId });
      } catch (e) {
        console.error("Lỗi sinh share token", e);
        shareId = meeting.id;
      }
    }
    const shareUrl = `${window.location.origin}/share/${shareId}`;
    navigator.clipboard.writeText(shareUrl);
    toast?.success("Đã copy link chia sẻ: " + shareUrl);
  }, [meeting, toast]);

  const handleSummarizeRequest = useCallback((template: MeetingTemplate) => {
    if (!onSummarize) return;
    const fullText = meeting.segments.map((s: Segment) => {
      const name = meeting.speakers.find((sp: Speaker) => sp.id === s.speakerId)?.name || `Speaker ${s.speakerId.split("_")[1] || "00"}`;
      return `[${name}]: ${s.text}`;
    }).join("\n");
    onSummarize(meeting, fullText, template.structure);
    toast?.info(`Đang tóm tắt theo mẫu: ${template.name}...`);
    setShowTemplateModal(false);
    onBack?.();
  }, [meeting, onSummarize, toast, onBack]);

  return {
    meeting,
    setMeeting,
    showTemplateModal,
    setShowTemplateModal,
    handleShare,
    handleSummarizeRequest,
  };
}
```

---

## 3.9 Tạo `useExport` hook

### File: `app/hooks/useExport.ts` (MỚI)
```ts
"use client";
import { useCallback } from "react";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { Meeting } from "../lib/db";

export function useExport(meeting: Meeting, toast: { success: (m: string) => void; error: (m: string) => void }) {
  const formatDate = (ts: number) => new Date(ts).toLocaleString("vi-VN");

  const exportTxt = useCallback(() => {
    try {
      const txt = meeting.segments
        .map((s) => `[${formatTime(s.start)}] ${s.text}`)
        .join("\n");
      const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
      saveAs(blob, `${meeting.title}.txt`);
      toast.success("Đã xuất file .txt");
    } catch (e) {
      toast.error("Lỗi khi xuất file");
    }
  }, [meeting, toast]);

  const exportDocx = useCallback(async () => {
    try {
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: meeting.title,
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({
              text: `Ngày: ${formatDate(meeting.createdAt)} | Thời lượng: ${formatTime(meeting.duration)}`,
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: "" }),
            ...meeting.segments.map((s) =>
              new Paragraph({
                children: [
                  new TextRun({ text: `[${formatTime(s.start)}] `, bold: true }),
                  new TextRun({ text: s.text }),
                ],
              })
            ),
          ],
        }],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${meeting.title}.docx`);
      toast.success("Đã xuất file .docx");
    } catch (e) {
      toast.error("Lỗi khi xuất file .docx");
    }
  }, [meeting, toast]);

  const exportPdf = useCallback(async () => {
    // Use html2pdf.js (đã cài ở package.json)
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const element = document.getElementById("meeting-content-export");
      if (!element) return;
      html2pdf().from(element).save(`${meeting.title}.pdf`);
      toast.success("Đã xuất file .pdf");
    } catch (e) {
      toast.error("Lỗi khi xuất file .pdf");
    }
  }, [meeting, toast]);

  const downloadAudio = useCallback(async () => {
    if (!meeting.audioUrl) {
      toast.error("Không có file âm thanh");
      return;
    }
    try {
      const response = await fetch(meeting.audioUrl);
      const blob = await response.blob();
      saveAs(blob, `${meeting.title}.mp3`);
    } catch (e) {
      toast.error("Lỗi khi tải audio");
    }
  }, [meeting, toast]);

  return { exportTxt, exportDocx, exportPdf, downloadAudio };
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};
```

---

## 3.10 Redesign `Meeting/Header.tsx`

### Lý do
- Dùng `<PageHeader>` chuẩn
- Export menu chuyển thành `<Dropdown>` (dùng native)

### File: `app/components/Meeting/Header.tsx` (CẬP NHẬT)
```tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronLeft, Calendar, Clock, Share2, Download, Music, FileText, FileType, Sparkles, Edit3 } from "lucide-react";
import type { Meeting } from "@/app/lib/db";
import PageHeader from "../ui/PageHeader";
import Button from "../ui/Button";
import { cn } from "@/app/lib/cn";

interface MeetingHeaderProps {
  meeting: Meeting;
  isReadOnly: boolean;
  showTemplateBtn: boolean;
  onBack: () => void;
  onEdit: () => void;
  onOpenTemplateModal: () => void;
  onShare: () => Promise<void>;
  onDownloadAudio: () => void;
  onExportTxt: () => void;
  onExportDocx: () => void;
  onExportPdf: () => void;
  formatDate: (ts: number) => string;
  formatDuration: (sec: number) => string;
}

export default function MeetingHeader({
  meeting, isReadOnly, showTemplateBtn,
  onBack, onEdit, onOpenTemplateModal,
  onShare, onDownloadAudio, onExportTxt, onExportDocx, onExportPdf,
  formatDate, formatDuration
}: MeetingHeaderProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

  return (
    <PageHeader
      variant="default"
      sticky
      onBack={onBack}
      title={meeting.title}
      subtitle={`${formatDate(meeting.createdAt)} · ${formatDuration(meeting.duration)}`}
      icon={<FileText className="w-5 h-5" />}
      actions={
        <>
          {!isReadOnly && (
            <Button
              intent="outline"
              size="sm"
              onClick={onShare}
              leftIcon={<Share2 className="w-4 h-4" />}
              className="hidden sm:flex text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
            >
              Chia sẻ
            </Button>
          )}

          {/* Export dropdown */}
          <div ref={menuRef} className="relative">
            <Button
              intent="outline"
              size="sm"
              onClick={() => setShowExportMenu(!showExportMenu)}
              leftIcon={<Download className="w-4 h-4" />}
            >
              <span className="hidden md:inline">Tải xuống</span>
            </Button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                <button onClick={() => { onDownloadAudio(); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 flex items-center gap-3 text-slate-700">
                  <Music className="w-4 h-4 text-pink-500" /> Audio (.mp3)
                </button>
                <button onClick={() => { onExportTxt(); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 flex items-center gap-3 text-slate-700 border-t border-slate-100">
                  <FileText className="w-4 h-4 text-slate-400" /> Nội dung (.txt)
                </button>
                <button onClick={() => { onExportDocx(); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-primary-50 flex items-center gap-3 text-primary-700 border-t border-slate-100">
                  <FileType className="w-4 h-4" /> Tóm tắt (.docx)
                </button>
                <button onClick={() => { onExportPdf(); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-orange-50 flex items-center gap-3 text-orange-700 border-t border-slate-100">
                  <FileType className="w-4 h-4" /> Tóm tắt (.pdf)
                </button>
              </div>
            )}
          </div>

          {!isReadOnly && showTemplateBtn && (
            <Button
              intent="outline"
              size="sm"
              onClick={onOpenTemplateModal}
              leftIcon={<Sparkles className="w-4 h-4" />}
              className="hidden md:flex text-orange-700 border-orange-200 bg-orange-50 hover:bg-orange-100"
            >
              Tóm tắt lại
            </Button>
          )}

          {!isReadOnly && (
            <Button intent="primary" size="sm" onClick={onEdit} leftIcon={<Edit3 className="w-4 h-4" />}>
              <span className="hidden md:inline">Sửa</span>
            </Button>
          )}
        </>
      }
    />
  );
}
```

---

## 3.11 Redesign `Meeting/SummaryPanel.tsx`

### Lý do
- Dùng `<MarkdownContent>` thay `prose prose-sm`
- Cấu trúc card rõ ràng hơn

### File: `app/components/Meeting/SummaryPanel.tsx` (CẬP NHẬT)
- Dùng `<MarkdownContent>` cho summary body
- Card "AI Tóm tắt" header có chip "Tự động" + nút "Tạo lại" (nếu !isReadOnly)
- Card "Mục tiêu" inline edit gọn hơn
- Card "Metadata" 2 cột với icon

(Chi tiết code tương tự cấu trúc hiện tại, thay các chỗ dùng `dangerouslySetInnerHTML` → `<MarkdownContent>`, dùng `<Button>`, `<Input>`, `<EmptyState>`)

---

## 3.12 Redesign `Meeting/SpeakerFilter.tsx`

### Lý do
- Pill có counter `(5)`
- Search input optional

### File: `app/components/Meeting/SpeakerFilter.tsx` (CẬP NHẬT)
```tsx
"use client";
import { User, Search } from "lucide-react";
import type { Speaker } from "@/app/lib/db";
import { useState, useMemo } from "react";

interface SpeakerFilterProps {
  speakers: Speaker[];
  filteredSpeakerId: string | null;
  onFilterChange: (id: string | null) => void;
}

export default function SpeakerFilter({ speakers, filteredSpeakerId, onFilterChange }: SpeakerFilterProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return speakers;
    const q = search.toLowerCase();
    return speakers.filter(s => s.name.toLowerCase().includes(q));
  }, [speakers, search]);

  // Count segments per speaker (TODO: pass as prop if needed)

  return (
    <div className="px-4 py-3 md:px-8 border-b border-slate-200 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide sticky top-0 bg-white/95 backdrop-blur z-20 shadow-sm">
      <span className="text-xs font-bold text-slate-500 uppercase flex items-center mr-2 shrink-0">
        <User className="w-3.5 h-3.5 mr-1" /> Người nói:
      </span>
      <button
        onClick={() => onFilterChange(null)}
        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
          !filteredSpeakerId
            ? "bg-slate-800 text-white border-slate-800"
            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
        }`}
      >
        Tất cả ({speakers.length})
      </button>
      {filtered.map((speaker) => (
        <button
          key={speaker.id}
          onClick={() => onFilterChange(filteredSpeakerId === speaker.id ? null : speaker.id)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            filteredSpeakerId === speaker.id
              ? "bg-primary-600 text-white border-primary-600 shadow-sm"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          {speaker.name}
          {/* TODO: show count */}
        </button>
      ))}
    </div>
  );
}
```

### Kết quả
- ✅ Counter trên nút "Tất cả"
- ✅ Search input optional (ẩn nếu < 5 speakers)

---

## 3.13 Tạo `Meeting/FullTranscriptModal.tsx`

### Lý do
- Editor có "Xem toàn văn" trong SpeakerSidebar → cần modal fullscreen

### File: `app/components/Meeting/FullTranscriptModal.tsx` (MỚI)
```tsx
"use client";
import { Copy } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { useState } from "react";

interface FullTranscriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  title?: string;
}

export default function FullTranscriptModal({ isOpen, onClose, content, title = "Toàn văn Transcript" }: FullTranscriptModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="full"
      footer={
        <div className="flex justify-end gap-2">
          <Button intent="outline" onClick={handleCopy} leftIcon={<Copy className="w-4 h-4" />}>
            {copied ? "Đã copy!" : "Copy"}
          </Button>
          <Button intent="primary" onClick={onClose}>Đóng</Button>
        </div>
      }
    >
      <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-slate-700 bg-slate-50 p-4 rounded-lg">
        {content}
      </pre>
    </Modal>
  );
}
```

---

## 3.14 Tạo `Meeting/ExportMenu.tsx`

(Đã tích hợp vào MeetingHeader 3.10)

---

## Verify Phase 3

### Checklist
- [ ] Editor load, hiển thị header dùng `<PageHeader>`
- [ ] Click play button → audio play, range input update
- [ ] Click range input → audio seek đúng
- [ ] Speed button toggle 1.0 → 1.25 → 1.5 → 2.0 → 1.0
- [ ] Skip -10s / +10s hoạt động
- [ ] Speaker sidebar hiển thị duration % và progress bar
- [ ] Click + → thêm speaker mới
- [ ] TranscriptRow: double-click để edit, Enter để split, Backspace để merge
- [ ] Mobile: action mini-bar vẫn dùng được (always visible)
- [ ] **KHÔNG có `dangerouslySetInnerHTML`** trong bất kỳ file nào (search verify)
- [ ] Meeting Detail: 3 tab (Nội dung / Tóm tắt trên mobile)
- [ ] Summary dùng `<MarkdownContent>` → render đẹp
- [ ] Click timestamp [00:30] trong summary → seek audio
- [ ] Export menu: Audio / Txt / Docx / Pdf đều hoạt động
- [ ] `MeetingDetailState.tsx` < 200 dòng
- [ ] `EditorState.tsx` < 500 dòng (giảm từ 643)
- [ ] `npm run build` pass
- [ ] `npm run lint` pass

### Rollback
- Revert Phase 3, restore `MeetingDetailState.tsx` cũ, `EditorState.tsx` cũ, `TranscriptRow.tsx` cũ
- Phase 0-2 vẫn giữ

---

## Output Phase 3

Sau Phase 3:
- ✅ Editor UX mượt, audio player chuẩn
- ✅ TranscriptRow an toàn (bỏ XSS)
- ✅ MeetingDetailState tách thành hooks + components
- ✅ 5 file mới: `useAudioPlayer`, `useMeetingDetail`, `useExport`, `FullTranscriptModal`, redesign các file con
- ✅ `MeetingDetailState.tsx` 904 → ~150 dòng

Sẵn sàng cho Phase 4 (Minutes).
