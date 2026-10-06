/**
 * Worker RunPod trả lỗi này khi endpoint đang chạy bản cũ chưa có action refine_meeting.
 * Map sang tiếng Việt hành động được thay vì text thô của worker.
 */
export function explainRefinementError(error: string): string {
  if (/unknown action/i.test(error)) {
    return "Worker RunPod đang chạy bản cũ, chưa hỗ trợ phân tích lại. Hãy rebuild + redeploy worker từ repo ClassNoting-File-Processing bản mới nhất rồi thử lại.";
  }
  return error;
}
