'use client';
import { useEffect, useState } from 'react';
import type { Meeting } from '@/app/lib/db';
import { summaryProgressView } from '@/app/lib/summary-progress';

export default function SummaryProgress({meeting}: {meeting: Meeting}) {
  const [now, setNow] = useState(Date.now);
  const progress = meeting.summaryProgress;
  const active = meeting.status === 'summarizing' || (progress && !['completed', 'failed'].includes(progress.stage));
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, progress?.operationId]);
  const view = summaryProgressView(progress, meeting.status, now);
  if (!view) return null;
  const elapsed = view.elapsed === null ? '' : `${Math.floor(view.elapsed/60)}:${String(view.elapsed%60).padStart(2,'0')}`;
  return <div className={`mt-3 rounded-lg border p-3 text-xs ${view.needsAttention ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-indigo-100 bg-indigo-50 text-indigo-900'}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong role="status">{view.label}</strong>
      {elapsed && <span>Đã chạy {elapsed}</span>}
    </div>
    {progress?.templateName && <p className="mt-1">Mẫu: {progress.templateName}</p>}
    <div role="progressbar" aria-label="Tiến độ quy trình tóm tắt" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={view.indeterminate ? undefined : view.percent}
      aria-valuetext={view.indeterminate ? view.label : `${view.percent}% — hoàn thành ${view.completedSteps}/3 bước`}
      className="mt-2 h-1.5 overflow-hidden rounded-full bg-indigo-100">
      <div className="h-full rounded-full bg-indigo-600" style={{width: view.indeterminate ? '0%' : `${view.percent}%`}} />
    </div>
    {!view.indeterminate && <p className="mt-1">{view.percent}% quy trình · hoàn thành {view.completedSteps}/3 bước</p>}
    <p className="mt-1 text-slate-600">Chuẩn bị → AI tạo biên bản → Lưu kết quả</p>
    {progress?.stage === 'generating' && !view.needsAttention && <p className="mt-1">AI không cung cấp % sinh nội dung. Tiến độ sẽ cập nhật khi AI trả kết quả.</p>}
  </div>;
}
