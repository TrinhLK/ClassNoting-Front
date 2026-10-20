# Kiểm thử Chrome — 20/10/2026

## Môi trường

- Google Chrome trên máy người dùng, extension unpacked `0.3.14`, ID `nilndoopapocldljabmpkioeblhibfmm`.
- Google Meet `bxt-umrg-yfg`, hai profile Chrome/tài khoản: `ai_arena_vietnam AI Arena Vietnam` và `Lê Khánh Trình`.
- Web production: `https://smart-noting.vercel.app`.
- Phiên nghiệm thu cuối: `Na4wm2X08OTNHRMNPe5g`.
- Người dùng đã xác nhận cấp quyền micro; mic được chuyển lần lượt giữa hai tài khoản, không bật đồng thời khi đọc câu thử.

## Kết quả quan sát thực tế

- Roster đọc được đủ hai tài khoản.
- Hai tin `FINAL-014-A` và `FINAL-014-B` xuất hiện trên trang live dưới đúng tên người gửi, tổng cộng hai tin, không có bản vô danh trùng lặp.
- Câu thử của người tham gia thứ hai xuất hiện dưới tên `Lê Khánh Trình` cho phần lớn câu; một phần đuôi câu vẫn là `Chưa xác định`.
- Câu thử cuối của chủ phòng xuất hiện dưới tên `ai_arena_vietnam AI Arena Vietnam`.
- Phiên cuối đã dừng và lưu biên bản `ext_Na4wm2X08OTNHRMNPe5g`: 31 đoạn nhận dạng, 2 chat, 2 người. Mic cả hai tài khoản đã tắt trước khi kết thúc cuộc họp thử.
- Sau khi mở `/meeting/ext_Na4wm2X08OTNHRMNPe5g`, trang tự áp kết quả hậu xử lý: UI báo đã cập nhật transcript, danh sách có 20 nhãn người nói và 45 đoạn. Kết quả này khác bản live, chưa đạt yêu cầu bảo toàn danh tính; luồng hậu xử lý không được sửa/deploy trong lượt này. Dùng trang `/ext/Na4wm2X08OTNHRMNPe5g` để đối chiếu kết quả realtime đã quan sát.
- ASR có lỗi từ ngữ (ví dụ “chủ phòng” thành “trưởng phòng”); đây chưa phải phép đo WER hay kiểm chứng độ chính xác tuyệt đối.
- Popup xác nhận tab và mic đều protocol 2; mic cục bộ thu khi Meet bật mic và bị khóa khi Meet tắt mic.
- Handshake server thực tế: `protocol: 2`, `diarization: false`. Tên hiện dựa trên bằng chứng Meet/phụ đề và vẫn được đánh dấu chưa xác nhận. Chưa nghiệm thu nói chồng, trùng tên, phụ đề tắt hoặc diarization bằng giọng.

## Thay đổi

- Chọn bubble chat thay vì nút ghim mang cùng ID; chờ metadata người gửi của record đang render; đọc header chung của nhóm chat.
- ID chat ổn định qua tải lại; một collector mỗi isolated world; quét lại roster/chat khi nhận session.
- Đọc tên trên tile Meet hiện tại, tên và nội dung phụ đề trong cùng hàng; kiểm tra document PiP khi toolbar/phụ đề được chuyển sang cửa sổ nổi.
- Gửi metadata phụ đề khi câu đang phát triển; giữ mốc bắt đầu khi Google sửa lại các từ trước đó.
- Tách bằng chứng local/remote khi gán tên cho mic/tab; không mặc định mọi âm thanh mic là chủ phiên.
- Khởi động audio dùng `provider` từ API, sửa trường hợp popup không gửi provider làm mic bị khóa.
- Popup cập nhật trạng thái trong lúc mở để không giữ nguyên thông tin khởi tạo cũ.

## Kiểm tra mã nguồn

74 kiểm thử đạt trong sáu file: `extension-platforms`, `extension-content`, `extension-start`, `extension-history`, `realtime-protocol`, `speaker-pipeline`. Các file JavaScript extension qua `node --check`; `git diff --check` đạt.

Các thay đổi extension đã nạp trong Chrome tại máy. Không triển khai frontend/Vercel hoặc thay đổi cấu hình/model server ASR trong lượt này.
