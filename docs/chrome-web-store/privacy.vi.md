# Chính sách quyền riêng tư — EzNoting

Cập nhật: 21/10/2026. Chính sách áp dụng cho extension EzNoting kết nối Google Meet với EzNoting.

## Dữ liệu được xử lý

Khi bạn đăng nhập, hệ thống xử lý UID, tên, email và token Firebase để xác thực và lưu phiên vào tài khoản của bạn. Token extension nằm trong bộ nhớ phiên của Chrome.

Khi bạn bắt đầu ghi thủ công hoặc chủ động bật tự động ghi, extension đọc URL/mã cuộc họp, tên và định danh người tham gia trong Meet, trạng thái mic/phát biểu, phụ đề, nội dung chat, người gửi và mốc thời gian. Extension thu âm thanh tab Meet và tab nguồn âm thanh khác khi bạn chủ động thêm tab đó vào cùng phiên họp. Nếu bạn cấp quyền micro, luồng mic của extension chỉ mở khi đọc được mic Meet đang bật. Không thu video/camera. Extension không thu lịch sử duyệt web ngoài các trang cuộc họp mà nó hỗ trợ.

## Mục đích và nơi xử lý

Âm thanh được truyền qua TLS/WebSocket tới asr-live.noting.io.vn, dịch vụ nhận dạng giọng nói trên Zeabur, để tạo transcript. Dữ liệu phiên được gửi đến API EzNoting trên Vercel. Âm thanh các đoạn ghi được lưu trong Firebase Storage; transcript, chat, người tham gia và biên bản được lưu trong Firestore. Firebase Authentication được dùng để đăng nhập.

Khi chủ phiên mở trang live có Live insight hoặc dùng tính năng AI trên web, nội dung văn bản liên quan được gửi qua API của EzNoting tới Google Gemini để tóm tắt hoặc xử lý theo tính năng. Việc xử lý của từng nhà cung cấp còn chịu chính sách và cấu hình tài khoản dịch vụ của họ.

Bạn có thể thêm Gemini API key riêng trong Thiết lập tài khoản. Key được truyền qua HTTPS tới máy chủ EzNoting, mã hóa AES-256-GCM theo tài khoản trong vùng dữ liệu chỉ server truy cập, và được giải mã khi gọi API Google Gemini. Giao diện chỉ trả trạng thái và bốn ký tự cuối; key không nằm trong extension và không ghi vào log. “Kiểm tra & lưu” gửi một prompt kiểm tra cố định rất ngắn tới Google, không gửi transcript để kiểm tra key. Bạn có thể thay hoặc xóa key trong thiết lập; thao tác xóa ngừng dùng key cho yêu cầu mới, không hủy yêu cầu đang xử lý.

Các tính năng AI ưu tiên key riêng nếu được cấu hình; chi phí/hạn mức thuộc project cấp key. Khi key riêng lỗi, hệ thống báo lỗi và không tự dùng key hệ thống. Người dùng phải xác nhận project cấp key có Cloud Billing đang hoạt động (Gemini Paid Services) trước khi lưu để xử lý nội dung cuộc họp. Google không dùng prompt/phản hồi Paid Services để cải thiện sản phẩm; vẫn có thể lưu giới hạn phục vụ phát hiện lạm dụng theo điều khoản Google. Thông tin billing do chủ key xác nhận, không được suy ra chỉ từ việc gọi API thành công.

Nếu không có key riêng, mỗi tài khoản được AI xử lý miễn phí tối đa 10 cuộc họp khác nhau, bao gồm Live insight và các thao tác AI theo cuộc họp. Hệ thống lưu định danh cuộc họp đã dùng lượt và bộ đếm gắn với UID để thực thi hạn mức; chỉ tính khi xử lý thành công lần đầu, xử lý lại cùng cuộc họp không tính thêm. Hạn mức không đặt lại theo tháng và không được xóa khi thay/xóa key hay xóa biên bản. Quản trị viên hệ thống có thể cấp thêm hoặc đặt không giới hạn hạn mức AI của tài khoản; việc cấp hạn mức không xóa lịch sử sử dụng. Hết hạn mức chỉ ngừng AI cho cuộc họp mới; ghi âm, transcript và chat vẫn hoạt động. Yêu cầu đang xử lý có thể tạm giữ lượt và sẽ hoàn lại nếu thất bại.

Các đơn vị cung cấp hạ tầng xử lý dữ liệu để vận hành tính năng. Dữ liệu có thể được xử lý ở ngoài Việt Nam tùy vị trí hạ tầng. EzNoting không bán dữ liệu cuộc họp, không dùng cho quảng cáo cá nhân hóa, đánh giá tín dụng hoặc cho vay. Việc sử dụng và chuyển dữ liệu người dùng tuân thủ Chrome Web Store User Data Policy, bao gồm các yêu cầu Limited Use.

## Lưu trữ, chia sẻ và xóa

Cài đặt được lưu trên Chrome; audio chưa gửi thành công được lưu tạm trong IndexedDB để thử lại và được xóa khỏi hàng đợi khi gửi thành công. Gỡ extension xóa dữ liệu cục bộ của extension, nhưng không xóa các bản ghi đã gửi lên máy chủ.

Bản ghi trên máy chủ không có thời hạn tự xóa cố định ở phiên bản hiện tại. Chủ tài khoản có thể đưa biên bản vào thùng rác và xóa biên bản qua giao diện; thao tác này chưa đồng nghĩa xóa toàn bộ phiên extension, lịch sử phiên hoặc các file audio liên quan. Để yêu cầu xóa đầy đủ dữ liệu phiên/audio/tài khoản, hãy gửi yêu cầu từ email tài khoản của bạn tới trinhlk.vnu@gmail.com; hệ thống cần xác minh quyền sở hữu trước khi xử lý. Không gửi mật khẩu hoặc token qua email.

Chủ phiên có thể tạo liên kết chia sẻ chỉ đọc cho transcript, người nói và chat. Bất kỳ ai có liên kết và khóa truy cập đều có thể xem phạm vi được chia sẻ; hãy chỉ gửi cho người được phép. Biên bản cũng có tính năng chia sẻ trên web. Không đăng công khai liên kết nếu nội dung riêng tư.

## Hoạt động tài khoản và quản trị hạn mức

Khi bạn đăng nhập và mở web EzNoting, web gửi một mốc thời gian hoạt động gắn với UID, cập nhật định kỳ khi trang đang hiển thị. Không gửi URL, thao tác gõ hoặc nội dung cuộc họp qua tín hiệu hoạt động này. Hệ thống dùng mốc truy cập/đăng nhập và sử dụng AI để thống kê hoạt động gần đây và quản lý hạn mức tài khoản; đây không phải bằng chứng tài khoản đang trực tuyến ngay lúc xem.

Tab quản trị chỉ dành cho tài khoản quản trị được chỉ định, hiển thị tên, email, trạng thái kích hoạt, thời điểm tạo/hoạt động gần đây, số cuộc họp đã dùng AI hệ thống, hạn mức được cấp và trạng thái có/không key riêng. Tab này không hiển thị key riêng hay nội dung cuộc họp. Mọi lần điều chỉnh hạn mức được lưu nhật ký với UID quản trị, UID tài khoản đích, thay đổi hạn mức và thời điểm. Các bản ghi hạn mức, hoạt động và nhật ký do server quản lý; không cho phép client trực tiếp sửa.

## Quyền kiểm soát

Bạn có thể chọn ghi thủ công, tắt tự động ghi trong popup, bấm Kết thúc & tạo biên bản hoặc đóng tab họp để dừng thu; thu hồi quyền micro trong Chrome hoặc gỡ extension để ngừng sử dụng. Tắt mic Meet làm extension ngừng luồng mic khi đọc được trạng thái tắt; âm thanh tab vẫn được ghi trong phiên đang hoạt động.

Hãy thông báo và có sự đồng ý phù hợp của người tham gia trước khi ghi âm/chat/phụ đề. Nội dung nhận dạng và gán tên có thể có sai sót; hãy kiểm tra trước khi dùng hoặc chia sẻ biên bản.

## Liên hệ và thay đổi

EzNoting: trinhlk.vnu@gmail.com. Hướng dẫn: https://smart-noting.vercel.app/extension. Phiên bản chính sách mới sẽ ghi ngày cập nhật trên trang này.
