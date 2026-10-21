# Hồ sơ phát hành EzNoting

Tài khoản phát hành được chủ sản phẩm chọn: `trinhlk.vnu@gmail.com`.

## Listing

- Tên: EzNoting
- Danh mục: Productivity / Tools (chọn mục tương ứng trong dashboard)
- Ngôn ngữ: Tiếng Việt
- Trang chủ / hỗ trợ: https://smart-noting.vercel.app/extension
- Chính sách riêng tư: https://smart-noting.vercel.app/privacy
- Hiển thị dự kiến: Public; gửi duyệt không có nghĩa đã được Google công bố.

### Mô tả ngắn

Ghi chú Google Meet: lời nói, người tham gia và chat được đồng bộ với EzNoting để xem trực tiếp và lưu biên bản.

### Mô tả chi tiết

Extension EzNoting kết nối Google Meet trên Chrome với ứng dụng web EzNoting, giúp bạn theo dõi lời nói và tin nhắn trong cùng một bản ghi cuộc họp.

• Nhận dạng tiếng nói và hiển thị nội dung trực tiếp trên EzNoting.
• Hiển thị tên tài khoản từ dữ liệu người tham gia và phụ đề Google Meet khi có đủ bằng chứng; trường hợp chưa chắc chắn được ghi là chưa xác định hoặc đang xác minh.
• Đồng bộ tin nhắn cùng tên người gửi từ khung chat đang mở.
• Gom lời của cùng một tài khoản thành đoạn sau 5 nhịp im lặng, mỗi nhịp ít nhất 1 giây; đổi tài khoản mở đoạn mới khi nhận dạng có kết quả.
• Kết thúc phiên để lưu biên bản; xem lại và sử dụng các công cụ xử lý biên bản trên web.

Cách bắt đầu: cài extension, đăng nhập EzNoting trong cùng profile Chrome, mở Meet, bật phụ đề và mở khung chat. Bấm biểu tượng EzNoting rồi chọn “Bắt đầu tab này”. Cấp quyền micro nếu muốn ghi giọng của chính bạn; luồng micro chỉ mở khi extension xác nhận mic Meet đang bật. Có thể bật chế độ tự động ghi riêng trong Cài đặt nâng cao.

Extension cần kết nối Internet và tài khoản EzNoting. Âm thanh được gửi tới máy chủ nhận dạng; âm thanh bản ghi, transcript, chat và thông tin người tham gia được lưu trên hệ thống EzNoting. Hãy thông báo và có sự đồng ý phù hợp của người tham gia trước khi ghi.

Chỉ hỗ trợ Google Meet trên Chrome máy tính. Tên người nói phụ thuộc dữ liệu giao diện/phụ đề Meet; giọng chồng lấn, tạp âm và thay đổi giao diện Meet có thể ảnh hưởng kết quả. EzNoting là sản phẩm độc lập, không do Google cung cấp hay chứng thực.

AI & chi phí: Mỗi tài khoản được AI xử lý miễn phí 10 cuộc họp khác nhau, kể cả Live insight; tóm tắt lại cùng cuộc họp không tính thêm lượt. Sau đó cần thêm Gemini API key riêng trong Thiết lập tài khoản → AI & Gemini để tóm tắt cuộc họp mới. Key riêng dùng hạn mức/chi phí của project của bạn và cần xác nhận Cloud Billing đang hoạt động. Ghi âm, transcript và chat vẫn dùng được khi hết lượt AI.

## Single purpose

Ghi chú cuộc họp Google Meet do người dùng lựa chọn và đồng bộ âm thanh, transcript, người tham gia, chat về tài khoản EzNoting của họ để xem trực tiếp và lưu biên bản.

## Khai báo quyền

| Quyền | Lý do sử dụng |
| --- | --- |
| activeTab | Cho phép thao tác bắt đầu ghi trên tab người dùng đang chọn từ popup. |
| tabCapture | Thu âm thanh tab cuộc họp Meet để nhận dạng lời người tham gia. |
| storage | Lưu cài đặt; token đăng nhập được giữ trong storage.session. Audio chờ gửi lại nằm trong IndexedDB cục bộ. |
| notifications | Thông báo cần đăng nhập hoặc cuộc họp đã được lưu. |
| alarms | Kiểm tra phiên còn hoạt động và phục hồi trạng thái service worker. |
| offscreen | Chạy audio/WebSocket khi popup đóng; ghi và lưu các gói âm thanh của phiên đang hoạt động. |
| scripting | Nạp lại collector trên tab Meet khi Meet điều hướng nội bộ mà không tải trang. |
| meet.google.com | Đọc người tham gia, phụ đề, trạng thái mic, chat của phiên Meet. |
| smart-noting.vercel.app, noting.io.vn | Nhận token từ web đáng tin cậy, gửi dữ liệu phiên và mở trang ghi chú. |
| asr-live.noting.io.vn | Gửi âm thanh qua kết nối TLS/WebSocket đến dịch vụ nhận dạng tiếng nói. |

## Privacy dashboard — phải đối chiếu lại bản build trước khi xác nhận

Các nhóm dữ liệu có sử dụng: thông tin định danh (tên/email tài khoản, tên hiển thị người tham gia), thông tin xác thực (Firebase ID token), liên lạc cá nhân (chat/lời nói), nội dung website (phụ đề, roster, chat), hoạt động người dùng trong Meet (trạng thái phát biểu/mic), nội dung âm thanh do người dùng cho phép thu. URL cuộc họp được lưu để gắn phiên; không thu lịch sử duyệt web ngoài cuộc họp. Chọn thêm nhóm Web history nếu định nghĩa trong dashboard hiện tại bao gồm URL cuộc họp này.

Không chạy mã từ xa: JavaScript được đóng gói trong ZIP. Dịch vụ từ xa chỉ trả dữ liệu nhận dạng/API, không trả mã thực thi. Không bán dữ liệu, không dùng để quảng cáo hay đánh giá tín dụng. Chỉ xác nhận các cam kết Limited Use sau khi chủ sản phẩm kiểm tra chính sách và dịch vụ đang vận hành.

## Hướng dẫn người kiểm duyệt

1. Cài ZIP, mở trang chủ và đăng nhập bằng Google của người kiểm duyệt. Không cung cấp mật khẩu thật trong hồ sơ.
2. Mở Google Meet, tham gia một phòng có ít nhất hai tài khoản thử nghiệm; bật phụ đề, mở khung chat và danh sách người tham gia.
3. Mở popup, chọn “Bắt đầu tab này”; nếu chưa nhận đăng nhập, tải lại trang EzNoting sau khi cài extension.
4. Cấp micro nếu thử giọng người cài extension. Mở trang live từ popup/dashboard; thử lời nói, chat và chuyển tài khoản phát biểu.
5. Bấm “Kết thúc & tạo biên bản” và kiểm tra bản ghi trên web.

Lưu ý vận hành: cần cấu hình ID do Chrome Store cấp trong NEXT_PUBLIC_EXTENSION_ID của web trước khi người kiểm duyệt thử đăng nhập. Chưa submit nếu chưa kiểm tra cầu xác thực với ID đó.

## Tài liệu chính thức

- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq

## Quyền tối thiểu ở 0.4.6

Không xin quyền tabs: quyền host Meet cho phép đọc URL/tab metadata của Meet, còn activeTab dùng khi người dùng chủ động mở popup. Tham khảo https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions.
