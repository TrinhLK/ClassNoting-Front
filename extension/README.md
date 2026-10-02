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
