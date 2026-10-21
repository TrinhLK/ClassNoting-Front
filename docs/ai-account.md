# Gemini riêng và 10 cuộc họp miễn phí

Trang `/settings`, mở từ menu tài khoản hoặc sidebar **AI & Gemini**.

- Mỗi UID có 10 cuộc họp khác nhau được AI xử lý miễn phí kể từ khi tính năng được triển khai. Không đặt lại theo tháng; dữ liệu cũ không bị tính hồi tố.
- Một lần AI xử lý thành công đầu tiên theo ID cuộc họp sử dụng một lượt, bao gồm Live insight, tóm tắt, hỏi đáp và thao tác AI trên cuộc họp. Có thể thử lại cùng ID nhiều lần; sửa mẫu hoặc nội dung không cộng lượt.
- Extension live dùng `ext_<session.id>`, trùng ID biên bản cuối. Live web lưu biên bản cùng ID phiên live. Không tính hai lượt giữa live và tóm tắt cuối.
- Firestore transaction giữ số lượt đã dùng + đang xử lý trong hạn mức hiện tại (mặc định 10, hoặc được quản trị cấp thêm/không giới hạn). Một cuộc họp mới đang chạy trả 409 khi gọi đồng thời. Chỉ thành công mới chốt lượt; lỗi hoàn lượt. Lease 12 phút giải phóng lượt khi function bị ngắt. Xóa biên bản hoặc key không xóa ledger.
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


## Quản trị hệ thống

- Tài khoản được chỉ định: `trinhlk.vnu@gmail.com`, UID `3DiIdasz33YD30R69VFjPJdb9S83`. Tab `/admin` chỉ hiện khi UID + email + emailVerified khớp. Server kiểm tra ID token với `checkRevoked=true`, đối chiếu bản ghi Firebase Auth hiện tại, email đã xác thực, provider Google và trạng thái không bị vô hiệu hóa. Không đọc quyền quản trị từ Firestore client, body hoặc email header.
- Tài khoản quản trị có AI hệ thống không giới hạn mặc định; không cấp quyền quản trị cho tài khoản khác trong giao diện này. Key riêng, nếu có, vẫn được ưu tiên theo lựa chọn hiện hữu của người dùng.
- API `/api/admin/accounts`: Firebase Auth pagination 100 tài khoản/trang, cursor và tìm email chính xác. Thống kê ở UI tính trên các tài khoản đã tải; khi đã tải hết mới là tổng toàn bộ. Metadata gồm thời gian tạo/đăng nhập/hoạt động, trạng thái, số cuộc họp hệ thống, quota, có key riêng. Không trả key/suffix/ciphertext hoặc transcript. Khi đọc key chỉ dùng Firestore field mask `removed`.
- `PATCH /api/admin/accounts/<uid>/quota`: `add` cộng số nguyên dương vào tổng hạn mức hiện hữu, không sửa usage; `unlimited` bật/tắt không giới hạn, vẫn giữ hạn mức hữu hạn trước đó. Tài khoản bị disabled hoặc không tồn tại không được điều chỉnh. Policy và audit được commit cùng transaction, cộng đồng thời không mất lượt. Chỉ hỗ trợ tăng tổng hạn mức, không có API giảm/xóa lịch sử.
- `server_ai_policies/<uid>` và `server_admin_audit/<id>` chỉ cho Admin SDK truy cập; `server_account_activity/<uid>` do server ghi. Không đặt dưới `users/<uid>` vốn có quyền client ghi.
- Ghi nhận hoạt động web khi trang hiển thị, tối đa một lần/2 phút trên server và heartbeat mỗi 5 phút trên client. Chỉ timestamp theo UID, không URL hay click/keystroke. Hoạt động 7 ngày dựa trên mốc truy cập/đăng nhập/sử dụng gần nhất và loại tài khoản bị disabled; không suy ra đang online.
- Usage schema 2: document theo UID giữ `usedCount`, các lease đang chạy và tối đa danh sách ID cũ cần giữ. Mỗi cuộc họp mới thành công có receipt ở `server_ai_usage/<uid>/meetings/<sha256(meetingId)>`. Không tích lũy tất cả cuộc họp không giới hạn trong một document (tránh giới hạn 1 MiB). Ledger schema cũ được chuyển khi có yêu cầu mới, mọi cuộc họp cũ vẫn được retry không cộng lượt. Chỉ mở tối đa 50 cuộc họp mới đồng thời cho một UID; đây là bảo vệ xử lý đồng thời, không phải giới hạn tổng số cuộc họp.
- Khi cần xóa tài khoản theo quy trình dữ liệu, phải dọn cả subcollection receipts; xóa document usage đơn lẻ không tự xóa subcollections.
