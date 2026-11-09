# Tóm tắt cuộc họp theo mẫu Word

Tại chi tiết cuộc họp, chọn **Tóm tắt lại** để mở nơi chọn mẫu; trình chỉnh sửa cuộc họp cũng có nút chọn mẫu tương tự.

1. Chọn **Tải mẫu Word lên** và chọn file `.docx` hoặc `.dotx`, tối đa 5 MB. Với file `.doc` cũ, mở bằng Word và lưu lại thành `.docx`.
2. Kiểm tra tên mẫu và phần **Nội dung mẫu** đã đọc. Có thể chỉnh sửa trực tiếp; giới hạn 40.000 ký tự.
3. **Cách sử dụng mẫu** mặc định là tự nhận diện. Có thể chọn rõ khung tiêu đề hoặc bản có ví dụ nếu cần.
4. Chọn **Lưu mẫu mới**. Mẫu được lưu riêng trong tài khoản để dùng lại, và được chọn làm mẫu hiện tại.
5. Chọn **Sử dụng mẫu này** để tóm tắt cuộc họp, hoặc chọn mẫu trong trình chỉnh sửa rồi bấm tóm tắt. Kết quả dùng luồng lưu/xuất Word hiện có.

## Cách diễn giải mẫu

- **Khung tiêu đề:** giữ thứ tự và cấp độ đề mục; dùng mỗi tiêu đề làm gợi ý để viết nội dung phù hợp từ bản ghi. Không yêu cầu mẫu phải có `[...]` hay `...`.
- **Bản có ví dụ:** viết báo cáo mới theo bố cục, độ trang trọng, cách diễn đạt và cách triển khai câu/đoạn của mẫu. Thay toàn bộ dữ kiện ví dụ bằng nội dung cuộc họp mới, kể cả những đoạn không có placeholder. Giữ cách trình bày đoạn văn, danh sách và bảng tương ứng; số ý/hàng dữ liệu thay đổi theo cuộc họp mới.
- **Mẫu pha trộn:** chế độ tự nhận diện diễn giải từng mục theo nội dung có sẵn.
- Tên người, cơ quan, số liệu, ngày tháng, nhiệm vụ và kết luận trong ví dụ không được coi là dữ kiện của cuộc họp mới. Mục thiếu thông tin được giữ lại với ghi chú “Không có thông tin trong bản ghi”. Người dùng vẫn cần rà soát báo cáo AI trước khi sử dụng.

File Word được đọc ngay trong trình duyệt. Khi bấm lưu, văn bản đã đọc và lựa chọn cách dùng mẫu được lưu vào `users/{uid}/templates`. Nội dung mẫu được gửi cùng yêu cầu tóm tắt tới nhà cung cấp AI hiện có khi người dùng thực hiện tóm tắt; file Word gốc không được lưu hoặc gửi lên để xử lý.

Tiêu đề, nội dung chữ, danh sách và bảng được chuyển sang Markdown. Đây là mẫu nội dung/văn phong, không phải chức năng sao chép nguyên dạng trang Word: ảnh scan, hình ảnh, chữ ký, header/footer, font và bố trí trang không được tái tạo. Với báo cáo có thông tin quan trọng ở header/footer, hãy đưa chúng vào phần nội dung mẫu khi xem lại.

## Triển khai và kiểm thử

Đã triển khai lên Worker `ez-noting`, phiên bản `05603042-21e0-430b-9d05-97b948c25da5` tại https://noting.io.vn.

- `npm run typecheck:cloudflare` và `npm run build:cloudflare` đã qua.
- 68 kiểm thử liên quan đã qua: đọc file Word thực tế, dữ liệu mẫu đầy đủ/khung, bảng, giới hạn và file lỗi, UI xem/lưu/chọn mẫu, các chế độ AI và xuất/điền Word hiện có.
- Kiểm thử hợp đồng prompt dùng nhà cung cấp AI giả lập; chưa chạy sinh báo cáo AI thật trong đợt kiểm tra này.
- Ngày 07/11/2026 đã kiểm tra trên Cốc Cốc tại domain production: tải và đọc thành công cả file chỉ có tiêu đề và file đầy đủ đoạn văn ví dụ; kiểm tra lựa chọn tự nhận diện/tham khảo văn phong. Đã đóng bản xem trước sau khi thử, không lưu mẫu thử và không ghi đè tóm tắt cuộc họp cũ.
