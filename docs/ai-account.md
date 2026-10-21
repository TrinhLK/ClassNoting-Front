# Gemini riêng và 10 cuộc họp miễn phí

Trang `/settings`, mở từ menu tài khoản hoặc sidebar **AI & Gemini**.

- Mỗi UID có 10 cuộc họp khác nhau được AI xử lý miễn phí kể từ khi tính năng được triển khai. Không đặt lại theo tháng; dữ liệu cũ không bị tính hồi tố.
- Một lần AI xử lý thành công đầu tiên theo ID cuộc họp sử dụng một lượt, bao gồm Live insight, tóm tắt, hỏi đáp và thao tác AI trên cuộc họp. Có thể thử lại cùng ID nhiều lần; sửa mẫu hoặc nội dung không cộng lượt.
- Extension live dùng `ext_<session.id>`, trùng ID biên bản cuối. Live web lưu biên bản cùng ID phiên live. Không tính hai lượt giữa live và tóm tắt cuối.
- Firestore transaction giữ tối đa 10 lượt (đã dùng + đang xử lý). Một cuộc họp mới đang chạy trả 409 khi gọi đồng thời. Chỉ thành công mới chốt lượt; lỗi hoàn lượt. Lease 12 phút giải phóng lượt khi function bị ngắt. Xóa biên bản hoặc key không xóa ledger.
- Khi hết lượt, cuộc họp mới trả HTTP 402 / `AI_KEY_REQUIRED`, kèm đường dẫn `/settings#gemini`. AI vẫn cho tóm tắt lại các cuộc họp đã tính. ASR/ghi âm/chat tiếp tục.
- Khi có key riêng, mọi thao tác AI của tài khoản dùng key riêng; không trừ lượt hệ thống và không tự fallback sang credential hệ thống khi key riêng lỗi. Fallback giữa các model vẫn dùng cùng key riêng.

## Bảo mật và vận hành

- Tất cả yêu cầu AI và thiết lập cần Firebase ID token. UID được lấy từ token, không từ body. Luồng miễn phí kiểm tra quyền sở hữu của meeting/live/extension session trên server.
- `server_ai_keys/<uid>` và `server_ai_usage/<uid>` là collection cấp gốc chỉ Admin SDK truy cập. Rules production đã kiểm tra chỉ cho phép các collection được nêu rõ, không có wildcard cấp quyền cho hai collection này. Không chuyển chúng vào nhánh `users` có quyền client ghi.
- Key mã hóa AES-256-GCM, IV ngẫu nhiên 12 byte; UID làm authenticated additional data để không thể chuyển ciphertext giữa tài khoản. GET chỉ trả trạng thái, suffix bốn ký tự và hạn mức.
- Dùng `GEMINI_KEY_ENCRYPTION_SECRET` nếu được cấu hình (ít nhất 32 ký tự ngẫu nhiên). Nếu chưa có, HKDF-SHA256 dẫn xuất khóa theo purpose riêng từ private key service account hiện hữu. Tuyệt đối không dùng API key chung làm khóa mã hóa.
- Trước khi đổi service-account private key đang làm nguồn dẫn xuất, cần di chuyển key đã lưu sang một encryption secret ổn định hoặc yêu cầu người dùng nhập lại. Đổi encryption secret trực tiếp cũng làm ciphertext cũ không giải mã được. Không ghi giá trị secret/key vào log.
- Endpoint kiểm tra key chỉ gửi prompt cố định `Reply OK.` tới Google (tối đa 256 output tokens), không dùng transcript. Key mới chỉ thay thế sau khi kiểm tra thành công. Người dùng xác nhận project có Cloud Billing đang hoạt động cho nội dung cuộc họp. Xác nhận này không phải kết quả tự dò billing từ API key.
- Lỗi upstream không trả raw response body hay thông tin credential cho client. Log chỉ chứa metadata request/model/usage; tag SHA256 rút gọn của key hệ thống hỗ trợ đối chiếu cấu hình production mà không đọc secret write-only.
- Không đưa key vào extension, localStorage, Firestore client hay file Git. Xóa key ngừng dùng ở yêu cầu mới, không hủy lệnh đang chạy.

Chính sách nhà cung cấp: https://ai.google.dev/gemini-api/terms. Chrome Store không có trường hỏi billing Gemini; việc khai báo Limited Use vẫn cần xét cả các nhà cung cấp xử lý dữ liệu mà extension thu được.
