"use client";
import { useRouter } from "next/navigation";
import { CheckSquare, Square, Calendar, Clock, ChevronRight, FileText } from "lucide-react";
import type { Meeting } from "@/app/lib/db";
import { cn } from "@/app/lib/cn";
import Avatar from "../ui/Avatar";

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

  const snippet = meeting.summary
    ? searchQuery.trim()
      ? getHighlightedSnippet(meeting.summary, searchQuery.trim())
      : getSummaryPreview(meeting.summary)
    : null;

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
        <button onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }} className="mt-1 shrink-0" aria-label={isSelected ? "Bỏ chọn" : "Chọn"}>
          {isSelected ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5 text-slate-300 group-hover:text-primary-400" />}
        </button>

        <Avatar name={meeting.title} size="md" colorScheme={{ bg: "bg-primary-100", text: "text-primary-600" }} />

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 mb-1 line-clamp-1 group-hover:text-primary-700 transition-colors">
            {meeting.title}
          </h3>
          <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(meeting.createdAt)}</span>
            {meeting.duration > 0 && (
              <span className="flex items-center gap-1 font-mono"><Clock className="w-3 h-3" />{formatDuration(meeting.duration)}</span>
            )}
          </div>
          {snippet && <div className="text-sm text-slate-600 line-clamp-2">{snippet}</div>}
        </div>

        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary-600 transition-colors shrink-0 mt-1" />
      </div>
    </div>
  );
}
