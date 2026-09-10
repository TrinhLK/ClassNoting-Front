"use client";

interface LiveStatusBarProps {
  timer: number;
  remainingMinutesWarning: number | null;
  formatTime: (s: number) => string;
}

export default function LiveStatusBar({ timer, remainingMinutesWarning, formatTime }: LiveStatusBarProps) {
  return (
    <div className="flex items-center gap-2 md:gap-3 px-4 md:px-6 py-2 bg-slate-50 border-b shrink-0">
      <div className="flex flex-col">
        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Thời gian</span>
        <span className="text-sm md:text-base font-mono font-bold text-slate-700">{formatTime(timer)}</span>
      </div>
      {remainingMinutesWarning !== null && (
        <div
          className={`flex flex-col border-l pl-3 md:pl-4 transition-colors cursor-help ${remainingMinutesWarning < 15 ? 'border-red-200' : 'border-slate-200'}`}
          title="Khi cuộc họp kéo dài quá con số còn lại, hệ thống sẽ bị mất một số trường khi lưu cuộc họp. Điều này dẫn đến khi xem lại cuộc họp sẽ không có hiệu ứng màu chữ chạy theo giọng nói."
        >
          <span className={`text-[10px] font-bold uppercase tracking-wider ${remainingMinutesWarning < 15 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>
            {remainingMinutesWarning < 15 ? 'Sắp đầy bộ nhớ' : 'Dự kiến'}
          </span>
          <span className={`text-xs font-medium ${remainingMinutesWarning < 15 ? 'text-red-600' : 'text-slate-500'}`}>
            Còn ~{remainingMinutesWarning} phút
          </span>
        </div>
      )}
    </div>
  );
}
