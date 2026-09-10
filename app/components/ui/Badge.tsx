import { MeetingStatus, MEETING_STATUS, MEETING_STATUS_LABELS } from "@/app/lib/constants";
import { cn } from "@/app/lib/cn";

const statusStyles: Record<MeetingStatus, string> = {
  [MEETING_STATUS.DRAFT]:        "bg-slate-100 text-slate-600 border-slate-200",
  [MEETING_STATUS.TRANSCRIBING]: "bg-blue-50 text-blue-700 border-blue-200",
  [MEETING_STATUS.TRANSCRIBED]:  "bg-primary-50 text-primary-700 border-primary-200",
  [MEETING_STATUS.SUMMARIZING]:  "bg-amber-50 text-amber-700 border-amber-200",
  [MEETING_STATUS.COMPLETED]:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  [MEETING_STATUS.FAILED]:       "bg-red-50 text-red-700 border-red-200",
};

interface BadgeProps {
  status: MeetingStatus;
  className?: string;
}

export default function Badge({ status, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
        statusStyles[status] || statusStyles[MEETING_STATUS.DRAFT],
        className
      )}
    >
      {MEETING_STATUS_LABELS[status] || status}
    </span>
  );
}
