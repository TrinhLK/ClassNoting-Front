# Runbook — Live ASR (Ghi âm trực tiếp)

Sự cố thường gặp: banner **"Mất kết nối, đang thử kết nối lại... (n/5)"** khi ghi âm live, LIVE INSIGHTS trống.

## 1. Kiến trúc & điểm hỏng

```
Browser (useLocalTranscription.ts)
   │  wss://asr-live.noting.io.vn/?language=vi
   ▼
Cloudflare Edge ──► Cloudflare Tunnel (cloudflared) ──► Origin
   │                                                        │
   │ _hostname asr-live.noting.io.vn                        ├─ Zeabur service
   │ _hostname asr.noting.io.vn (CŨ — đã chết, cần xóa)     │  `classnoting-realtime-server`
   │                                                        │  (Tencent Jakarta 2C2GB)
```

| Lớp | Vai trò | Điểm hỏng hay gặp |
|---|---|---|
| Frontend `app/hooks/useLocalTranscription.ts` | Retry tối đa 5 lần, backoff 1→2→4→8→16s, heartbeat silence 8s | Đã fix: retry kẹt ở (1/5), race heartbeat, connect-timeout 8s |
| Cloudflare Edge | Proxy + TLS | Idle-timeout WebSocket → cần heartbeat (đã có) |
| Cloudflare Tunnel | Connector cloudflared → origin | Connector chết = **1033**; origin chết = **502** |
| Zeabur service | Chạy ASR (Sherpa-ONNX WS) | Crash/OOM trên 2C2GB, sai port, volume chưa mount |

## 2. Chẩn đoán nhanh (30 giây)

```bash
# A. Handshake WS — mong đợi HTTP 1.1 101
curl -si --max-time 10 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://asr-live.noting.io.vn/?language=vi" | head -1

# B. HTTP thường
curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 https://asr-live.noting.io.vn/
```

| Kết quả | Nghĩa | Xử lý |
|---|---|---|
| `101` | Khỏe — không cần làm gì | — |
| `502` | Tunnel sống nhưng **origin (Zeabur service) không phản hồi** | Mục 3 |
| `530` / `1033` | **Không có connector tunnel nào sống** | Mục 4 |
| `520-524` | Lỗi origin trực tiếp (không qua tunnel) | Mục 3 |
| Timeout | Sai port / firewall | Mục 3 (Networking) |

## 3. Sửa 502 — Origin (Zeabur) chết

> Nguyên tắc: **chỉ sửa khi có bằng chứng từ Logs/Usage**. Service đang xanh 2/2 thì không động vào.

1. **Zeabur Dashboard → service `classnoting-realtime-server`**
   - Trạng thái `Running • 1/2` (chấm vàng) = 1 replica chết → bấm mũi tên ▾ xem instance nào, restart bao nhiêu lần.
2. **Logs** — tìm quanh thời điểm sự cố:
   | Dấu hiệu | Nguyên nhân | Xử lý |
   |---|---|---|
   | `OOMKilled` / killed | Thiếu RAM (2C2GB) | Giảm replicas → 1, hoặc nâng gói server |
   | `Address already in use` | Sai port / 2 process | Khớp port với tab Networking |
   | lỗi load model / file not found | Volume chưa mount hoặc path sai | Tab Volumes → mount lại |
   | crash loop ngay khi start | Lỗi code/config | Deploy lại bản trước (Deployments → lịch sử → Redeploy) |
3. **Usage** — so memory peak với 2GB (chốt nghi vấn OOM).
4. **Networking** — ghi lại **container port** và domain public. Đối chiếu với ingress của cloudflared (Mục 4): lệch port → 502.
5. Sau khi fix → **Redeploy** → chạy lại mục 2A, phải ra `101`.

**Command tab** (terminal trong browser, không cần SSH):
```bash
free -m                                   # RAM còn bao nhiêu
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:<PORT>/   # service nội bộ có sống?
ps aux | head -20
```

## 4. Sửa 1033 — Cloudflare Tunnel

1. **Cloudflare Dashboard → Zero Trust → Networks → Tunnels**:
   - Tunnel trạng thái `Down/Degraded` → xem log; connector thường chạy như service/container → restart nó (Zeabur hoặc máy host).
   - Không có tunnel nào → tạo lại + cập nhật DNS CNAME.
2. **Ingress rule** của tunnel phải trỏ origin đúng (Zeabur domain/public URL + port đã ghi ở mục 3 Networking). Dùng `http://`/`https://` — **không** dùng `ws://`.
3. **DNS dọn dẹp**: hostname cũ `asr.noting.io.vn` (từ trước commit `fb9da78`) trỏ tunnel chết → **xóa record này** để client không fallback vào URL chết. Client chỉ dùng `NEXT_PUBLIC_REALTIME_PROCESSING_SERVER` (`.env.local`).
4. Zone settings: SSL/TLS mode = **Full (strict)**; WebSockets = On (Network tab).

## 5. Frontend — hành vi sau khi fix (repo này)

| Tình huống | Hành vi |
|---|---|
| WS đóng bất thường | Banner `(1/5)` → `(2/5)` … `(5/5)`, backoff 1/2/4/8/16s |
| Mạng máy bạn mất | Banner riêng: *"Mất mạng internet, đang thử kết nối lại..."* + tự nối ngay khi có lại mạng (event `online`) |
| WS treo khi handshake | Ép close sau 8s → vào luồng retry |
| Hết 5 lần | Banner *"Mất kết nối máy chủ ASR sau 5 lần thử (lỗi ...)"* → **tự dừng ghi nền**, giữ nguyên transcript/draft, hiện nút **Thử lại** |
| Bấm Thử lại / nút ghi âm | Phiên mới, bộ đếm retry reset |
| Audio trong lúc mất kết nối | Buffer tối đa ~5s, flush ngay khi nối lại (không mất) |

## 6. Giám sát (trước sự cố)

- **UptimeRobot / healthchecks.io** (miễn phí): ping `https://asr-live.noting.io.vn/` mỗi 60s → cảnh báo Telegram/email khi ≠200.
- Zeabur: theo dõi tab **Usage** định kỳ (RAM/ CPU).
- Log rotation: giữ log Zeabur theo ngày, tránh disk đầy.

## 7. Checklist khi live đang lỗi

1. `curl` mục 2A → đọc mã lỗi
2. `502` → Zeabur Logs + Usage (mục 3) · `1033` → Cloudflare Tunnels (mục 4)
3. Sửa → Redeploy/restart → verify `101`
4. Test thật: `/live` → bấm ghi âm 30s → có transcript + LIVE INSIGHTS
5. Ghi lại thời gian sự cố + nguyên nhân vào sổ vận hành

## 8. Environment liên quan

| Biến | Giá trị | Nơi dùng |
|---|---|---|
| `NEXT_PUBLIC_REALTIME_PROCESSING_SERVER` | `wss://asr-live.noting.io.vn` | `.env.local` — WS live transcription |
| Backend repo | `TrinhLK/ClassNoting-Realtime-Server` (Zeabur service) | Nguồn ASR |
| Zeabur server | Tencent Jakarta 2C 2GB | Host service |
