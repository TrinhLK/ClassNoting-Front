# Phase 3 — Structure + Type Safety + Migration

> **Tham chiếu:** Plan tổng thể ở [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md) (dòng 437-510). File này ghi lại chi tiết implementation Phase 3.

## Tổng quan

| Sub-phase | Nội dung | Trạng thái |
|-----------|----------|-----------|
| **3.1 Status String Migration** | Thay magic string bằng `MEETING_STATUS.*` constants | ✅ |
| **3.2 Xóa any type** | Helper `deleteFieldValue<T>()` + typed assertions | ✅ |
| **3.3A Tách DashboardState** | 4 sub-components | ✅ |
| **3.3B Tách MeetingDetailState** | 4 sub-components | ✅ |
| **3.3C Tách LiveRecordingState** | 4 sub-components | ✅ |
| **3.3D Tách EditorState** | 2 sub-components | ✅ |
| **3.3E Tách MinutesState** | 3 sub-components (+ 1 bonus) | ✅ |
| **Verify** | Build + TypeScript | ✅ |

**Tổng effort:** ~5-6 ngày (theo plan)  
**Số commits:** 1 commit duy nhất cho cả Phase 3

---

## 3.1 Status String Migration

### Vấn đề
- Status string (`'draft'`, `'completed'`, `'failed'`, ...) được dùng trực tiếp ~40 chỗ rải rác ở 9+ files
- Không có single source of truth → dễ sai chính tả, khó refactor

### Giải pháp
- Mở rộng `app/lib/constants.ts` với helper functions:
  ```ts
  export const isFinalStatus = (s: MeetingStatus): boolean =>
    s === MEETING_STATUS.COMPLETED || s === MEETING_STATUS.FAILED;

  export const isActiveStatus = (s: MeetingStatus): boolean =>
    s === MEETING_STATUS.TRANSCRIBING || s === MEETING_STATUS.SUMMARIZING;
  ```
- Thay toàn bộ magic string bằng `MEETING_STATUS.*` constants

### Files đã sửa
- `app/page.tsx` (9 chỗ)
- `app/components/DashboardState.tsx` (9+ chỗ)
- `app/components/PollingManager.tsx` (8 chỗ)
- `app/components/EditorState.tsx` (3 chỗ)
- `app/components/LiveRecordingState.tsx` (1 chỗ)
- `app/components/MinutesState.tsx` (1 chỗ)
- `app/components/DriveImportModal.tsx` (1 chỗ)
- `app/components/BotJoinModal.tsx` (2 chỗ — chỉ meeting status, không phải bot lifecycle)
- `app/lib/db/meetingDb.ts` (3 chỗ: 2 queries + 1 default value)
- `app/api/webhooks/meetingbaas/route.ts` (2 chỗ)
- `app/api/bots/status/route.ts` (1 chỗ)

### Kết quả
- ✅ Backward compat 100% — giá trị chuỗi giữ nguyên (lowercase), không cần migration Firestore
- ✅ Type-safe: `Meeting['status']` luôn check được với `MeetingStatus` constant
- ✅ Bot statuses (`'call_ended'`, `'in_call_recording'`, `'joining'`, `'transcribing'` cho bot) và RunPod statuses (`'COMPLETED'`, `'FAILED'`) giữ nguyên — KHÔNG đụng vì chúng không phải meeting status

---

## 3.2 Xóa `any` type

### Vấn đề
- ~15 chỗ dùng `as any` hoặc `: any` rải rác, làm giảm type safety
- Logic Firestore 1MB fallback dùng `as any` nhiều nơi

### Giải pháp

**Helper mới:** `app/lib/utils/firestore.ts`
```ts
import { deleteField } from "firebase/firestore";
export const deleteFieldValue = <T = unknown>(): T => deleteField() as unknown as T;
```

**Typed assertions:**
- `(window as any).webkitAudioContext` → `as unknown as { webkitAudioContext: typeof AudioContext }`
- `as any[]` (words) → `as Word[]`
- `e: any` (catch blocks) → `e: unknown` + `e instanceof Error` check

### Files đã sửa
- `app/lib/utils/firestore.ts` (mới)
- `app/page.tsx` (2 chỗ `deleteField() as any` → `deleteFieldValue()`)
- `app/components/PollingManager.tsx` (8 chỗ `deleteField() as any` + 1 chỗ `as any[]` → `as Word[]`)
- `app/components/LiveRecordingState.tsx` (2 chỗ `(window as any)` → typed)
- `app/components/DriveImportModal.tsx` (`file: any` → `DriveFile` interface; `e: any` → `e: unknown`)
- `app/components/AIChatModal.tsx` (`e: any` → `e: unknown`)
- `app/live/[id]/page.tsx` (`seg: any` → inline interface)
- `app/lib/utils.ts` (`formatTranscriptText(text: string | any)` → `text: unknown`)

### Giữ nguyên `any` (lý do chính đáng)
- `app/tasks/page.tsx` + `app/tasks/[id]/page.tsx`: dữ liệu từ `JSON.parse()` thực sự dynamic → dùng `any` là an toàn nhất
- `app/api/*` catch blocks còn nhiều chỗ dùng `error: any` — không nằm trong scope 3.2 (sẽ xử lý sau nếu cần)

---

## 3.3 Tách Component Lớn

### Quy tắc chung (đã chốt với user)
- **Stateless + props rõ ràng** — sub-component nhận data + callbacks, không tự fetch
- **Mỗi file có comment 2-3 dòng** giải thích scope
- **Logic phức tạp giữ ở cha** — chỉ tách UI thuần

---

### 3.3A Tách DashboardState (974 → 409 dòng, -58%)

**Sub-components mới:**

| File | Nội dung | Props chính |
|------|----------|-------------|
| `Dashboard/Sidebar.tsx` | Nav items (Tất cả, Tasks, Nhân sự, Biên bản, Training, Thùng rác) + Logout | `currentTab`, `onTabChange`, `onLogout` |
| `Dashboard/Header.tsx` | Title + Action buttons (Bot, Import Drive, Ghi âm) | `currentTab`, `liveLanguage`, callbacks |
| `Dashboard/StatsCards.tsx` | 2 card Upload/Live + language dropdown | `uploadLanguage`, `liveLanguage`, callbacks |
| `Dashboard/MeetingListView.tsx` | Loading + Empty + Table (desktop) + Cards (mobile) | `meetings`, `currentTab`, `selectedIds`, callbacks (12 props) |

**Kết quả:** `DashboardState.tsx` còn 409 dòng, chỉ giữ logic (state, handlers, modals).

---

### 3.3B Tách MeetingDetailState (1046 → ~890 dòng)

**Sub-components mới:**

| File | Nội dung | Props chính |
|------|----------|-------------|
| `Meeting/TabSwitcher.tsx` | Mobile-only tabs (Nội dung / Tóm tắt) | `activeTab`, `onTabChange` |
| `Meeting/SpeakerFilter.tsx` | Filter badges theo người nói | `speakers`, `filteredSpeakerId`, `onFilterChange` |
| `Meeting/Header.tsx` *(tách từ file gốc 729-823)* | Back + Title + Date/Duration + Share + Export dropdown + Tóm tắt lại + Sửa | `meeting`, `isReadOnly`, callbacks (10 props) |
| `Meeting/AudioPlayer.tsx` *(tích hợp vào file gốc, lines 832-896)* | Footer audio player (play/pause/skip/rate/seek/audio ref) | `audioRef`, `audioSrc`, state, callbacks (10 props) |

**Đặc biệt `AudioPlayer.tsx`:** Pass `audioRef` từ parent xuống (chấp nhận hơi anti-pattern nhưng đơn giản hơn so với tách state ownership). Lý do: `audioRef` được share giữa parent (cho `togglePlay`, `scrollToSegment`, `jumpToTime`) và component con.

**Trade-off acknowledged (chưa tách):** `Meeting/TranscriptList.tsx` theo plan gốc chưa được tạo — `TranscriptRow` vẫn render trực tiếp. Chấp nhận được vì:
- `Meeting/SpeakerFilter.tsx` (đã có) đã bao phủ chức năng filter wrapper
- `TranscriptList` chỉ là wrapper render row, có thể gộp vào Phase 4 (Performance) khi tối ưu memoization

---

### 3.3C Tách LiveRecordingState (858 → ~620 dòng)

**Sub-components mới:**

| File | Nội dung | Props chính |
|------|----------|-------------|
| `Live/Header.tsx` | Back button + Share + Save/Stop buttons (KHÔNG chứa timer — tách ra StatusBar) | `isUploading`, `liveSessionId`, `isCopied`, callbacks |
| `Live/StatusBar.tsx` *(tách timer/warning ra)* | Timer display + Remaining minutes warning | `timer`, `remainingMinutesWarning`, `formatTime` |
| `Live/TranscriptView.tsx` | Transcript display với interim content | `segments`, `interimContent`, `onClear` |
| `Live/LVSummaryPanel.tsx` | Real-time summary panel (đã có sẵn, đã được refactor) | `summaries`, `mobileTab`, callbacks |

**Đặc biệt `StatusBar.tsx`:** Tách từ `LiveHeader` ban đầu (đã có timer trong đó) để đáp ứng plan yêu cầu tách `StatusBar` riêng. Layout mới: Header (back + actions) ở trên, StatusBar (timer + warning) ở dưới.

---

### 3.3D Tách EditorState (697 → ~600 dòng)

**Sub-components mới:**

| File | Nội dung | Props chính |
|------|----------|-------------|
| `Editor/Header.tsx` | Back + Editable Title + Template + Tóm tắt + Save | `title`, `isEditingTitle`, `isSaving`, callbacks (10 props) |
| `Editor/SpeakerSidebar.tsx` | Left sidebar — quản lý speakers (Add/Edit/Delete/View) | `speakers`, 4 callbacks |

**Thay thế "EditPanel" theo plan gốc:** Plan đề cập `Editor/EditPanel.tsx` nhưng EditorState không có phần "Edit Panel" riêng. Sub-component được chọn thay thế là `SpeakerSidebar` vì:
- Đây là khối UI lớn nhất có thể tách độc lập
- Logic tương tự (quản lý state + CRUD)
- Phù hợp với vai trò "Edit Panel" trong editor

**Files khác trong EditorState (giữ inline):**
- Mobile tabs (nhỏ, không đáng tách)
- Main editor area (`SegmentList` đã tách từ trước)
- Audio player footer (giữ inline vì `audioRef` quá coupled)
- Speaker modal, Intro modal, Export modal, Template modal (giữ inline vì modal logic phức tạp)

---

### 3.3E Tách MinutesState (739 → ~380 dòng, -49%)

**Sub-components mới:**

| File | Nội dung | Props chính |
|------|----------|-------------|
| `Minutes/Header.tsx` | Title + Refresh + Folder button + Import button + Search bar | `loading`, `searchQuery`, callbacks (5 props) |
| `Minutes/FolderGrid.tsx` | Folder cards với drag/drop support (chỉ hiện ở root) | `folders`, `currentFolder`, `dragOverFolderId`, callbacks (5 props) |
| `Minutes/MeetingList.tsx` | Loading + Empty + Table (desktop) + Cards (mobile) với search highlight | `meetings`, `loading`, `searchQuery`, `selectedIds`, callbacks (8 props) |

**Bonus `FolderGrid.tsx`:** Không nằm trong plan gốc (plan chỉ yêu cầu `Header` và `MeetingList`) nhưng được làm thêm vì:
- Là khối UI độc lập, tách ra giúp code sạch hơn
- Hỗ trợ drag/drop logic phức tạp — tách riêng giúp dễ maintain

---

## File Structure sau Phase 3

```
app/components/
├── Dashboard/
│   ├── Header.tsx              (NEW)
│   ├── LiveSetupModal.tsx      (existing)
│   ├── MeetingListView.tsx     (NEW)
│   ├── Sidebar.tsx             (NEW)
│   ├── StatsCards.tsx          (NEW)
│   └── UploadModal.tsx         (existing)
├── Editor/
│   ├── Header.tsx              (NEW)
│   ├── SegmentList.tsx         (existing, refactored in Phase 3D)
│   └── SpeakerSidebar.tsx      (NEW)
├── Live/
│   ├── Controls.tsx            (existing)
│   ├── Header.tsx              (NEW — refactored in Phase 3C: removed timer)
│   ├── LVSummaryPanel.tsx      (NEW)
│   ├── StatusBar.tsx           (NEW)
│   └── TranscriptView.tsx      (NEW)
├── Meeting/
│   ├── AudioPlayer.tsx         (NEW — integrated)
│   ├── Header.tsx              (NEW)
│   ├── SpeakerFilter.tsx       (NEW)
│   ├── SummaryPanel.tsx        (existing)
│   └── TabSwitcher.tsx         (NEW)
├── Minutes/
│   ├── FolderGrid.tsx          (NEW — bonus)
│   ├── Header.tsx              (NEW)
│   └── MeetingList.tsx         (NEW)
├── ui/
│   ├── Badge.tsx               (existing)
│   ├── Button.tsx              (existing)
│   ├── Card.tsx                (existing)
│   └── LoadingSkeleton.tsx     (existing)
└── ...                         (other unchanged)

app/lib/
├── constants.ts                (extended with helpers)
├── utils/
│   └── firestore.ts            (NEW — deleteFieldValue helper)
```

**Tổng file mới: 18** (15 sub-components + 1 helper + 2 directories tự động)

---

## Stats: Trước vs Sau Phase 3

| File gốc | Trước (dòng) | Sau (dòng) | Giảm |
|----------|-------------|-----------|------|
| `DashboardState.tsx` | 974 | 409 | -58% |
| `MeetingDetailState.tsx` | 1046 | ~890 | -15% |
| `LiveRecordingState.tsx` | 858 | ~620 | -28% |
| `EditorState.tsx` | 697 | ~600 | -14% |
| `MinutesState.tsx` | 739 | ~380 | -49% |
| **Tổng** | **4314** | **~2899** | **-33%** |

---

## Verification

### Build & TypeScript
```bash
npx tsc --noEmit   # → 0 errors
npx next build     # → ✓ Compiled successfully
```

### Manual test (chưa chạy trên browser)
- ✅ Cấu trúc code: sub-components nhận props rõ ràng
- ✅ Type safety: không còn `as any` trong scope
- ✅ Backward compat: Firestore data không cần migration
- ⚠️ Visual: cần test trên browser thực tế (Phase 4 hoặc sau)

---

## Mapping Business Issue → Phase 3 (theo REFACTOR_PLAN.md)

| Issue | Phase 3 Task | Status |
|-------|--------------|--------|
| 1.1, 8.2 — Mất dữ liệu | (Phase 1A) | ✅ Done |
| 1.2 — Fire-and-forget | (Phase 1A) | ✅ Done |
| 1.3 — Race condition | (Phase 1A) | ✅ Done |
| 1.4, 1.6 — Timeout | (Phase 1A) | ✅ Done |
| 1.5 — Polling rỗng | (Phase 4) | Chưa làm |
| 1.7 — any type | 3.2 | ✅ Done |
| 1.8 — 1MB fallback | (Phase 4 - bỏ qua theo user) | ❌ |
| 2.1 — Memory leak | (Phase 1B) | ✅ Done |
| 2.2 — Native confirm/alert | (Phase 1B) | ✅ Done |
| 2.3 — State sync | (Phase 1B) | ✅ Done |
| 2.4 — Auto-save cost | (Phase 4 - bỏ qua) | ❌ |
| 2.5 — Time estimate | (Phase 4 - bỏ qua) | ❌ |
| 2.6 — Deepgram stale code | (Phase 0) | ✅ Done |
| 2.7 — any type | 3.2 | ✅ Done |
| 3.1 — File local | (Phase 1B) | ✅ Done |
| 3.2 — reload() | (Phase 1B) | ✅ Done |
| 3.3 — Segment rỗng | (Phase 1B) | ✅ Done |
| 3.4 — Dual polling | (Phase 4) | Chưa làm |
| 3.5 — Validate URL | (Phase 2) | ✅ Done |
| 3.6 — SSRF | (Phase 2) | ✅ Done |
| 3.7 — Webhook verify | (Phase 1B) | ✅ Done |
| 4.1 — OAuth state | (Phase 1B) | ✅ Done |
| 4.2 — Refresh token | (Phase 1B) | ✅ Done |
| 4.3 — Client SDK server | (Phase 2) | ✅ Done |
| 5.1 — Debounce | (Phase 1B) | ✅ Done |
| 5.2 — Pagination | (Phase 4) | Chưa làm |
| 5.3 — AI Chat persist | (Deferred) | ❌ |
| 5.4 — Error boundary | (Phase 1B) | ✅ Done |
| 5.5 — XSS | (Phase 1A) | ✅ Done |
| 6.1 — Email auth | (Phase 1B) | ✅ Done |
| 6.2 — Rate limit | (Phase 2) | ✅ Done |
| 6.3 — Email bounce | (Phase 1B) | ✅ Done |
| 6.4 — Unsubscribe | (Phase 1B) | ✅ Done |
| 6.5 — Validate action items | (Phase 1B) | ✅ Done |
| 6.6 — Deadline parsing | (Phase 1B) | ✅ Done |
| 7.1-7.5 — Training | (Phase 0) | ✅ Done |
| 8.1 — Cross-device draft | (Phase 6) | Chưa làm |
| 8.2 — Finalize mất dữ liệu | (Phase 1A) | ✅ Done |
| 8.3 — Conflict resolution | (Phase 6) | Chưa làm |
| 8.4 — Import thừa | (Phase 0) | ✅ Done |
| Status inconsistency | 3.1 | ✅ Done |
| 9.1-9.4 — Code chết | (Phase 0) | ✅ Done |

---

## Known Limitations (acknowledged, không trong scope)

1. **`Meeting/TranscriptList.tsx`** — plan gốc đề cập nhưng chưa tạo. Sẽ gộp vào Phase 4 khi tối ưu memoization `TranscriptRow` (vì TranscriptList chỉ là wrapper render).
2. **Mobile tabs trong EditorState** — giữ inline (quá nhỏ, không đáng tách).
3. **Audio player trong EditorState** — giữ inline vì `audioRef` quá coupled.
4. **BotModal, BotJoinModal** — không tách vì là self-contained modal.

---

## Bước tiếp theo: Phase 4 — Performance

Xem chi tiết trong plan đã chốt với user. 5 task cốt lõi:
1. 4.6 — Bỏ `JSON.parse(JSON.stringify())` 
2. 4.2 — `useCallback`/`useMemo` cho các component lớn
3. 4.1 — `React.memo` cho `TranscriptRow`
4. 4.4 — Tối ưu `PollingManager` (dừng interval khi không có job)
5. 4.3 — Firebase pagination cho Dashboard

Xem chi tiết tại [`PHASE_4.md`](./PHASE_4.md).

---

**Navigation:** [⬅️ REFACTOR_PLAN.md](./REFACTOR_PLAN.md) • [Phase 3](./PHASE_3.md) • [Phase 4 ➡️](./PHASE_4.md)
