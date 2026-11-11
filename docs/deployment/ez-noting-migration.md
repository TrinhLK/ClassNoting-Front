# Chuyển EzNoting khỏi Vercel và Zeabur sang ez.noting.io.vn

Cập nhật 01/11/2026: Zeabur thông báo đóng cửa (https://zeabur.com/blogs/zeabur-is-shutting-down). Không tạo triển khai mới trên Zeabur. Từ 01/12 server thuê qua Zeabur có thể dừng theo ngày hết hạn; tất cả dừng chậm nhất 31/12. Ưu tiên di chuyển STT trong tháng 11.

Trạng thái: đã chuẩn bị Dockerfile và cấu hình standalone. Chưa triển khai máy chủ mới, chưa chuyển DNS, chưa phát hành extension cho domain mới.

## Kiến trúc

- Cloudflare quản lý DNS của ez.noting.io.vn.
- Web và API: container Next.js Node 22, chạy trên VPS mua trực tiếp từ nhà cung cấp, dùng Docker Compose hoặc Coolify. Dùng cùng image để có thể đổi hosting.
- STT: chuyển container Python/ONNX khỏi Zeabur, giữ tên asr-live.noting.io.vn (extension) và endpoint ghi âm web hiện tại khi cắt chuyển. Tách tài nguyên STT khỏi web.
- Firebase Authentication, Firestore và Storage giữ project hiện tại. Không cần chuyển dữ liệu tài khoản/biên bản.
- Chuyển audio upload/download sang Storage trực tiếp với xác thực và kiểm tra quyền sở hữu; không dùng proxy công khai cho file tùy ý.

## Build và runtime

Dockerfile build ở root repo. Cấp các NEXT_PUBLIC_* tương ứng dưới dạng build arguments (danh sách trong Dockerfile), không chỉ runtime variables. Giá trị public được nhúng trong JavaScript; thay đổi cần build lại. NEXT_PUBLIC_APP_URL=https://ez.noting.io.vn.

Mọi secret chỉ đưa vào runtime qua secret manager của hosting: FIREBASE_SERVICE_ACCOUNT_KEY, key mã hóa Gemini hiện có, key AI hệ thống, OAuth/client secrets và các biến server đang dùng. Không đổi key mã hóa vì các Gemini key đã lưu cần key cũ để giải mã. Không in/export secret vào log hoặc commit; .dockerignore loại các file .env.

Container lắng nghe 0.0.0.0:3000; đặt reverse proxy HTTPS phía trước. Máy chủ phải có outbound đến Firebase, Google Gemini và các dịch vụ đang dùng. Cấu hình proxy hỗ trợ streaming và timeout các tác vụ AI hiện tại (tối đa 300 giây); maxDuration trong route không tự cấu hình timeout của reverse proxy.

## Cắt chuyển

1. Tạo dịch vụ web riêng, xác nhận giá/tài nguyên trước khi mua. Không tăng tải lên máy STT chưa kiểm tra dung lượng.
2. Build image, cấp runtime secrets, triển khai bằng domain thử nghiệm HTTPS.
3. Kiểm tra đăng nhập, biên bản cũ, upload/phát/tải audio, live transcript/chat, tóm tắt, key cá nhân, hạn mức và quản trị.
4. Đăng ký ez.noting.io.vn trong dịch vụ hosting và Firebase Authentication Authorized domains; cập nhật OAuth redirect nếu có luồng yêu cầu URL cố định, cùng CORS Storage/ASR khi cần. Chỉ cho phép đúng origin, không mở wildcard cho dữ liệu riêng.
5. Cloudflare: tạo bản ghi ez theo CNAME/IP mà hosting thực tế cấp. Xác nhận TLS và quyền sở hữu domain; không đoán đích DNS hoặc xóa các bản ghi asr hiện có.
6. Extension: scripts/package-extension.py đã cho phép ez.noting.io.vn. Chỉ chuyển DEFAULT_APP_ORIGIN và các liên kết sang domain mới sau khi web đã đạt kiểm thử. Đổi phiên bản, đóng gói và gửi Chrome Store. Bản cũ không có quyền domain mới sẽ không tự hoạt động chỉ bằng sửa URL trong popup.
7. Với các bản cũ, giữ tương thích URL/API cũ trong thời gian chuyển nếu khả thi. Thông báo người dùng cập nhật extension và đăng nhập trên tên miền mới. Redirect trình duyệt không tự chuyển quyền extension hay phiên đăng nhập sang origin mới.
8. Kiểm tra traffic đã qua máy chủ mới rồi mới tắt Vercel. DNS có phương án quay lại dịch vụ cũ nếu còn hoạt động.

## Phần Vercel còn phải xử lý

- app/api/upload/route.ts vẫn cung cấp endpoint Vercel Blob; mã web/extension hiện tại không thấy gọi endpoint này trong repo. Xác minh tích hợp bên ngoài trước khi bỏ endpoint và gỡ @vercel/blob. Không coi việc chỉ chuyển web host là đã loại toàn bộ dịch vụ Vercel.
- Rà soát file audio cũ nếu có URL Vercel Blob: cần chuyển object trước khi ngừng dịch vụ lưu trữ đó. Không xóa hoặc thay URL khi chưa xác minh quyền sở hữu và khả năng đọc.
- Cập nhật link hướng dẫn, chính sách, Chrome Store, webhook và cấu hình môi trường đang dùng địa chỉ smart-noting.vercel.app.
- Giảm polling truyền lại toàn bộ bản ghi, tránh retry audio trùng và bổ sung đo lưu lượng từng endpoint. Đổi hosting không tự sửa lưu lượng dư thừa.

## Lựa chọn thay thế sau thông báo đóng cửa

Ưu tiên VPS x86-64 tại Singapore, mua bằng tài khoản trực tiếp của chủ hệ thống. Docker Compose + Caddy là phương án ít thành phần; Coolify tùy chọn nếu cần giao diện deploy, nhưng phải tính thêm RAM cho control plane.

- Hetzner Singapore: có lựa chọn shared/dedicated CPU; lấy báo giá vùng Singapore, IPv4, lưu lượng và backup tại console trước khi chốt.
- DigitalOcean Singapore: bảng giá Basic Regular công khai tại 01/11/2026 là 2 vCPU/4 GiB $24/tháng và 1 vCPU/2 GiB $12/tháng. Hai máy cho STT + web khoảng $36/tháng trước thuế/backup; shared CPU cần đo tốc độ nhận dạng thực tế.
- Cloudflare Workers chỉ là lựa chọn port web/API. Không phải chỗ thay trực tiếp container Python/ONNX STT hiện tại. Có thể kết hợp Workers với VPS STT sau khi thử tương thích backend.

Đo STT trên máy mới bằng audio test đã được cho phép, đối chiếu tốc độ xử lý, độ trễ, nhận diện Việt/Anh, diarization, reconnect và nhiều phiên đồng thời. Cấu hình tham khảo chưa phải bảo đảm năng lực.

## Xuất khỏi Zeabur trước khi dừng dịch vụ

Server thuê qua Zeabur thuộc tài khoản cloud của Zeabur theo hướng dẫn migration; không mặc định rằng có thể giữ nguyên máy/IP chỉ bằng gỡ agent. Nếu server do chính người dùng mua rồi kết nối vào Zeabur thì trường hợp khác, cần xác minh ownership.

Lập danh sách image/digest, source commit, runtime variables, volumes, tunnel mappings và DNS. Sao lưu cấu hình cùng model caches thực tế, vì cache model không nằm trong Git; build mới không nên tự đổi model sang phiên bản khác. Không trông cậy registry Zeabur sau đóng cửa: rebuild từ source đáng tin hoặc xuất image đã kiểm chứng ra registry của mình.

Zeabur đã công bố sự cố bảo mật 14/10/2026. Kiểm tra phạm vi token/credential thực sự được cấp cho dịch vụ trên Zeabur; thay chúng có kiểm soát, không tự đổi toàn bộ key Firebase hoặc key mã hóa Gemini. Không in secret ra log/tài liệu.

Đặt máy mới chạy song song, kiểm tra khôi phục và STT trước khi đổi asr-live DNS/Cloudflare Tunnel. Với tunnel, xác minh ingress và credential trên máy mới; không tự trỏ A record nếu hostname đang định tuyến qua tunnel. Giữ bản cũ để rollback khi còn hoạt động. Sau đó chuyển web/API và ez.noting.io.vn; chỉ dừng máy cũ sau xác nhận dữ liệu cùng traffic đã chuyển.

Nguồn: https://zeabur.com/blogs/migrate-from-zeabur ; https://www.digitalocean.com/pricing/droplets ; https://www.hetzner.com/cloud-singapore/
