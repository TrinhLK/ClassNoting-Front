# Gán người nói: triển khai và kiểm thử

Ngày cập nhật: 06/10/2026. Thay đổi gồm ba repository:

- `ClassNoting-Front`: client ghi âm, Chrome extension, API, dữ liệu và UI.
- `ClassNoting-Realtime-Server`: giữ ASR Gipformer 1.5/Sherpa hiện có, thêm phân đoạn giọng và embedding.
- `ClassNoting-File-Processing`: bổ sung action `refine_meeting`.

## 1. Luồng realtime và tính đúng đắn

Client chờ server gửi `{type: "ready", protocol: 2}` trước khi gửi audio. Phải triển khai server mới **trước** frontend/extension 0.3.0. Server cũ không có handshake v2 sẽ không nhận audio từ client mới; không trộn PCM heartbeat vào audio để giả lập tương thích.

Mỗi nguồn gửi PCM16 mono 16kHz, có `{type: "audio_clock", offset: <seconds>}` trước chunk. Offset tính theo sample của web client; extension dùng đồng hồ AudioContext quy về `session.startedAt`. Mic và tab dùng WebSocket độc lập. Audio lưu nghe lại của web vẫn là bản trộn; extension lưu WAV riêng nguồn.

Heartbeat: `{type: "ping"}` → `{type: "pong"}`. Khi dừng: `{type: "flush"}` → các final packet → `{type: "flushed"}`; client chờ tối đa 20 giây. Khoảng im lặng dùng để đóng VAD khi kết thúc không phải heartbeat.

Final packet giữ định dạng `channel.alternatives[].words`, bổ sung `protocol: 2`, `speaker_scope`. Nhãn `speaker: -1` nghĩa là chưa xác định. Mỗi từ có nhãn riêng; client tách ở biên từ, không cắt chuỗi theo tỷ lệ ký tự. Nhãn của hai kết nối không được mặc định là cùng một người sau reconnect.

## 2. Extension Meet

- Vẫn chỉ đọc DOM Google Meet; không mở rộng quyền host cho Teams/Zoom.
- Tab playback được khôi phục sau tabCapture; mic không phát lại ra loa.
- Mốc DOM epoch được đổi về cùng timeline audio trước khi ghép.
- Tên dựa riêng active-speaker hoặc riêng caption được đánh dấu chưa xác nhận; tín hiệu xung đột/overlap không được biến thành tên chắc chắn.
- Hai người trùng tên chỉ được phân biệt nếu có participant ID hoặc cụm giọng riêng. Không dùng displayName làm danh tính chắc chắn.
- Có khoảng đợi metadata 2 giây sau final ASR để nhận caption đã batch. Đây là độ trễ bổ sung, không phải cam kết tổng độ trễ 2 giây.
- WAV theo nguồn được lưu mỗi khoảng 30 giây. Pending upload lưu IndexedDB trong extension, retry cùng ID. Nếu audio chưa gửi được, giữ phiên để thử kết thúc lại.
- Hàng đợi event lưu `chrome.storage.session` để sống qua việc MV3 service worker bị dừng. Không bảo đảm phục hồi sau khi người dùng đóng toàn bộ trình duyệt; browser-session storage có vòng đời riêng.
- DOM Meet có thể thay đổi; cần kiểm thử họp thật với panel People/Chat và CC bật/tắt. Không cam kết thu chat chưa từng được render.

`ext_sessions/{id}` chỉ là preview được giới hạn dung lượng. Lịch sử đầy đủ nằm ở subcollection `segments`, `chat`; audio manifest ở `audio`. Revision cũ và request retry không ghi đè bản mới. Dữ liệu inline cũ được migrate create-only trước khi trim.

Khi kết thúc, tải lại toàn bộ lịch sử. Meeting lớn được lưu theo page ở `meetings/{id}/content`; endpoint `/api/meetings/{id}/content` hydrate nội dung khi mở chi tiết/editor/share. API kiểm tra owner hoặc shareToken. Các subcollection được Admin SDK ghi/đọc; không cần mở quyền ghi client. Giữ rules hiện có của `ext_sessions` cho preview.

## 3. Diarization server

Thêm `speaker_diarization.py`. Đây là **xử lý theo cửa sổ/đoạn ASR**, không phải fine-tune ASR hay pipeline Diart. Dùng segmentation Pyannote ONNX và speaker embedding qua Sherpa-ONNX; centroid duy trì riêng mỗi kết nối, không lưu voiceprint xuyên cuộc họp.

```sh
export DIARIZATION_SEGMENTATION_MODEL=/models/segmentation.onnx
export DIARIZATION_EMBEDDING_MODEL=/models/embedding.onnx
export DIARIZATION_THRESHOLD=0.55
export DIARIZATION_MARGIN=0.08
python server.py
```

Thiếu model hoặc inference lỗi: server trả speaker chưa xác định, không đổi nhãn theo khoảng nghỉ. Đoạn ngắn hơn 1 giây không đủ để học centroid mới; tiếng chồng không được dùng học embedding. Các từ giữa vùng nhiều người nói giữ nhãn unknown.

Nguồn model/API chính thức:

- [Sherpa diarization example](https://github.com/k2-fsa/sherpa-onnx/blob/master/python-api-examples/offline-speaker-diarization.py)
- [Segmentation models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-segmentation-models)
- [Speaker embedding models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models)

Model đã smoke-test: `sherpa-onnx-pyannote-segmentation-3-0/model.onnx` và `3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx`. Model sau không phải model đã được đánh giá riêng cho tiếng Việt. Kiểm tra license/model card khi chọn model dùng cho sản phẩm.

Chạy kiểm thử trong repo realtime:

```sh
python -m unittest test_speaker_diarization.py
python benchmark_diarization.py meeting.wav --window 8 --threshold 0.55
```

Benchmark chỉ đo inference/RTF, không phải DER. Xem `BENCHMARK.md`. Acceptance tiếp theo phải có audio tiếng Việt được gán nhãn thủ công, bao gồm đổi người nhanh, nói chồng, mic chung, echo, share video và reconnect. Đo DER, lỗi gán tên, tỷ lệ unknown, độ trễ p50/p95 và số đoạn mất/trùng.

## 4. Hậu xử lý

Cấu hình **server-only**, không đặt token mới dưới `NEXT_PUBLIC_*`:

```dotenv
RUNPOD_API_KEY=<server-key>
RUNPOD_ENDPOINT_ID=<file-processing-endpoint>
```

Triển khai handler mới cùng `refine_audio.py` vào image file-processing đang có. `refine_meeting` nhận `audio_url` cho ghi âm web, hoặc `audio_chunks: [{url, source, start}]` cho extension. API ký URL Storage tối đa 24 giờ; worker ghép từng nguồn về timeline chung trước khi diarize toàn nguồn. Có giới hạn 2.400 chunk / 8 giờ, không phải cam kết máy hiện tại đủ RAM cho họp 8 giờ.

Frontend/extension giữ transcript live trước khi queue job. Khi cấu hình sẵn, extension tự queue lúc end; ghi âm web queue sau save. Chi tiết cuộc họp có nút thử lại và poll trạng thái job. **Job chạy khi trang đóng nhưng áp kết quả vào meeting hiện được kích hoạt khi trang chi tiết mở/poll**; chưa có worker nền riêng áp kết quả nếu không ai mở trang.

Hậu xử lý:

- Giữ bản trước hậu xử lý trong meeting phục hồi (đánh dấu đã xóa để không xuất hiện ở danh sách chính).
- Không xóa summary người dùng; đánh dấu `summaryNeedsReview` sau khi transcript đổi.
- Bảo toàn đoạn có `manuallyEdited`/`speakerSource: manual`; tách quanh đoạn khóa theo timestamp từng từ.
- Dùng Firestore update-time precondition để không ghi đè bản vừa được sửa trong lúc đang áp kết quả.
- Chỉ chuyển tên sang cụm offline nếu bằng chứng có participant ID, không uncertain, đủ thời lượng và nhất quán. Không suy ra tên từ voiceprint đơn thuần.
- Không thay thế transcript live bằng kết quả rỗng.

Input tóm tắt/trích công việc gồm speech và chat có ID nguồn; nhãn chưa xác nhận được thể hiện rõ. Không tự gửi email hay giao việc ra ngoài.

## 5. Zoom / Teams — chuẩn bị tích hợp

Theo yêu cầu hiện tại, chưa có Zoom RTMS app / Teams tenant được cấp quyền. Repository chuẩn bị **adapter nhập dữ liệu + relay CLI + hướng dẫn**, chưa chứa một Teams media bot hoàn chỉnh hoặc RTMS signaling client production.

### Backend relay dùng thử

```dotenv
MEETING_RELAY_TOKEN=<random-secret-at-least-32-bytes>
MEETING_RELAY_OWNER_UID=<Firebase-user-UID>
```

Đây là cấu hình một owner cố định cho môi trường thử nghiệm. Không dùng nguyên trạng để cấp một secret dùng chung cho nhiều khách hàng. Relay gọi server-to-server, không đưa token vào extension/browser.

1. `POST /api/integrations/session`, Bearer relay token, body:

```json
{"meetingUrl":"https://zoom.us/j/123456789","title":"Họp nhóm","startedAt":1791230000000}
```

`startedAt` là epoch milliseconds của gốc timeline cuộc họp, lấy từ upstream; ví dụ trên phải thay bằng thời gian thực khi chạy. Nếu không truyền, lấy giờ tạo session. Với audio/transcript được upstream buffer trước khi kết nối, cần truyền đúng giờ upstream để tránh dồn các sự kiện đầu vào mốc 0.

2. Lưu `sessionId`; tái sử dụng sau reconnect. Gửi từng dòng JSON từ RTMS client/Teams bot vào:

```sh
node scripts/meeting-relay.mjs https://your-app.example SESSION_ID < events.ndjson
```

CLI đọc `MEETING_RELAY_TOKEN` từ môi trường, retry có backoff và chỉ chuyển sang dòng tiếp khi API xác nhận. Upstream phải lưu NDJSON/durable queue để replay sau crash; stdin đơn thuần không phải hàng đợi bền vững.

3. Kết thúc sau khi đã drain toàn bộ sự kiện: `POST /api/integrations/session` với `{"action":"end","sessionId":"..."}`.

### Zoom

Tạo app và cấp RTMS scopes phù hợp; xử lý webhook `meeting.rtms_started` bằng SDK/signaling client chính thức; xác thực chữ ký webhook trong relay trước khi mở kết nối. Không trỏ webhook trực tiếp vào `/api/integrations/events` vì route này nhận **media packets** từ relay đã xác thực, không xử lý webhook/signaling.

Adapter nhận `msg_type:17` transcript với `user_id`, `user_name`, `start_time`, `end_time`, `timestamp`, `data`. Nhận `msg_type:18` tin chat public mới (`chat_session.type=1`, `operation_type=1`). Hiện bỏ qua reaction/update/delete; chưa phải đồng bộ toàn bộ vòng đời tin chat. RTMS không bảo đảm chat lossless; nếu cần đầy đủ tuyệt đối phải có nguồn bổ sung và đối soát.

- [RTMS media và schema](https://developers.zoom.us/docs/rtms/meetings/media/)
- [Official sample apps](https://github.com/zoom/rtms-samples)

### Teams

Chọn bot application-hosted media hoặc importer transcript sau họp theo quyền tenant. Media bot cần hạ tầng C#/.NET theo Microsoft; không giả định Next.js route có thể tự vào họp lấy PCM. Quyền chat/transcript/media phải được cấp riêng theo API sử dụng.

Teams bot/importer chuẩn hóa thành contract của adapter:

```json
{"kind":"transcript","id":"utterance-1","participant":{"id":"participant-123","displayName":"An"},"text":"Chốt kế hoạch tuần này","startTimeMs":1791230001000,"endTimeMs":1791230004000,"revision":1}
{"kind":"chat","id":"message-1","participant":{"id":"participant-456","displayName":"Bình"},"text":"Tôi đã gửi tài liệu","timestampMs":1791230005000}
```

Đây **không phải** payload Microsoft Graph nguyên bản. Graph notification cần xác thực rồi fetch transcript/chat theo quyền, mới normalize và relay. Với raw audio, bot cần đưa từng participant stream qua ASR và giữ participant ID khi tạo sự kiện.

- [Teams media bot requirements](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/calls-and-meetings/requirements-considerations-application-hosted-media-bots)

## Thứ tự triển khai

1. Deploy backend realtime v2 cùng hai model và kiểm tra ready/diarization flag.
2. Deploy file-processing có action `refine_meeting`.
3. Cấu hình Firebase Admin/Storage bucket và RunPod server-only trên web app; deploy frontend.
4. Reload extension 0.3.0; cấp mic/tab từ thao tác người dùng; kiểm tra một cuộc Meet ngắn, stop rồi mở transcript/refinement.
5. Khi có Zoom/Teams app, dựng relay/SDK host rồi chạy kiểm thử end-to-end bằng tài khoản được cấp quyền. Không coi fixture tests là xác nhận đã hoạt động trên hai nền tảng thật.

Các thay đổi này chưa deploy lên production hoặc thay đổi tài khoản cloud.
