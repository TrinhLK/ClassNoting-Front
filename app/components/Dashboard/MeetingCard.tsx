"use client";
import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { Calendar, Clock, RotateCcw, Edit3, Trash2, FolderOpen, Loader2, Wand2, Pencil } from "lucide-react";
import type { Meeting } from "@/app/lib/db";
import { MEETING_STATUS, type MeetingStatus } from "@/app/lib/constants";
import { cn } from "@/app/lib/cn";
import Avatar from "@/app/components/ui/Avatar";
import Badge from "@/app/components/ui/Badge";
import Tooltip from "@/app/components/ui/Tooltip";

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
  onRename?: (newTitle: string) => void | Promise<void>;
}

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const REPROCESS_STATUS: MeetingStatus[] = [
  MEETING_STATUS.COMPLETED, MEETING_STATUS.TRANSCRIBED, MEETING_STATUS.FAILED
];

export default function MeetingCard({
  meeting, currentTab, isSelected, isFinalizing,
  onToggleSelect, onOpen, onReprocess, onFinalizeDraft,
  onMoveToTrash, onRestore, onDeleteForever, onRename
}: MeetingCardProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(meeting.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const startEditingTitle = () => {
    setTitleDraft(meeting.title);
    setIsEditingTitle(true);
  };

  const commitRename = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === meeting.title) {
      setIsEditingTitle(false);
      return;
    }
    setIsEditingTitle(false);
    try {
      await onRename?.(trimmed);
    } catch {
      setTitleDraft(meeting.title);
    }
  };

  const cancelRename = () => {
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  };

  const stopCardEvents = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const isInteractive: MeetingStatus[] = [
    MEETING_STATUS.TRANSCRIBED, MEETING_STATUS.SUMMARIZING,
    MEETING_STATUS.COMPLETED, MEETING_STATUS.FAILED, MEETING_STATUS.DRAFT
  ];
  const canOpen = isInteractive.some(s => s === meeting.status);

  const avatarKey = meeting.status === MEETING_STATUS.FAILED ? "danger"
    : meeting.status === MEETING_STATUS.COMPLETED ? "success"
    : meeting.status === MEETING_STATUS.TRANSCRIBING ? "warning"
    : "primary";

  const colorMap: Record<string, { bg: string; text: string }> = {
    primary: { bg: "bg-primary-100", text: "text-primary-600" },
    success: { bg: "bg-emerald-100", text: "text-emerald-700" },
    danger:  { bg: "bg-red-100",    text: "text-red-600" },
    warning: { bg: "bg-blue-100",   text: "text-blue-600" },
  };

  return (
    <div
      onClick={() => !isEditingTitle && canOpen && onOpen()}
      className={cn(
        "group bg-white rounded-2xl border p-4 transition-all",
        isSelected
          ? "border-primary-300 bg-primary-50/30 ring-2 ring-primary-200"
          : "border-slate-200 hover:border-slate-300 hover:shadow-sm",
        canOpen && !isEditingTitle ? "cursor-pointer" : isEditingTitle ? "" : "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
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

        <Avatar name={meeting.title} size="md" colorScheme={colorMap[avatarKey]} />

        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5" onClick={stopCardEvents}>
              <input
                ref={titleInputRef}
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                onBlur={commitRename}
                maxLength={200}
                className="flex-1 min-w-0 px-2 py-1 -mx-2 -my-1 text-base font-bold text-slate-800 bg-white border border-primary-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-all"
                placeholder="Nhập tên cuộc họp..."
                aria-label="Đổi tên cuộc họp"
              />
            </div>
          ) : (
            <div className="group flex items-start gap-1 min-w-0">
              <h3 className="font-bold text-slate-800 truncate min-w-0" title={meeting.title}>
                {meeting.title}
              </h3>
              {onRename && (
                <Tooltip content="Đổi tên cuộc họp">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditingTitle();
                    }}
                    aria-label="Đổi tên cuộc họp"
                    className="shrink-0 -mt-0.5 p-1 text-slate-300 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors group-hover:text-slate-500"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
              )}
            </div>
          )}
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

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {currentTab === "all" && (REPROCESS_STATUS as readonly MeetingStatus[]).some(s => s === meeting.status) && (
            <Tooltip content="Xử lý lại">
              <button onClick={onReprocess} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
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

          {(meeting.status === MEETING_STATUS.COMPLETED || meeting.status === MEETING_STATUS.TRANSCRIBED) && (
            <Tooltip content="Xem / Sửa">
              <button onClick={onOpen} className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                <Edit3 className="w-4 h-4" />
              </button>
            </Tooltip>
          )}

          {currentTab === "all" && (
            <Tooltip content="Xóa">
              <button onClick={onMoveToTrash} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </Tooltip>
          )}

          {currentTab === "trash" && (
            <>
              <Tooltip content="Khôi phục">
                <button onClick={onRestore} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                  <FolderOpen className="w-4 h-4" />
                </button>
              </Tooltip>
              <Tooltip content="Xóa vĩnh viễn">
                <button onClick={onDeleteForever} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
