export type SummaryStage = 'preparing' | 'naming' | 'generating' | 'saving' | 'completed' | 'failed';
export type SummaryProgress = {
  operationId: string;
  stage: SummaryStage;
  startedAt: number;
  updatedAt: number;
  templateName?: string;
};

export function summaryProgressView(progress: SummaryProgress | undefined, status: string, now = Date.now()) {
  if (!progress && status !== 'summarizing') return null;
  const stage = progress?.stage || 'preparing';
  const end = progress && ['completed', 'failed'].includes(stage) ? progress.updatedAt : now;
  const elapsed = progress ? Math.max(0, Math.floor((end - progress.startedAt) / 1000)) : null;
  const interrupted = !['failed', 'completed'].includes(stage) && elapsed !== null && elapsed >= 7 * 60;
  const completedSteps = stage === 'completed' ? 3 : stage === 'saving' ? 2 : stage === 'generating' ? 1 : 0;
  const labels: Record<SummaryStage, string> = {
    preparing: 'Chuẩn bị nội dung', naming: 'Đối chiếu tên người nói',
    generating: 'Đang chờ AI tạo biên bản', saving: 'Đang lưu kết quả',
    completed: 'Đã hoàn thành', failed: 'Tóm tắt chưa hoàn tất',
  };
  return { label: interrupted ? 'Quá thời gian chờ — hãy kiểm tra và thử lại'
      : !progress ? 'Đang tóm tắt — chưa có dữ liệu tiến độ' : labels[stage],
    elapsed, completedSteps, percent: Math.floor(completedSteps / 3 * 100),
    indeterminate: !progress || interrupted || stage === 'failed',
    needsAttention: interrupted || stage === 'failed' };
}
