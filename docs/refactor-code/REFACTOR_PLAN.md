# Kế hoạch Refactor & Phân tích — AI Meeting Notes

> **Tài liệu liên quan:**
> - [`PHASE_3.md`](./PHASE_3.md) — Structure + Type Safety + Migration (đã hoàn thành)
> - [`PHASE_4.md`](./PHASE_4.md) — Performance (đã hoàn thành)
> - [`PHASE_5.md`](./PHASE_5.md) — UI Polish (đã hoàn thành)
> - [`PHASE_6.md`](./PHASE_6.md) — Routing (đang thực hiện)

> **Context dự án:**
> - Tech: Next.js 16, Tailwind v4, Firebase (Firestore + Auth + Storage), RunPod ASR, Gemini AI, MeetingBaas, Zipformer WebSocket
> - Deploy: Vercel auto-deploy từ `main`, dùng `refactor` branch cho preview
> - Data: Firestore đã có production users
> - Testing: Manual only (không có unit test framework)
> - Training Data: Experimental, giữ nguyên không refactor
>
> **Đánh giá tổng thể:** Performance 5/10, Structure 4/10, Cleanliness 3/10, Routes 5/10

---

# PHẦN A: PHÂN TÍCH NGHIỆP VỤ

---

## 1. LUỒNG: Upload File → Transcribe → Summarize

```
Dashboard (chọn file) → Upload Firebase → RunPod (async) → PollingManager (5s) → 
Parse segments → Gemini summary → Completed
```

### 🔴 Nghiêm trọng

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 1.1 | **Draft → Summarize mất dữ liệu nếu refresh** | `app/page.tsx:220-242` | Upload draft lên Cloud, xóa IndexedDB, *rồi* mới gọi Gemini. Nếu tab đóng sau upload nhưng trước khi Gemini trả về → mất cả draft lẫn Cloud |
| 1.2 | **Fire-and-forget không catch toàn bộ** | `app/page.tsx:251-272` | Promise chain `.then().catch()` nhưng `triggerRefresh()` sau `.then()` không await → nếu `.catch()` cũng fail, lỗi nuốt mất |
| 1.3 | **Reprocess có race condition** | `app/page.tsx:307-313` | Xóa `segments` + `summary` + set `status: transcribing` trong 3 lần `updateDoc` riêng lẻ. Nếu user reprocess 2 lần nhanh, dữ liệu bị xóa chéo |

### 🟡 Trung bình

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 1.4 | **Không timeout cho job treo** | `app/components/PollingManager.tsx` | Job RunPod không có `COMPLETED`/`FAILED` → poll vĩnh viễn |
| 1.5 | **Polling ngay cả khi không có job** | `PollingManager.tsx:33` | `setInterval` vẫn chạy mỗi 5s, chỉ `return` nhưng không dừng |
| 1.6 | **Status flow thiếu fallback** | `PollingManager.tsx:46-137` | Chỉ xử lý `COMPLETED` và `FAILED`. Nếu RunPod trả về `IN_PROGRESS` mãi → kẹt |
| 1.7 | **`handleReprocess` ép kiểu `any`** | `app/page.tsx:303` | `(meeting as any).language` có thể là `undefined` |
| 1.8 | **1MB limit hack lặp 3 lần** | `app/lib/db.ts`, `PollingManager.tsx`, `LiveRecordingState.tsx` | Cùng logic "bỏ mảng words khi > 1MB" copy-paste 3 chỗ |

---

## 2. LUỒNG: Ghi âm trực tiếp (Live Recording)

### 🔴 Nghiêm trọng

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 2.1 | **Audio chunks không cleanup** | `LiveRecordingState.tsx` | `audioChunksRef` tích lũy Blob đến khi save → memory leak nếu record dài |
| 2.2 | **Dùng `alert()` + `confirm()` native** | `LiveRecordingState.tsx:579,588` | `confirm("Xóa toàn bộ?")` và `alert("Vui lòng đăng nhập!")` bypass GlobalUI |
| 2.3 | **Hybrid state: IndexedDB + Firestore** | `LiveRecordingState.tsx` | Vừa auto-save IndexedDB, vừa sync Firestore. Nếu 1 trong 2 fail → state không đồng bộ |

### 🟡 Trung bình

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 2.4 | **Auto-save 5s tốn Firestore writes** | `LiveRecordingState.tsx:219` | Mỗi 5s ghi `updateLiveSession()` + `saveDraftMeta()` → 2 writes/chu kỳ |
| 2.5 | **Time estimate sai** | `LiveRecordingState.tsx:246-264` | `bytesPerMinute` hardcode không dựa trên actual bitrate |
| 2.6 | **`handleDeepgramFinal` vẫn tồn tại** | `LiveRecordingState.tsx:159` | Callback Deepgram vẫn dùng dù đã bỏ Deepgram |
| 2.7 | **`wakeLockRef` type `any`** | `LiveRecordingState.tsx:55` | `useRef<any>(null)` |

---

## 3. LUỒNG: Bot tham gia Meeting (MeetingBaas)

### 🔴 Nghiêm trọng

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 3.1 | **Audio lưu vào `public/uploads/` local** | `app/api/webhooks/meetingbaas/route.ts:55-56` | Trên Vercel/serverless, file mất sau deploy → audioUrl chết |
| 3.2 | **`window.location.reload()` sau save** | `BotJoinModal.tsx:195` | Reload cả page sau khi bot xong → mất state, UX rất tệ |
| 3.3 | **Hybrid pipeline fallback mất segment** | `BotJoinModal.tsx:182-186` | Nếu hybrid transcription fail, vẫn lưu meeting với status `completed` và segments rỗng |

### 🟡 Trung bình

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 3.4 | **Polling 3s riêng biệt không sync** | `BotJoinModal.tsx:58` | BotJoinModal polling `/api/bots/status` 3s. PollingManager polling RunPod 5s. 2 polling loops độc lập |
| 3.5 | **Meeting URL không validate** | `BotJoinModal.tsx:23` | Chỉ check `if (!meetingUrl)` — không validate link Google Meet/Zoom |
| 3.6 | **Hardcode domain trong proxy** | `BotJoinModal.tsx:138` | `/api/proxy-file?url=` CORS bypass — không validate URL |
| 3.7 | **Webhook không verify chữ ký** | `webhooks/meetingbaas/route.ts` | Ai POST đến cũng được xử lý |

---

## 4. LUỒNG: Import Google Drive

### 🔴 Nghiêm trọng

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 4.1 | **OAuth thiếu `state` parameter** | `app/api/drive/auth/route.ts` | CSRF attack: attacker có thể swap auth code |

### 🟡 Trung bình

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 4.2 | **Không handle refresh token** | `drive/` | Token Google hết hạn sau 1h, không refresh |
| 4.3 | **Dùng Firebase Client SDK trên server** | `drive/import/route.ts:5` | Client SDK dùng trên API route → insecure |

---

## 5. LUỒNG: Minutes & Q&A

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 5.1 | **Search không debounce** | `MinutesState.tsx` | `setSearchQuery` gọi mỗi lần gõ |
| 5.2 | **`getAllMeetings` không pagination** | `db.ts:80` | Kéo hết meeting về |
| 5.3 | **AI Chat không persist** | `AIChatModal.tsx:37-43` | State mất khi đóng modal |
| 5.4 | **Missing error boundary** | `minutes/[id]/page.tsx:181-207` | Nếu `getMeetingById` fail, chỉ log + toast |
| 5.5 | **`dangerouslySetInnerHTML` 2 lần** | `minutes/[id]/page.tsx:500-510` | Highlight + render HTML chồng nhau → **XSS risk** |

---

## 6. LUỒNG: Action Items & Email

### 🔴 Nghiêm trọng

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 6.1 | **Email API không auth** | `app/api/email/route.ts` | Ai cũng POST `/api/email` để gửi mail → spam relay |
| 6.2 | **Email không rate limit** | `email/route.ts` | Không giới hạn số email/request |

### 🟡 Trung bình

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 6.3 | **Không handle email bounce** | `email/route.ts` | `Promise.all` ném lỗi → tất cả fail |
| 6.4 | **Không unsubscribe link** | `email/route.ts:75-78` | Template thiếu link unsubscribe |
| 6.5 | **Action item extraction không validate** | `tasks/page.tsx` | `assigneeName` từ AI có thể sai |
| 6.6 | **Deadline parsing fragile** | `email/route.ts:14-29` | `new Date()` với `YYYY-MM-DDTHH:mm` không phải ISO chuẩn |

---

## 7. LUỒNG: Training Data Collection — ⚪ EXPERIMENTAL

> **Quyết định:** Giữ nguyên code, không refactor. Feature không blocking, không có user active.

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 7.1 | Xử lý audio trên main thread | `trainingData.ts:192-193` | `AudioContext` + `decodeAudioData` block UI |
| 7.2 | Firebase Storage rules phải public | `trainingData.ts:123-127` | Client SDK upload |
| 7.3 | Tốn storage — mỗi segment 1 file WAV | `trainingData.ts:207-209` | 100 segments = 100 files |
| 7.4 | Vòng lặp for + await tuần tự | `trainingData.ts:197-229` | Từng segment chờ upload xong mới xử lý tiếp |
| 7.5 | Không feedback loop | `trainingData.ts` | Thu thập data nhưng không fine-tune |

**Action:** Thêm comment ở đầu file `app/lib/trainingData.ts`:
```typescript
/**
 * EXPERIMENTAL: Training data collection feature.
 * Code kept for future fine-tuning. Not in active use.
 * Search "EXPERIMENTAL" to find related code.
 */
```

---

## 8. DỮ LIỆU & STATE SYNC

### 🔴 Đồng bộ IndexedDB ↔ Firestore

| # | Vấn đề | Mô tả |
|---|--------|-------|
| 8.1 | **Draft không thể access từ thiết bị khác** | Draft chỉ local, user dùng 2 máy → không thấy |
| 8.2 | **Finalize mất dữ liệu nếu crash giữa chừng** | Upload Firebase → Xóa IndexedDB → Save Firestore. Crash sau upload, trước save → mất |
| 8.3 | **Không conflict resolution** | 2 tab edit cùng 1 meeting → last write wins |

### 🟡 Meeting status không nhất quán

| File | Giá trị kiểm tra |
|------|-----------------|
| `DashboardState.tsx:689` | `["transcribed","summarizing","completed","failed","draft"]` |
| `DashboardState.tsx:742` | `["completed","transcribed","failed"]` |
| `page.tsx:216` | `status === 'draft'` |
| `PollingManager.tsx:176` | `status === "transcribing"` |

> **Không có 1 constant chung** cho status. Nếu thêm status mới, phải sửa nhiều chỗ.

---

## 9. TÍNH NĂNG DỞ DANG / CODE CHẾT

| # | Feature | File | Trạng thái |
|---|---------|------|-----------|
| 9.1 | Fine-tuning | `api/finetune/route.ts` | Route tồn tại, không UI gọi |
| 9.2 | Deepgram | `hooks/useDeepgram.ts`, `api/deepgram/route.ts` | Không dùng, vẫn import trong `LiveRecordingState.tsx:5` |
| 9.3 | RunPod summary (comment-out) | `api.ts:87-114` | 28 dòng code cũ |
| 9.4 | Training feedback loop | `trainingData.ts` | Collect data nhưng không fine-tune |

---

## 10. TỔNG HỢP MỨC ĐỘ

| Mức | Số lượng | Ví dụ |
|-----|----------|-------|
| 🔴 Critical | 9 | Mất dữ liệu (1.1, 8.2), XSS (5.5), SSRF (3.6), Email spam relay (6.1), File lưu local (3.1) |
| 🟡 Major | 14 | Polling vô hạn (1.4), alert native (2.2), không pagination (5.2), race condition (1.3) |
| 🟢 Minor | 9 | any type (2.7), comment-out code (9.3), import thừa |

> **Lưu ý:** XSS (5.5) được upgrade từ Major → Critical vì user có thể inject script qua transcript.

---

# PHẦN B: KẾ HOẠCH REFACTOR

> **Triết lý:** An toàn production data > Tốc độ. Mỗi thay đổi schema phải backward compatible. Test kỹ trên Vercel preview trước khi merge main.

---

## DEPENDENCY MAP

```
Phase 0 (Quick wins)
  └── không phụ thuộc gì
Phase 1A (Critical data loss + XSS)
  └── Phase 0
Phase 1B (Auth + Webhook + UX)
  └── Phase 0 (có thể chạy song song 1A vì khác file)
Phase 2 (Security còn lại)
  └── Phase 0
Phase 3 (Cấu trúc + Type safety + Migration)
  └── Phase 1A, 1B (page.tsx ổn định mới tách)
Phase 4 (Performance)
  └── Phase 3 (cần cấu trúc file mới)
Phase 5 (UI Polish)
  └── Phase 3
Phase 6 (Routing — kéo dài 5-7 ngày)
  └── Phase 3 (page.tsx ổn định)
```

> **Đã bỏ:** Phase Service Abstraction (premature — không fix bug nào)

---

## ⚠️ LƯU Ý QUAN TRỌNG

### File Conflict
Phase 1A (Business Logic Fixes) và Phase 6 (Routing) đều sửa `app/page.tsx`. Bắt buộc làm **Phase 1A → Phase 6**, không thể đảo ngược.

### Backward Compatibility
Vì có production users trên Firestore, mọi thay đổi schema phải:
- **Thêm** giá trị mới OK, **không xóa** giá trị cũ
- `db.ts` split: chỉ tách file, **giữ nguyên signature** hàm, re-export từ `index.ts`
- Status enum: thêm giá trị mới, giữ nguyên giá trị cũ, dùng migration script nếu cần đổi convention
- Firestore rules: deploy song song rules cũ + mới trong 1 tuần, theo dõi lỗi, sau đó mới xóa cũ

---

## GIT BRANCH STRATEGY

> Đơn giản: 1 branch `refactor` duy nhất, không staging/feature/*.
> User tự tạo branch + push, không cần setup từ phía code.

### Workflow

```
1. Tất cả phase làm trên branch refactor
2. Commit riêng từng phase: "phase-0: quick wins", "phase-1a: fix data loss", ...
3. User tự push refactor lên remote
4. Vercel tạo preview URL từ refactor branch
5. Test manual trên preview URL (theo checklist)
6. Nếu có lỗi → fix trực tiếp trên refactor, user push lại
7. Khi HOÀN THÀNH TẤT CẢ phases → user tự merge refactor vào main
8. Nếu merge xong có lỗi production → revert trên Vercel, fix trên main
```

**Lưu ý:** Mỗi phase commit riêng để dễ revert từng phần nếu cần.

---

## MANUAL TEST CHECKLIST (áp dụng cho mỗi phase)

```
□ Auth: login/logout/refresh token
□ Upload: file nhỏ (<10MB), file lớn (>100MB), refresh giữa chừng
□ Transcribe: 1 job, 2 jobs song song, job timeout
□ Summarize: thành công, fail, retry
□ Email: gửi 1 user, gửi nhiều, bounce
□ Bot: join meeting, fallback khi fail
□ Mobile: iPhone Safari, Android Chrome
□ Back/Forward button (sau Phase 6)
□ Multi-tab: mở 2 tab, edit cùng meeting
```

---

## FIRESTORE MIGRATION PLAN

### Khi nào cần migration?
- Đổi status enum (lowercase → UPPERCASE)
- Đổi tên field
- Thêm field bắt buộc

### Cách làm
1. **Dual-write phase (1 tuần):**
   - Code mới ghi CẢ giá trị cũ + mới
   - Code đọc ưu tiên giá trị mới, fallback giá trị cũ
2. **Migration script (chạy 1 lần):**
   - Cloud Function hoặc admin script update tất cả docs cũ
3. **Cleanup phase (1 tuần sau migration):**
   - Xóa code dual-write
   - Xóa fallback trong code đọc

### Firestore Rules Rollout

```javascript
// Rules mới (deploy song song rules cũ)
rules_version = '2';
service cloud.firestore {
  match /meetings/{meetingId} {
    // Rules cũ (giữ nguyên 1 tuần)
    allow read, write: if request.auth != null 
                       && request.auth.uid == resource.data.userId;
    
    // Rules mới (thêm check status enum nếu cần)
    allow update: if request.auth != null
                  && request.auth.uid == resource.data.userId
                  && request.resource.data.status in ['DRAFT', 'TRANSCRIBING', 
                                                       'TRANSCRIBED', 'SUMMARIZING',
                                                       'COMPLETED', 'FAILED'];
  }
}
```

Theo dõi logs 1 tuần → nếu không có lỗi → xóa rules cũ.

---

## ✅ PHASE 0: QUICK WINS + XÓA CODE CHẾT (~2 giờ) [HOÀN THÀNH]

> **An toàn:** Không touch schema, không touch logic flow.

| # | Task | File | Chi tiết |
|---|------|------|----------|
| 0.1 | Xóa `console.log` debug | Tất cả file (~48 chỗ) | **Giữ** `console.error` ở critical path (auth, upload, email). Xóa `console.log`/`console.warn` debug. **Không xóa** log ở catch block |
| 0.2 | Xóa comment vô nghĩa | Tất cả file | `// [MỚI]`, `// [FIX]`, `// [SỬA LỖI TẠI ĐÂY]`, `// [QUAN TRỌNG]` |
| 0.3 | Xóa comment-out code | `app/lib/api.ts:87-114` | 28 dòng code cũ RunPod summary |
| 0.4 | Xóa import thừa | `app/page.tsx`, `PollingManager.tsx` | `deleteField` không dùng |
| 0.5 | Sửa lỗi chính tả | `app/lib/utils.ts:5` | `"sạng"` → `"sang"` |
| 0.6 | Xóa Deepgram hook | `app/hooks/useDeepgram.ts` | Không dùng |
| 0.7 | Xóa Deepgram API route | `app/api/deepgram/route.ts` | Không dùng |
| 0.8 | Xóa import Deepgram | `LiveRecordingState.tsx:5` | `import useDeepgram` |
| 0.9 | Xóa file finetune | `app/api/finetune/route.ts` | Không hoàn thiện |
| 0.10 | Comment EXPERIMENTAL | `app/lib/trainingData.ts` | Thêm header warning |

**Test:** `npm run build` không lỗi.

**Branch:** Commit trên `refactor` branch. User tự push → Vercel preview OK.

---

## ✅ PHASE 1A: CRITICAL DATA LOSS + XSS (2-3 ngày) [HOÀN THÀNH]

> **Critical:** Mất dữ liệu + XSS. Làm trước tiên sau Phase 0.

| # | Task | Fixes issue | File | Chi tiết |
|---|------|-------------|------|----------|
| 1A.1 | Fix Draft → Summarize data loss | 1.1, 8.2 | `app/page.tsx:220-242` | Upload + save Firestore trong 1 atomic operation. **Không xóa IndexedDB** trước khi Gemini trả về. Rollback nếu fail |
| 1A.2 | Fix fire-and-forget promise | 1.2 | `app/page.tsx:251-272` | Catch toàn bộ chain, await `triggerRefresh()`, thêm `.finally()` để cleanup |
| 1A.3 | Fix Reprocess race condition | 1.3 | `app/page.tsx:307-313` | Gộp 3 `updateDoc` thành 1 transaction. Check `status === 'transcribing'` trước khi ghi, skip nếu đã có job |
| 1A.4 | Thêm timeout cho PollingManager | 1.4, 1.6 | `app/components/PollingManager.tsx` | Cancel job sau 30 phút, set `status: failed`. Handle `IN_PROGRESS` > 30 phút |
| 1A.5 | Sanitize `dangerouslySetInnerHTML` | 5.5 (XSS) | `app/minutes/[id]/page.tsx:500` | Dùng DOMPurify hoặc parse HTML an toàn. **Không set raw HTML** từ transcript |

**Manual test (1.5 giờ):**
```
□ Upload file audio → transcribe → summarize → thành công
□ Upload → refresh giữa chừng (trước Gemini) → draft còn nguyên
□ Reprocess 2 lần liên tiếp nhanh → không mất data
□ Job RunPod treo > 30 phút → status = failed
□ Highlight transcript → không có script injection
```

**Branch:** Commit trên `refactor` branch. User tự push → test 48h trên Vercel preview.

---

## ✅ PHASE 1B: AUTH + WEBHOOK + UX (3-4 ngày) [HOÀN THÀNH]

> **Có thể chạy song song 1A** vì touch file khác (chủ yếu API routes + modals).

| # | Task | Fixes issue | File | Chi tiết |
|---|------|-------------|------|----------|
| 1B.1 | Email API auth | 6.1 | `app/api/email/route.ts` | Check Firebase ID token qua header `Authorization: Bearer <token>`. Verify với Admin SDK. Return 401 nếu không có token |
| 1B.2 | Webhook verify HMAC | 3.7 | `app/api/webhooks/meetingbaas/route.ts` | Đọc signature từ header (vd `X-MeetingBaas-Signature`). Verify với secret. Return 401 nếu sai |
| 1B.3 | BotJoin: replace reload() | 3.2 | `app/components/BotJoinModal.tsx:195` | Thay `window.location.reload()` bằng state update + fetch lại meetings list. Giữ modal mở nếu cần |
| 1B.4 | BotJoin: upload lên Firebase | 3.1 | `BotJoinModal.tsx` + webhook | Lưu audio lên Firebase Storage (signed URL), không dùng `public/uploads/`. Webhook return Storage URL |
| 1B.5 | BotJoin: handle fallback đúng | 3.3 | `BotJoinModal.tsx:182-186` | Set `status: 'failed'` nếu hybrid transcription fail, **không save meeting** với segments rỗng |
| 1B.6 | OAuth state parameter | 4.1 | `app/api/drive/auth/route.ts` | Generate state token, lưu sessionStorage. Verify trong callback. Reject nếu mismatch |
| 1B.7 | Drive refresh token | 4.2 | `app/api/drive/` | Implement refresh token flow. Lưu `refresh_token` vào user document |
| 1B.8 | LiveRecording: cleanup chunks | 2.1 | `LiveRecordingState.tsx` | Clear `audioChunksRef` sau mỗi auto-save. Reset sau khi upload xong |
| 1B.9 | LiveRecording: GlobalUI confirm | 2.2 | `LiveRecordingState.tsx:579,588` | Thay `confirm()`/`alert()` bằng `useGlobalUI().confirm()` và `toast.error()` |
| 1B.10 | Search debounce | 5.1 | `MinutesState.tsx` | Debounce 300ms với custom hook hoặc `useDeferredValue` |
| 1B.11 | Thêm error boundary | 5.4 | `app/minutes/[id]/page.tsx` | Wrap component trong `ErrorBoundary`. Fallback UI: nút "Thử lại" |
| 1B.12 | Email bounce + unsubscribe | 6.3, 6.4 | `app/api/email/route.ts` | Thay `Promise.all` bằng `Promise.allSettled`. Log failures. Thêm `<a href="/unsubscribe?token=...">Unsubscribe</a>` vào template |
| 1B.13 | Deadline parsing | 6.6 | `email/route.ts:14-29` | Parse ISO string chuẩn. Validate trước khi `new Date()`. Default fallback nếu invalid |
| 1B.14 | Validate assignee từ AI | 6.5 | `app/tasks/page.tsx` | Sau khi extract, check `assigneeName` có trong team members không. Flag nếu không match |

**Manual test (2-3 giờ):**
```
□ POST /api/email không token → 401
□ Webhook MeetingBaas sai signature → 401
□ OAuth Google Drive thiếu state → reject
□ LiveRecording 30 phút → không crash, memory < 200MB
□ Refresh token Google hết hạn → tự refresh, không logout user
□ Email gửi 10 người, 1 người fail → 9 người nhận được
□ Search gõ nhanh → không lag, chỉ search 1 lần sau 300ms
```

**Branch:** Commit trên `refactor` branch. User tự push → test 48h trên Vercel preview.

---

## ✅ PHASE 2: SECURITY CÒN LẠI (2-3 ngày) [HOÀN THÀNH]

| # | Task | Fixes issue | File | Chi tiết |
|---|------|-------------|------|----------|
| 2.1 | SSRF fix cho proxy-file | 3.6 | `app/api/proxy-file/route.ts` | Validate URL: chỉ `https://`, block private IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`). Block `localhost`, `metadata.google.internal` |
| 2.2 | Rate limit API routes | 6.2 | `email`, `gemini`, `bots/*` routes | Dùng Vercel Edge Middleware hoặc `upstash/ratelimit`. Limit 100 req/phút/user |
| 2.3 | Firebase Admin SDK cho server | 4.3 | `drive/import`, webhooks | Init Admin SDK trong `app/lib/firebase-admin.ts`. Thay Client SDK bằng Admin SDK ở server-side code |
| 2.4 | Storage security rules | 7.2 | Firebase Console | Rules: chỉ authenticated user read/write file của mình. Path: `users/{userId}/...` |
| 2.5 | Validate meeting URL | 3.5 | `BotJoinModal.tsx:23` | Regex check Google Meet (`meet.google.com/[a-z]{3}-[a-z]{4}-[a-z]{3}`) hoặc Zoom URL |

**Manual test (1-2 giờ):**
```
□ /api/proxy-file?url=http://localhost:3000 → 403
□ /api/proxy-file?url=http://169.254.169.254/ → 403 (metadata)
□ Gửi 101 email trong 1 phút → request 101 bị 429
□ Storage rules: user A không đọc được file của user B
□ Join meeting với URL "abc" → reject với error message
```

**Branch:** Commit trên `refactor` branch. User tự push → test 48h trên Vercel preview.

---

## ✅ PHASE 3: CẤU TRÚC + TYPE SAFETY + MIGRATION (3-4 ngày) [HOÀN THÀNH]

> **Gộp:** Structure (Phase 3 cũ) + Type safety (Phase 5 cũ) + Status enum migration.

### 3A. Tách `db.ts` thành nhiều file (giữ signature cũ)

| File mới | Nội dung |
|----------|----------|
| `app/lib/db/meetingDb.ts` | Meeting CRUD + update |
| `app/lib/db/memberDb.ts` | Member CRUD |
| `app/lib/db/templateDb.ts` | Template CRUD |
| `app/lib/db/folderDb.ts` | Folder CRUD |
| `app/lib/db/liveSessionDb.ts` | Live Session CRUD |
| `app/lib/db/index.ts` | **Re-export tất cả** để backward compat |

**Verification trước:** Đọc `db.ts` thật để xác định đúng ranh giới hàm.

### 3B. Tạo `app/components/ui/`

| File | Nội dung |
|------|----------|
| `Button.tsx` | Variants: primary/danger/ghost, sizes: sm/md/lg |
| `Card.tsx` | Card wrapper chuẩn |
| `Badge.tsx` | Status badge |
| `LoadingSkeleton.tsx` | Skeleton loading |

### 3C. Tách component lớn

| File hiện tại | Tách thành |
|----------------|-----------|
| `DashboardState.tsx` (1079 dòng) | `Dashboard/List.tsx` + `Dashboard/Filters.tsx` + `Dashboard/UploadModal.tsx` |
| `MeetingDetailState.tsx` (1112 dòng) | `Meeting/Header.tsx` + `Meeting/Transcript.tsx` + `Meeting/Summary.tsx` |
| `LiveRecordingState.tsx` (774 dòng) | `Live/Controls.tsx` + `Live/Transcript.tsx` + `Live/StatusBar.tsx` |
| `EditorState.tsx` (635 dòng) | `Editor/SegmentList.tsx` + `Editor/EditPanel.tsx` |

### 3D. Constants & Types

Tạo `app/lib/constants.ts`:
```typescript
export const POLLING_INTERVAL_MS = 5000;
export const MAX_DRAFT_SIZE_MB = 1;
export const DEEPGRAM_TIMEOUT_MS = 30 * 60 * 1000;
export const MEETING_STATUS = {
  DRAFT: 'draft',
  TRANSCRIBING: 'transcribing',
  TRANSCRIBED: 'transcribed',
  SUMMARIZING: 'summarizing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;
export type MeetingStatus = typeof MEETING_STATUS[keyof typeof MEETING_STATUS];
```

**Backward compat:** Giữ nguyên giá trị string (lowercase). Chỉ thay đổi nơi sử dụng từ magic string → constant.

### 3E. Xóa `any` type

| File | Thay bằng |
|------|-----------|
| `TranscriptRowProps` | `Segment`, `Speaker` interfaces |
| `PollingManager` | `Meeting`, `MeetingStatus` |
| `LiveRecordingState` | `WakeLockSentinel` interface, `Blob` cho audio chunks |
| `api.ts` RunPod response | `RunPodJobStatus`, `RunPodOutput` interfaces |

**Manual test (2-3 giờ):**
```
□ Tất cả imports từ db.ts vẫn hoạt động (re-export OK)
□ Build không lỗi TypeScript
□ Status hiển thị đúng trên UI (Badge với MEETING_STATUS)
□ DashboardState load list meeting OK
□ LiveRecordingState controls hoạt động
```

**Branch:** Commit trên `refactor` branch. User tự push → test 48h trên Vercel preview.

---

## ✅ PHASE 4: PERFORMANCE (3-4 ngày) [HOÀN THÀNH]

| # | Task | Fixes issue | File | Chi tiết |
|------|------|-------------|------|----------|
| 4.1 | `React.memo` cho `TranscriptRow` | — | `TranscriptRow.tsx` | Tránh re-render mỗi audio frame. Thêm `activeWordIndex` để memo hiệu quả. |
| 4.2 | `useCallback` + `useMemo` | — | `DashboardState.tsx`, `MeetingDetailState.tsx`, `EditorState.tsx`, `LiveRecordingState.tsx` | Ổn định reference cho tất cả handlers. `filteredMeetings` dùng `useMemo`. |
| 4.3 | Firebase pagination | 5.2 | `meetingDb.ts`, `DashboardState.tsx`, `MeetingListView.tsx` | `limit(20)` + `startAfter(cursor)`. Filter `isDeleted` riêng cho tab Trash. |
| 4.4 | Optimize PollingManager | 1.5 | `PollingManager.tsx` | `useState(activeJobsCount)`, interval chỉ chạy khi `activeJobsCount > 0`. |
| ~~4.5~~ | ~~Gộp 1MB fallback~~ | - | - | ❌ Bỏ qua theo user |
| 4.6 | Bỏ `JSON.parse(JSON.stringify())` | — | `meetingDb.ts`, `liveSessionDb.ts` | Thay bằng `structuredClone()`. 5 chỗ. |
| ~~4.7~~ | ~~Retry pattern cho RunPod~~ | - | - | ❌ Bỏ qua theo user |
| ~~4.8~~ | ~~Auto-save debounce~~ | - | - | ❌ Bỏ qua theo user |

**Manual test (2 giờ):**
```
□ Dashboard 50 meetings load < 1s
□ Polling 2 job song song → 1 request/poll thay vì 2
□ Live recording 30 phút → memory < 200MB
□ Upload file 100MB → không timeout
□ Retry khi RunPod 500 → tự retry 3 lần
```

**Branch:** Commit trên `refactor` branch. User tự push → test 48h trên Vercel preview.

---

## ✅ PHASE 5: UI POLISH (2-3 ngày) [HOÀN THÀNH]

| # | Task | File | Chi tiết |
|---|------|------|----------|
| 5.1 | Summary panel responsive | `SummaryPanel.tsx` | `md:w-[400px]` → `lg:w-2/5 md:w-[350px]` |
| 5.2 | Breadcrumb | `Breadcrumb.tsx` | `Dashboard > [meeting title]`. Dùng `onBack` callback |
| 5.3 | Upload modal validation | `UploadModal.tsx`, `LiveSetupModal.tsx`, `DashboardState.tsx` | Thêm `loading` prop, file size warning >100MB, disable khi title rỗng |
| 5.4 | Empty state + CTA | `MeetingListView.tsx`, `Minutes/MeetingList.tsx` | CTA buttons "Tải file lên" / "Ghi âm trực tiếp" / "Tạo cuộc họp" |
| 5.5 | Button loading state | `UploadModal`, `LiveSetupModal`, `MeetingListView`, `GlobalUIProvider` | Adopt `ui/Button` component |
| 5.6 | Toast grouping | `GlobalUIProvider.tsx` | Max 3 toasts, group trùng message+type, reset timer |
| 5.7 | Dark mode consistency | `globals.css` | Force `color-scheme: light`, xóa `prefers-color-scheme: dark` |

**Manual test (1-2 giờ):**
```
□ Resize window 320px → 1920px → UI không vỡ
□ Summary panel responsive: lg:w-2/5, md:w-[350px]
□ Breadcrumb: Dashboard > [title], click quay về Dashboard
□ Upload modal: loading spinner, disabled khi title rỗng, warning >100MB
□ Empty state hiển thị CTA đúng (Dashboard + Minutes)
□ Button loading → click 1 lần không trigger 2 lần
□ Toast: max 3, group trùng message
□ Dark mode: app luôn light mode, không bị vỡ giao diện
```

**Branch:** Commit trên `refactor` branch. User tự push → test 24h trên Vercel preview.

**✅ Hoàn thành:** 17 files modified (7 tasks). Build pass, TypeScript 0 errors.

---

## ✅ PHASE 6: ROUTING — SPA → PROPER ROUTES (5-7 ngày) [HOÀN THÀNH]

> **⚠️ Thay đổi kiến trúc lớn nhất.** Test kỹ trên Vercel preview 1 tuần trước khi merge main.

| Route mới | Component | Thay thế state |
|------------|-----------|----------------|
| `/` | `DashboardState` | `currentState: 'dashboard'` |
| `/edit/[id]` | `EditorState` | `currentState: 'editor'` |
| `/meeting/[id]` | `MeetingDetailState` | `currentState: 'meeting'` |
| `/live` | `LiveRecordingState` | `currentState: 'live'` |
| `/minutes` | `MinutesState` | `currentState: 'minutes'` |
| `/minutes/[id]` | `minutes/[id]/page.tsx` | Giữ nguyên |
| `/tasks` | `tasks/page.tsx` | Giữ nguyên |
| `/team` | `team/page.tsx` | Giữ nguyên |
| `/training` | `training/page.tsx` | Giữ nguyên |

### Thay đổi `app/page.tsx`
- Xóa state machine (`currentState`, `currentMeeting`, `audioUrl`)
- Chỉ giữ `DashboardState` + global modals + `PollingManager`
- Navigation dùng `router.push('/meeting/' + id)` thay `setState(...)`

### Layout nhóm route

```
app/
├── (dashboard)/
│   ├── layout.tsx          ← sidebar + GlobalUI
│   ├── page.tsx            ← Dashboard
│   ├── edit/[id]/page.tsx
│   ├── meeting/[id]/page.tsx
│   ├── live/page.tsx
│   ├── minutes/page.tsx
│   ├── minutes/[id]/page.tsx
│   ├── tasks/page.tsx
│   ├── team/page.tsx
│   └── training/page.tsx
└── api/                    ← giữ nguyên
```

### Auth Middleware

Tạo `middleware.ts`:
```typescript
import { NextResponse } from 'next/server';
export function middleware(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
```

### Migration từ localStorage/sessionStorage
- Một số state có thể đang lưu ở localStorage → cần chuyển sang URL params hoặc server state
- Search query → URL `?q=...`
- Filter → URL `?status=...&folder=...`

**Manual test (3-4 giờ — quan trọng nhất):**
```
□ Mở tất cả 9 route trực tiếp từ URL → load đúng
□ Back/Forward button → state đúng
□ Deep link: share URL `/meeting/abc123` → mở đúng meeting
□ Reload giữa chừng → state còn nguyên (nếu có)
□ Multi-tab: 2 tab cùng meeting → không conflict
□ Mobile: back gesture hoạt động
□ Auth: chưa login → redirect về /login
```

**Branch:** Commit trên `refactor` branch. User tự push → **test 1 tuần** trên Vercel preview trước khi merge main.

---

## ĐÃ BỎ

### Service Abstraction (Phase 8 cũ)
- **Lý do bỏ:** Premature optimization. Hiện có 2 AI service (Gemini + RunPod), abstraction chưa cần. 3-4 ngày làm abstraction không fix bug nào. Có thể làm sau nếu thêm service thứ 3.

---

## TỔNG KẾT EFFORT & PRIORITY

| Phase | Mô tả | Effort | Priority | Dependencies | Trạng thái |
|-------|-------|--------|----------|-------------|-----------|
| 0 | Quick wins + Xóa code chết | ~2h | 🔴 Cao | — | ✅ Hoàn thành |
| 1A | Critical data loss + XSS | 2-3 ngày | 🔴 Cao | Phase 0 | ✅ Hoàn thành |
| 1B | Auth + Webhook + UX | 3-4 ngày | 🔴 Cao | Phase 0 (có thể song song 1A) | ✅ Hoàn thành |
| 2 | Security còn lại | 2-3 ngày | 🔴 Cao | Phase 0 | ✅ Hoàn thành |
| 3 | Cấu trúc + Type safety + Migration | 3-4 ngày | 🟡 Cao | Phase 1A, 1B | ✅ Hoàn thành |
| 4 | Performance | 3-4 ngày | 🟡 Trung bình | Phase 3 | ✅ Hoàn thành |
| 5 | UI Polish | 2-3 ngày | 🟢 Thấp | Phase 3 | ✅ Hoàn thành |
| 6 | Routing (kéo dài) | 5-7 ngày | 🟢 Thấp | Phase 3 | ✅ Hoàn thành |

**Tổng: ~20-27 ngày** (gồm manual testing time)

---

## STRATEGY GỢI Ý

```
Tuần 1: Phase 0 + Phase 1A (critical fix)
Tuần 2: Phase 1B (auth/webhook) — làm tiếp trên cùng refactor branch sau khi 1A OK
Tuần 3: Phase 2 (security)
Tuần 4: Phase 3 (structure + migration)
Tuần 5-6: Phase 4 (performance) + Phase 5 (UI polish)
Tuần 7-8: Phase 6 (routing) + test 1 tuần trên Vercel preview
```

---

## MAPPING BUSINESS ISSUE → PHASE

| Issue | Phase | Note |
|-------|-------|------|
| 1.1, 8.2 — Mất dữ liệu | 1A.1 | Critical |
| 1.2 — Fire-and-forget | 1A.2 | Critical |
| 1.3 — Race condition | 1A.3 | Critical |
| 1.4, 1.6 — Timeout | 1A.4 | Critical |
| 1.5 — Polling rỗng | 4.4 | |
| 1.7 — any type | 3E | |
| 1.8 — 1MB fallback | 4.5 | |
| 2.1 — Memory leak | 1B.8 | |
| 2.2 — Native confirm/alert | 1B.9 | |
| 2.3 — State sync | 1B.8 + 4.5 | |
| 2.4 — Auto-save cost | 4.8 | |
| 2.5 — Time estimate | 4.5 | |
| 2.6 — Deepgram stale code | 0.6-0.8 | |
| 2.7 — any type | 3E | |
| 3.1 — File local | 1B.4 | |
| 3.2 — reload() | 1B.3 | |
| 3.3 — Segment rỗng | 1B.5 | |
| 3.4 — Dual polling | 4.4 | |
| 3.5 — Validate URL | 2.5 | |
| 3.6 — SSRF | 2.1 | |
| 3.7 — Webhook verify | 1B.2 | |
| 4.1 — OAuth state | 1B.6 | |
| 4.2 — Refresh token | 1B.7 | |
| 4.3 — Client SDK server | 2.3 | |
| 5.1 — Debounce | 1B.10 | |
| 5.2 — Pagination | 4.3 | |
| 5.3 — AI Chat persist | Deferred | |
| 5.4 — Error boundary | 1B.11 | |
| 5.5 — XSS | 1A.5 | **Critical** |
| 6.1 — Email auth | 1B.1 | |
| 6.2 — Rate limit | 2.2 | |
| 6.3 — Email bounce | 1B.12 | |
| 6.4 — Unsubscribe | 1B.12 | |
| 6.5 — Validate action items | 1B.14 | |
| 6.6 — Deadline parsing | 1B.13 | |
| 7.1-7.5 — Training | **0.10** (chỉ comment) | Giữ nguyên |
| 8.1 — Cross-device draft | Phase 6 | URL params |
| 8.3 — Conflict resolution | Phase 6 | Route reload |
| 8.4 — Import thừa | 0.4 | |
| Status inconsistency | 3D | |
| 9.1-9.4 — Code chết | 0.6-0.9 | |

---

## ROLLBACK PLAN

Mỗi phase merge vào main phải có khả năng revert trong 5 phút:

1. **Vercel:** Mỗi deploy có URL riêng. Nếu lỗi → "Promote to Production" deployment trước đó
2. **Git:** `git revert <merge-commit>` + push
3. **Firestore rules:** Rollback rules cũ trong Firebase Console (chỉ mất 30 giây)
4. **Schema migration:** Dual-write phase cho phép rollback code dễ dàng

**Quy tắc:** Không xóa code cũ khi chưa có code mới chạy được 1 tuần trên Vercel preview.

---

**Navigation:** [REFACTOR_PLAN.md](./REFACTOR_PLAN.md) • [Phase 3 ➡️](./PHASE_3.md) • [Phase 4 ➡️](./PHASE_4.md) • [Phase 5 ➡️](./PHASE_5.md) • [Phase 6 ➡️](./REFACTOR_PLAN.md#phase-6-routing--spa--proper-routes-5-7-ngày)
