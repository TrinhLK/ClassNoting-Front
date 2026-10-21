# Kiểm thử Chrome — 21/10/2026

## Phạm vi

Google Chrome, Meet `twm-seyc-iub`, hai tài khoản `ai_arena_vietnam AI Arena Vietnam` và `Trình Lê Khánh`. Không dùng Cốc Cốc. Người dùng cấp quyền mic và trực tiếp đọc các câu kiểm thử. Cảnh báo mic đã được bỏ theo yêu cầu.

## Quy tắc đã triển khai

- Một nhịp là VAD xác nhận im lặng từ 1 giây. Năm nhịp đóng đoạn hiện tại; đổi participant mở đoạn mới.
- Giữ gói ASR thô và paragraph ID riêng; gom khi hiển thị và lưu, không đợi đủ năm nhịp mới hiện chữ.
- Không đếm forced cut 8 giây, retry, flush thành nhịp ngắt.
- Mic cục bộ dùng tài khoản Meet được xác nhận duy nhất, không dùng danh tính chủ web để đoán tài khoản Meet.
- Biên bản mặc định giữ transcript realtime. Phân tích lại từ audio là thao tác chủ động; bằng chứng tài khoản đã ghi nhận vẫn được bảo vệ.

## Model thực tế

Handshake `asr-live.noting.io.vn` sau deploy trả:

```
protocol: 2
diarization: false
model.family: Gipformer 1.5
model.directory: model_gipformer
model.encoder: encoder.int8.onnx
model.runtime: sherpa-onnx
segmentation.pause_seconds: 1
segmentation.boundary_events: true
```

Đã đối chiếu connection scope trong log Zeabur với probe công khai để xác định đúng dịch vụ. `asr.noting.io.vn` trả HTTP 530 trong lượt kiểm tra; không suy từ biến local rằng môi trường web production nhất thiết giống local.

## Kết quả đã quan sát

### Phiên 0.4.1 — `ext_1y0uozn`

- Hai chat TEST-041-A/B đúng tên, nội dung và không trùng.
- Người dùng đọc sáu câu, mỗi câu cách nhau khoảng 1,5–2 giây. Phần có danh tính của câu 1–5 cùng paragraph ID `075394e4-b30b-49ba-a4b2-f3a6fc11c1b6`; câu 6 chuyển sang `f56eabfd-f573-4e5b-9525-a1d182926687`.
- Đầu câu 1 có `câu một chúng tôi` chưa xác định. Không khẳng định nhận diện mọi từ đã hoàn hảo.
- Roster lẫn icon `arrow_back`, `close`. Đã sửa ở 0.4.2.
- Hậu xử lý giữ hai đoạn có tên Trình Lê Khánh nhưng thêm nhiều filler/nhãn giọng ngoài khoảng lời nói. Đã chuyển hậu xử lý sang thao tác chủ động cho phiên mới.

### Phiên 0.4.2 — `JA3IzIe8RAMXCNnJnKlN`

- Roster đúng hai participant, không còn icon.
- Chủ phòng đọc hai câu: nội dung có tên chủ phòng và cùng paragraph, nhưng phần mở đầu chưa xác định; ASR còn nhận sai từ và tạo `đây` khi im lặng.
- Chẩn đoán: rolling buffer cũ tích cả khoảng im lặng và forced decode sau 8 giây. Bản server mới dùng VAD để bắt đầu buffer, giữ pre-roll 400ms, loại forced decoding trong khoảng im lặng. Nút ghi âm web không truyền `client=extension` giữ hành vi cũ.
- Phiên đã dừng và lưu để đối chiếu trước/sau.

## Kiểm chứng mã

- 101 kiểm thử frontend/API liên quan đạt trước thay đổi mặc định hậu xử lý; sau thay đổi này, 21 kiểm thử API/pipeline liên quan và TypeScript ứng dụng đạt.
- Production build webpack đạt; build Turbopack local bị dừng do không tiến triển. Vercel đã build và triển khai các commit trước đó thành công.
- Server: 8 kiểm thử đạt, gồm Silero VAD và DSP thật với 30 giây im lặng/nhiễu nhẹ không sinh transcript.
- Server checkpoint không được đổi trong lượt sửa chất lượng; thay đổi nằm ở buffer/VAD và gắn tài khoản.

## Kết quả phiên cuối — `vJiq1E7Kn81tjRq7Cv9D`

- Chrome đã ghi sáu câu bằng mic chủ phòng. Cả sáu mang participant ID `spaces/Rl15aIAt9hIB/devices/427`; câu 1–5 cùng paragraph `b88411e7-48d7-4740-aafc-e64e33d5792e`; câu 6 sang `3e21445a-5b62-4faa-8dfd-86e5451b7911`.
- Đổi sang mic Trình Lê Khánh: nội dung mở paragraph `09ed1864-b380-4744-9c47-050ab89125db` theo participant ID `spaces/Rl15aIAt9hIB/devices/425`.
- **Chưa đạt nhận diện mọi từ:** từ cuối `nói` có timestamp vượt khoảng bằng chứng phụ đề, vẫn ở trạng thái chưa xác định. Không sửa gán người bằng tay để che kết quả này.
- Hai chat FINAL-043-A/B đúng tên, nguyên nội dung và không trùng.
- Roster sau khi mở People lại phát sinh bảy dòng điều khiển. Extension 0.4.4 đã sửa: khi có participant ID gốc thì không bổ sung tên từ các nút People. Chẩn đoán thực tế Chrome 0.4.4 với People mở trả `scrapeRoster count=2` và đúng hai tên.
- Đã sửa riêng roster trong phiên test cuối và biên bản tương ứng, loại bảy giá trị UI đã đối chiếu; giữ nguyên transcript. Bản sao trước sửa nằm ở `/tmp/noting-roster-before-repair.json`. Không sửa các cuộc họp khác.
- Biên bản lưu bốn đoạn hiển thị (hai đoạn chủ phòng, một đoạn Trình Lê Khánh, một từ chưa xác định), hai participant, hai chat; `refinement=null`, không phát sinh job hậu xử lý tự động.
- Cả hai cửa sổ Chrome đều đã trở về `meet.google.com/home` sau thao tác kết thúc cho mọi người. Không còn ghi âm phiên test.

## Sửa mất đầu câu bằng cùng audio

Audio kiểm thử cục bộ được lấy từ đúng phiên Chrome cuối. Phát cùng file qua cùng recognizer:

- Pre-roll 0,4 giây: `bắt đầu kiểm tra` (thiếu `câu một`).
- Pre-roll 1,2 giây: vẫn thiếu `câu một`.
- Pre-roll 2 giây: `câu một bắt đầu kiểm tra`; năm câu còn lại đủ nội dung.

Người dùng đã xác nhận riêng quyền deploy bản sửa và quyền phát lại audio tới `wss://asr-live.noting.io.vn` sau các chặn auto-review. Production xác nhận `speech_only=true`, `pre_roll_seconds=2`. Phát lại trên production trả đủ sáu câu, khôi phục `câu một bắt đầu kiểm tra`. Không sửa ngược transcript của phiên Chrome cũ; phân biệt kết quả live trước sửa với kiểm chứng phát lại sau sửa.

## Trạng thái bàn giao

- Chrome cục bộ: extension **0.4.4**, đã Reload và kiểm tra chẩn đoán thực tế.
- Frontend production: commit `17fbe6b`; ASR production: commit `89bf2ec`. Đã xác minh Vercel deploy thành công và handshake server mới.
- Bản lọc roster 0.4.4 cùng ghi chú nghiệm thu nằm trong working tree frontend, chưa push lên GitHub. Extension unpacked của máy đã dùng chính mã này.
- **103** kiểm thử frontend/API liên quan đạt; **8** kiểm thử server đạt; TypeScript ứng dụng và production build đã đạt trong lượt triển khai.
- Kiểm thử production với 30 giây im lặng tổng hợp trả **0** gói transcript (bản speech-only). Kiểm thử Silero VAD/DSP thật với nhiễu nhẹ cũng không tạo chữ.
- Không thay model Gipformer. Chưa đo WER trên tập mẫu lớn và chưa đảm bảo gán đúng tài khoản cho mọi từ khi phụ đề không có bằng chứng tương ứng hoặc nói chồng.

