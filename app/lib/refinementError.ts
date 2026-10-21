/**
 * Worker RunPod trả lỗi này khi endpoint đang chạy bản cũ chưa có action refine_meeting.
 * Map sang tiếng Việt hành động được thay vì text thô của worker.
 */
export function explainRefinementError(error: string): string {
  if (/unknown action/i.test(error)) {
    return "Máy chủ xử lý của EzNoting đang chạy bản cũ, chưa hỗ trợ phân tích lại. Vui lòng liên hệ quản trị viên để cập nhật dịch vụ rồi thử lại.";
  }
  return error;
}
