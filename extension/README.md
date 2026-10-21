# ClassNoting Extension — Ghi chú cuộc họp tự động

Chrome extension (Manifest V3) tự phát hiện phòng họp **Google Meet** đang mở,
thu roster + chat + captions + audio tab, gán tên người nói thật bằng
`resolveSpeakerName` (port từ `app/lib/realtime-protocol.ts`), đẩy về backend
`/api/extension/*` để xem live trên dashboard và kết xuất biên bản.

## 1. Cài dev (load unpacked)

1. Mở `chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục `extension/`.
2. Ghi lại **Extension ID** (vd `abcdefg...`).
3. Web app: đặt env `NEXT_PUBLIC_EXTENSION_ID=<id>` rồi chạy lại Next.js
   (để `ExtensionBridge` đẩy Firebase ID Token sang extension).
4. Mở popup extension → nhập **địa chỉ web app** (`https://smart-noting.vercel.app`,
   dev là `http://localhost:3000`) → **Lưu cài đặt** → bấm
   **"Tôi đồng ý, bật tự động"**.
5. Đăng nhập web app ClassNoting (token tự đẩy sang extension, refresh mỗi 50 phút).

## 2. Firestore rules (bắt buộc — rules quản lý trên Firebase Console)

Web app đọc `ext_sessions` bằng client SDK (banner dashboard + trang `/ext/[id]`),
ghi bởi Admin SDK từ API. Thêm rule:

```
match /ext_sessions/{sessionId} {
  allow read: if request.auth != null && resource.data.ownerUid == request.auth.uid;
  allow write: if false; // chỉ backend (Admin SDK) được ghi
}
match /meeting_bots/{botId} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

## 3. Luồng hoạt động

1. Vào URL Google Meet → content script báo `CN_MEETING_STATE` → background tạo/tái dùng
   session (`POST /api/extension/session`) → badge `REC`.
2. Content script scrape roster (5s), chat + captions (MutationObserver),
   active-speaker (500ms) → batch 2s → `POST /api/extension/events`.
3. Offscreen document thu audio tab → WS `wss://asr-live.noting.io.vn`
   (param `client=extension&session=...`, server cũ bỏ qua) → segment final
   fusion tên → `POST .../events` loại `transcript`.
4. Đóng tab / mất tín hiệu 2 phút / bấm "Kết thúc" → `POST /api/extension/end`
   → dựng `Meeting` (segments + speakers + chat + `chatStats`) → mở từ dashboard.

## 4. Họp Meet Workspace/Edu khóa guest

Bot vào phòng khóa bằng tài khoản Google Workspace đã liên kết (SAML SSO):
MeetingBaaS dashboard → tạo Meet Workspace (domain + self-signed keypair) →
upload certificate lên Google Admin → thêm login (email) → copy `credential_id`
hoặc `email_group` → điền env `MEETINGBAAS_GOOGLE_CREDENTIAL_ID` /
`MEETINGBAAS_MEET_EMAIL_GROUP` (hoặc nhập trong modal "Ghi chú cuộc họp").
Họp mở: để trống để bot vào như khách.

## 5. Xử lý sự cố nhanh (troubleshooting)

- Đổi manifest mà Reload không nhận (site access cũ): gỡ Remove rồi Load unpacked
  lại — Chrome đôi khi không áp quyền host mới khi chỉ Reload.
- Nút Bắt đầu bị khóa 1 lúc là bình thường (chống nháy đúp tạo trùng phiên).

- Popup báo lỗi kèm HTTP status: `401` → token hết hạn (mở web app, F5 tab web);
  `400` → tab không phải link Meet; `429` → đợi 1 phút; `5xx` → kiểm tra Vercel deploy;
  `network` → kiểm tra mạng + Reload extension ở `chrome://extensions` (nhận host_permissions).
- Console báo CORS/preflight: 99% là chưa Reload extension sau khi sửa manifest.
- Popup hiện "Không có" dù dashboard có phiên live: service worker vừa restart
  (MV3) — heartbeat 15s từ tab Meet sẽ tự gắn lại, hoặc bấm "Bắt đầu tab này".
- Badge `?` màu cam: quá ~3 phút không đọc được roster/chat/caption → mở panel
  People + Chat trong Meet, bật phụ đề (CC).
- Số liệu rác (chat "chat_bubble", caption "closed_caption_off"): đã lọc ở
  `platforms.js` (blocklist + bỏ node trong button/menu); nếu Meet đổi DOM và rác
  quay lại, báo lại kèm screenshot để bổ sung selector.

## 6. Giới hạn đã biết

- Chỉ phủ **Google Meet trên trình duyệt Chrome** (Zoom/MS Teams đã loại khỏi sản phẩm).
- `chrome.tabCapture.getMediaStreamId` có thể đòi tab đang audible / user gesture:
  nếu auto-start thất bại, badge `!` hiện và user bấm **"Bắt đầu tab này"** trong popup.
- Selector DOM của Meet đổi theo thời gian: `platforms.js` nhiều lớp
  fallback + heartbeat báo `chatPanel/captionPanel/rosterCount` để phát hiện sớm.
- Captions tắt → tên người nói kém chính xác hơn (còn active-speaker + nối prev);
  extension không tự bật được CC, user bật tay trong phòng họp.

## 7. Publish Chrome Web Store (sau)

- Khai báo quyền `tabCapture`, `tabs`, `notifications` + chính sách quyền riêng tư
  (chỉ thu tab họp Meet, token trong `chrome.storage.session`, không log nội dung chat).
- Chuẩn bị screenshot popup + trang `/ext/[id]` live.

## Speaker attribution v0.3

Xem [triển khai, cấu hình và giới hạn tích hợp](../docs/speaker-attribution/README.md). Tài liệu này thay thế mô tả cũ về giao thức audio và gán người nói.

Extension `0.3.6` có popup một thao tác: mở extension và bấm **Bắt đầu tab này** để tạo phiên và thu âm tab hiện tại. Cú bấm thủ công là xác nhận chỉ cho tab đó; tự động ghi khi mở Meet vẫn cần bật riêng trong **Cài đặt nâng cao**. Đăng nhập ClassNoting vẫn cần thiết để lưu biên bản. Các thao tác đổi tên, cấp quyền mic, danh sách phiên và chẩn đoán nằm trong phần nâng cao. Icon extension là sổ ghi chú, đồng bộ với icon web; bộ nhận dạng chat bỏ thông báo hệ thống nằm chung hàng với bubble.

Trạng thái diarization của server, số người Meet đọc được và active-speaker gần nhất nằm trong phần chẩn đoán. Khi chữ vẫn về nhưng status báo `diarization tắt`, server đang chạy nhưng thiếu model/env; khi roster là `0`, bấm **Chẩn đoán tab Meet** để xem selectors `roster:*` và `speaker:active`.

Trên trang `/ext/[sessionId]`, chủ phiên bấm **Chia sẻ live** để copy link chỉ đọc. Người nhận không cần tài khoản hay tham gia cuộc họp; link cho phép xem transcript, người nói và chat khi phiên còn live. Khóa truy cập nằm trong URL fragment, server chỉ lưu hash, và API công khai không trả audio, link họp hoặc thông tin nội bộ của chủ phiên.

Audio tab vẫn luôn được thu; mic thiết bị chỉ mở khi toolbar Meet xác nhận mic đang bật. Khi mic Meet tắt hoặc trạng thái chưa đọc được, luồng mic extension không được mở/đưa vào ASR. Sau khi cập nhật cần kết thúc phiên cũ, reload extension và tải lại tab Meet để offscreen document cũ được thay thế.

### Bản 0.3.14 — kiểm tra trên Google Chrome ngày 20/10/2026

- Đọc tên trên tile Meet hiện tại; chat lấy bubble thay vì nút ghim có cùng `data-message-id`, lấy nội dung riêng và tên ở header của nhóm tin.
- Tin của chính mình chỉ được nhận khi có dấu hiệu bubble của Meet (`chmVPb`); không suy ra người gửi chỉ vì thiếu tên. Ưu tiên tên Meet khi avatar trong phụ đề “You” khớp duy nhất với tile.
- Một content collector cho mỗi tab; roster/chat được quét khi nhận session, ID chat ổn định giúp backend không nhân bản khi F5.
- Phụ đề đọc tên và lời từ cùng một hàng, bỏ nút “Jump to bottom”. Mic chỉ dùng phụ đề “You” làm bằng chứng tên; audio tab chỉ dùng bằng chứng phía người khác. Danh tính dựa riêng phụ đề vẫn được đánh dấu chưa xác nhận.
- Metadata người nói được cập nhật trong lúc phụ đề đang phát triển, không chờ người nói ngừng. Khi chuyển tab, bộ đọc cũng kiểm tra nút mic/phụ đề trong cửa sổ document PiP của Meet.
- Khởi động thủ công lấy nền tảng từ phản hồi API để không khóa nhầm mic Meet khi popup không truyền `provider`.
- Kiểm tra handshake ASR thực tế trả `protocol: 2, diarization: false`. Thu chữ và gán tên theo Meet không đồng nghĩa server đã phân biệt giọng. Muốn kiểm chứng diarization cần nạp model trên server theo tài liệu speaker-attribution.

## 0.4.0 — đoạn theo tài khoản Meet

- Cùng tài khoản: gom đoạn sau năm nhịp ngắt VAD, mỗi nhịp im lặng ít nhất 1 giây. Đổi tài khoản mở đoạn mới ngay khi có kết quả nhận dạng.
- Server cần trả `segmentation: {boundary_events: true, pause_seconds: 1}`; popup báo rõ khi server chưa hỗ trợ. Chữ vẫn gửi từng gói, không đợi đủ năm nhịp.
- `ready.model` báo model thực tế server đã chọn. Không tự đổi model ASR của ghi âm web.
- Không có chức năng cảnh báo mic. Khi thiếu bằng chứng tài khoản, vẫn hiển thị chưa xác định.

0.4.1 sửa khởi động collector khi Meet đổi từ `/new` sang mã phòng mà không tải lại trang.

0.4.2 lọc tên nút giao diện khỏi roster; khớp phần mở đầu với phụ đề đến chậm khi văn bản trùng, chỉ có một tài khoản phù hợp và không có người nói cạnh tranh. Trạng thái suy luận vẫn là đang xác minh.

0.4.3 gắn mic cục bộ với tài khoản Meet đã được xác nhận duy nhất, kể cả khi phụ đề đến muộn. Server mới chỉ đưa audio có tiếng nói vào ASR, giữ đệm 400ms trước VAD để tránh mất đầu câu; nút ghi âm trang chủ giữ hành vi cũ.
