# Chính sách quyền riêng tư — Smart Noting / ClassNoting

Cập nhật: 21/10/2026. Chính sách áp dụng cho extension ClassNoting kết nối Google Meet với Smart Noting.

## Dữ liệu được xử lý

Khi bạn đăng nhập, hệ thống xử lý UID, tên, email và token Firebase để xác thực và lưu phiên vào tài khoản của bạn. Token extension nằm trong bộ nhớ phiên của Chrome.

Khi bạn bắt đầu ghi thủ công hoặc chủ động bật tự động ghi, extension đọc URL/mã cuộc họp, tên và định danh người tham gia trong Meet, trạng thái mic/phát biểu, phụ đề, nội dung chat, người gửi và mốc thời gian. Extension thu âm thanh tab Meet và tab nguồn âm thanh khác khi bạn chủ động thêm tab đó vào cùng phiên họp. Nếu bạn cấp quyền micro, luồng mic của extension chỉ mở khi đọc được mic Meet đang bật. Không thu video/camera. Extension không thu lịch sử duyệt web ngoài các trang cuộc họp mà nó hỗ trợ.

## Mục đích và nơi xử lý

Âm thanh được truyền qua TLS/WebSocket tới asr-live.noting.io.vn, dịch vụ nhận dạng giọng nói trên Zeabur, để tạo transcript. Dữ liệu phiên được gửi đến API Smart Noting trên Vercel. Âm thanh các đoạn ghi được lưu trong Firebase Storage; transcript, chat, người tham gia và biên bản được lưu trong Firestore. Firebase Authentication được dùng để đăng nhập.

Khi bạn mở trang live có Live insight hoặc dùng tính năng AI trên web, nội dung văn bản liên quan được gửi qua API của Smart Noting tới Google Gemini để tóm tắt hoặc xử lý theo tính năng. Việc xử lý của từng nhà cung cấp còn chịu chính sách và cấu hình tài khoản dịch vụ của họ.

Các đơn vị cung cấp hạ tầng xử lý dữ liệu để vận hành tính năng. Dữ liệu có thể được xử lý ở ngoài Việt Nam tùy vị trí hạ tầng. Smart Noting không bán dữ liệu cuộc họp, không dùng cho quảng cáo cá nhân hóa, đánh giá tín dụng hoặc cho vay. Việc sử dụng và chuyển dữ liệu người dùng tuân thủ Chrome Web Store User Data Policy, bao gồm các yêu cầu Limited Use.

## Lưu trữ, chia sẻ và xóa

Cài đặt được lưu trên Chrome; audio chưa gửi thành công được lưu tạm trong IndexedDB để thử lại và được xóa khỏi hàng đợi khi gửi thành công. Gỡ extension xóa dữ liệu cục bộ của extension, nhưng không xóa các bản ghi đã gửi lên máy chủ.

Bản ghi trên máy chủ không có thời hạn tự xóa cố định ở phiên bản hiện tại. Chủ tài khoản có thể đưa biên bản vào thùng rác và xóa biên bản qua giao diện; thao tác này chưa đồng nghĩa xóa toàn bộ phiên extension, lịch sử phiên hoặc các file audio liên quan. Để yêu cầu xóa đầy đủ dữ liệu phiên/audio/tài khoản, hãy gửi yêu cầu từ email tài khoản của bạn tới trinhlk.vnu@gmail.com; hệ thống cần xác minh quyền sở hữu trước khi xử lý. Không gửi mật khẩu hoặc token qua email.

Chủ phiên có thể tạo liên kết chia sẻ chỉ đọc cho transcript, người nói và chat. Bất kỳ ai có liên kết và khóa truy cập đều có thể xem phạm vi được chia sẻ; hãy chỉ gửi cho người được phép. Biên bản cũng có tính năng chia sẻ trên web. Không đăng công khai liên kết nếu nội dung riêng tư.

## Quyền kiểm soát

Bạn có thể chọn ghi thủ công, tắt tự động ghi trong popup, bấm Kết thúc & tạo biên bản hoặc đóng tab họp để dừng thu; thu hồi quyền micro trong Chrome hoặc gỡ extension để ngừng sử dụng. Tắt mic Meet làm extension ngừng luồng mic khi đọc được trạng thái tắt; âm thanh tab vẫn được ghi trong phiên đang hoạt động.

Hãy thông báo và có sự đồng ý phù hợp của người tham gia trước khi ghi âm/chat/phụ đề. Nội dung nhận dạng và gán tên có thể có sai sót; hãy kiểm tra trước khi dùng hoặc chia sẻ biên bản.

## Liên hệ và thay đổi

Smart Noting / ClassNoting: trinhlk.vnu@gmail.com. Hướng dẫn: https://smart-noting.vercel.app/extension. Phiên bản chính sách mới sẽ ghi ngày cập nhật trên trang này.
