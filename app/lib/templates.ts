export interface MeetingTemplate {
    id: string;
    name: string;
    description: string;
    structure: string; // The instruction/prompt for this template
    isCustom?: boolean; // To distinguish between system and user templates
    userId?: string; // Owner of the custom template
}

export const DEFAULT_TEMPLATES: MeetingTemplate[] = [
    {
        id: "GENERAL",
        name: "Họp Tổng Quát (Mặc định)",
        description: "Phù hợp cho hầu hết các loại cuộc họp thông thường.",
        structure: `
      # BIÊN BẢN TÓM TẮT CUỘC HỌP

      ## 1. TỔNG QUAN
      - **Mục đích:** (Tóm tắt mục tiêu chính)
      - **Thành phần tham gia:** (Nếu có trong transcript)

      ## 2. TÓM TẮT TỪNG CHỦ ĐỀ
      *(Liệt kê và diễn giải TẤT CẢ các chủ đề đã được thảo luận)*
      - **[Chủ đề 1]:**
        - Ai nói / trình bày: ...
        - Nội dung chi tiết: ...
        - Số liệu / dữ kiện cụ thể (nếu có): ...
        - Kết luận: ...

      ## 3. QUYẾT ĐỊNH ĐÃ CHỐT
      - **[Quyết định 1]:** ... (người quyết định: ...)

      ## 4. PHÂN CÔNG NHIỆM VỤ (ACTION ITEMS)
      - [ ] **[Tên người]** - [Nhiệm vụ] - [Deadline]

      ## 5. VẤN ĐỀ CHƯA GIẢI QUYẾT / RỦI RO
      - ...

      ## 6. GHI CHÚ BỔ SUNG
      *(Số liệu quan trọng, câu nói đáng chú ý)*
      - ...
    `
    },
    {
        id: "BOARD_MEETING",
        name: "Họp Hội Đồng Quản Trị / Cổ Đông",
        description: "Trang trọng, tập trung vào các nghị quyết và bỏ phiếu.",
        structure: `
      # BIÊN BẢN HỌP HỘI ĐỒNG QUẢN TRỊ

      **Thời gian:** ...
      **Thành phần tham dự:** ...

      ## 1. CÁC VẤN ĐỀ ĐƯỢC THÔNG QUA (NGHỊ QUYẾT)
      - **Nghị quyết 01:** [Nội dung đã biểu quyết thông qua]
        - Tỷ lệ tán thành: ...

      ## 2. BÁO CÁO HOẠT ĐỘNG
      - **Tình hình tài chính:** (Trích xuất chính xác các con số doanh thu, lợi nhuận...)
      - **Vận hành:** ...

      ## 3. THẢO LUẬN CHIẾN LƯỢC
      - [Vấn đề thảo luận]: [Các ý kiến chính]

      ## 4. KẾ HOẠCH TIẾP THEO
      - [Hành động chiến lược]
    `
    },
    {
        id: "DAILY_STANDUP",
        name: "Họp Daily Standup (Agile)",
        description: "Cực kỳ ngắn gọn: Đã làm gì? Sẽ làm gì? Vướng mắc?",
        structure: `
      # DAILY STANDUP MEETING

      ## 1. HÔM QUA ĐÃ LÀM GÌ?
      - **[Tên thành viên]:** [Công việc đã hoàn thành]

      ## 2. HÔM NAY SẼ LÀM GÌ?
      - **[Tên thành viên]:** [Kế hoạch]

      ## 3. VƯỚNG MẮC (BLOCKERS)
      - [Vấn đề đang gặp phải] -> [Ai hỗ trợ?]
    `
    },
    {
        id: "BRAINSTORMING",
        name: "Họp Brainstorming / Lên Ý Tưởng",
        description: "Liệt kê ý tưởng, không cần cấu trúc hành chính quá chặt chẽ.",
        structure: `
      # KẾT QUẢ BRAINSTORMING

      ## 1. MỤC TIÊU CỦA BUỔI BRAINSTORM
      - ...

      ## 2. DANH SÁCH Ý TƯỞNG (IDEAS)
      - 💡 **[Ý tưởng 1]:** [Mô tả chi tiết]
      - 💡 **[Ý tưởng 2]:** [Mô tả chi tiết]
      - ...

      ## 3. Ý TƯỞNG ĐƯỢC CHỌN (FINAL SELECTION)
      - **[Ý tưởng thắng cuộc]:** [Lý do chọn]

      ## 4. NEXT STEPS
      - [Bước triển khai thử nghiệm]
    `
    }
];
