"use client";
import { useRouter } from "next/navigation";
import { Calendar, Mail, CheckCircle, Clock, Eye, RotateCcw, ArrowRightFromLine, Loader2 } from "lucide-react";
import type { Meeting } from "@/app/lib/db";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import { cn } from "@/app/lib/cn";

interface TaskListProps {
  meetings: Meeting[];
  loading: boolean;
  isProcessing: boolean;
  selectedMeetingId: string | null;
  onOpenMeeting: (m: Meeting) => void;
  onViewDetails: (m: Meeting) => void;
  onExtract: (m: Meeting) => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  send: { label: "Đã gửi mail", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Mail },
  draft: { label: "Bản nháp", className: "bg-slate-50 text-slate-600 border-slate-200", icon: Clock },
};

export default function TaskList({ meetings, loading, isProcessing, selectedMeetingId, onOpenMeeting, onViewDetails, onExtract }: TaskListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
            <div className="space-y-3"><div className="h-5 bg-slate-200 rounded w-2/3" /><div className="h-4 bg-slate-100 rounded w-1/3" /></div>
          </div>
        ))}
      </div>
    );
  }

  if (meetings.length === 0) {
    return <EmptyState icon={<CheckCircle className="w-8 h-8" />} title="Không tìm thấy cuộc họp nào" description="Tạo cuộc họp trước, sau đó quay lại trích xuất task." />;
  }

  return (
    <div className="space-y-3">
      {meetings.map((meeting) => {
        const hasData = meeting.actionItems && meeting.actionItems.length > 0;
        const statusKey = meeting.actionStatus === ("send" as any) ? "send" : "draft";
        const config = hasData
          ? { label: statusKey === "send" ? "Đã gửi mail" : "Đã xử lý", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: statusKey === "send" ? Mail : CheckCircle }
          : STATUS_CONFIG[statusKey];
        const StatusIcon = config.icon;
        const isProcessingThis = isProcessing && selectedMeetingId === meeting.id;

        return (
          <div key={meeting.id} className="bg-white rounded-2xl border border-slate-200 hover:shadow-md transition-shadow p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Avatar name={meeting.title} size="md" colorScheme={{ bg: "bg-primary-100", text: "text-primary-600" }} />
                <div className="flex-1 min-w-0">
                  <h3 onClick={() => onOpenMeeting(meeting)} className="font-bold text-lg text-slate-800 hover:text-primary-600 cursor-pointer transition-colors line-clamp-1">
                    {meeting.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 mt-2">
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{new Date(meeting.createdAt).toLocaleString("vi-VN")}</span>
                    <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border", config.className)}>
                      <StatusIcon className="w-3 h-3" />{config.label}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasData ? (
                  <>
                    <Button variant="primary" size="sm" onClick={() => onViewDetails(meeting)} leftIcon={<Eye className="w-4 h-4" />}>Xem chi tiết</Button>
                    <Button variant="ghost" size="sm" onClick={() => onExtract(meeting)} disabled={isProcessing} aria-label="Trích xuất lại">
                      {isProcessingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => onExtract(meeting)} disabled={!meeting.segments || isProcessing} loading={isProcessingThis} leftIcon={isProcessingThis ? undefined : <ArrowRightFromLine className="w-4 h-4" />}>
                    {isProcessingThis ? "Đang xử lý..." : "Trích xuất Task"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
