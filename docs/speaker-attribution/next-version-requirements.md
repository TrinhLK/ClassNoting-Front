# Extension 0.4.0 — yêu cầu và kiểm chứng

## Quy tắc đã xác nhận

- Nhận diện người nói theo tài khoản/participant Google Meet. Hai tài khoản cùng tên không được gộp vì trùng tên. Khi thiếu bằng chứng thì giữ trạng thái chưa xác định.
- Cùng tài khoản: một đoạn chứa tối đa năm nhịp ngừng nói; mỗi nhịp là khoảng im lặng VAD xác nhận từ **1 giây**. Nhịp thứ năm đóng đoạn, câu tiếp theo mở đoạn mới.
- Đổi tài khoản: mở đoạn mới ngay khi ASR có kết quả kèm bằng chứng tài khoản; không đợi đủ năm nhịp.
- Các gói ASR vẫn gửi liên tục. Lần cắt audio vì dài, retry, filler bị lọc và kết thúc phiên không tự được coi là nhịp ngắt.
- **Bỏ chức năng cảnh báo mic** theo yêu cầu người dùng.
- Hậu xử lý giữ thông tin tài khoản đã ghi nhận từ Meet; không thay bằng các cụm giọng chưa xác định.

## Đối chiếu STT

Người dùng lấy nút **Ghi âm trực tiếp trên trang chủ Smart Noting** (Gipformer trên Zeabur) làm chuẩn.

- Web: `app/hooks/useLocalTranscription.ts` đọc `NEXT_PUBLIC_REALTIME_PROCESSING_SERVER`; local dùng `wss://asr-live.noting.io.vn`, mặc định khi thiếu biến là `wss://asr.noting.io.vn`.
- Extension: `extension/src/background.js` dùng `wss://asr-live.noting.io.vn`.
- Server realtime ưu tiên Gipformer 1.5 ONNX INT8, fallback Zipformer nếu thiếu model. Handshake mới báo family, thư mục và tên encoder thực tế được chọn khi khởi động; không khẳng định hash trọng số.
- Repository xử lý file dùng Vietnamese Zipformer `sherpa-onnx-zipformer-vi-2025-04-20` và pipeline phân biệt giọng riêng.
- Không đổi model chỉ từ nhận xét chất lượng. Cần so cùng audio để tách ảnh hưởng của nguồn mic/tab, tiếng vọng và cách cắt audio.

## Triển khai

Frontend lưu `paragraphId` cho từng gói ASR, gom đoạn khi hiển thị và kết xuất; giữ nguyên lịch sử thô. Extension chỉ bật quy tắc năm nhịp khi server xác nhận `segmentation.boundary_events=true` và `pause_seconds=1`. Server cũ giữ cách hiển thị từng gói, popup thông báo chưa hỗ trợ.

Server realtime thêm query `pause_seconds=1`, sự kiện `boundary`, `utterance_id` và thông tin model trong `ready`. Ghi âm web không truyền query vẫn giữ ngưỡng 0,8 giây. Extension giữ trạng thái VAD qua lần cắt audio 8 giây để không mất nhịp im lặng tiếp theo.

## Kiểm tra trước triển khai (21/10/2026)

- 97 kiểm thử frontend/API liên quan đạt.
- Kiểm tra TypeScript mã ứng dụng đạt; TypeScript toàn repo còn lỗi ở các bộ test cũ.
- 4 kiểm thử server với recognizer/VAD giả lập đạt: ngưỡng hợp lệ, năm nhịp, cắt dài không tính nhịp, filler không làm mất nhịp, flush không tạo nhịp.
- Kiểm tra cú pháp extension và diff đạt.
- Handshake production trước cập nhật: protocol 2, diarization tắt, chưa có segmentation/model metadata. `asr.noting.io.vn` trả HTTP 530.
- Chrome Zeabur runtime log có cùng connection scope `75c1693b` với probe `asr-live.noting.io.vn`, xác nhận đúng dịch vụ đang kiểm tra.

Chưa thay thế nghiệm thu Chrome của phiên bản 0.3.14. Kết quả sau deploy phải ghi riêng.
