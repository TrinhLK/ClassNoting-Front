# Phase 4 — Performance

> **Tham chiếu:** Plan tổng thể ở [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md) (dòng 514-536). File này ghi lại chi tiết implementation Phase 4.
>
> **Phase trước:** [`PHASE_3.md`](./PHASE_3.md) — Structure + Type Safety + Migration (✅)
> >
> > **Trạng thái:** ✅ **HOÀN THÀNH**

## Tổng quan

| Task | Tên | Effort | Impact | Trạng thái |
|------|-----|--------|--------|-----------|
| **4.1** | `React.memo` cho `TranscriptRow` | 1h | 🔴 Cao | ✅ |
| **4.2** | `useCallback`/`useMemo` cho DashboardState, MeetingDetailState, EditorState, LiveRecordingState | 2-3h | 🟡 Trung bình | ✅ |
| **4.3** | Firebase pagination | 3-4h | 🔴 Cao (khi user có nhiều meeting) | ✅ |
| **4.4** | Tối ưu PollingManager (dừng interval khi không có job) | 1h | 🟡 Trung bình | ✅ |
| **4.6** | Bỏ `JSON.parse(JSON.stringify())` | 0.5h | 🟢 Thấp | ✅ |
| ~~4.5~~ | ~~Gộp 1MB fallback~~ | - | - | ❌ Bỏ qua theo user |
| ~~4.7~~ | ~~Retry pattern cho RunPod~~ | - | - | ❌ Bỏ qua theo user |
| ~~4.8~~ | ~~Auto-save debounce~~ | - | - | ❌ Bỏ qua theo user |

**Tổng effort:** 7-9h (~1.5-2 ngày làm việc)  
**Số commits:** 1 commit duy nhất cho cả Phase 4

---

## Thứ tự thực hiện (đã tối ưu theo dependency)

```
Day 1 (3-4h):
  1. 4.6 — Bỏ JSON.parse(JSON.stringify())  [0.5h - Quick win]
  2. 4.2 — useCallback/useMemo               [2-3h - Nền cho 4.1]
  3. 4.1 — React.memo TranscriptRow          [1h - Sau khi 4.2 xong]

Day 2 (4-5h):
  4. 4.4 — Tối ưu PollingManager              [1h]
  5. 4.3 — Firebase pagination                [3-4h - Task lớn nhất]

Verify: 1-2h (build + manual test)
```

**Lý do thứ tự:**
1. **4.6 + 4.2 + 4.1 đi cùng nhau**: Memo chỉ hiệu quả khi props ổn định. Cần `useCallback` trước, rồi `memo` mới có ý nghĩa.
2. **4.4 độc lập**: Tối ưu polling, ít ảnh hưởng đến các task khác.
3. **4.3 cuối cùng**: Task lớn nhất, cần test kỹ với Firestore pagination. Làm sau khi các tối ưu nhỏ đã xong.

---

## 4.1 React.memo cho TranscriptRow

### Vấn đề
- `TranscriptRow` được render ~100-500 lần trong 1 cuộc họp
- Mỗi lần `currentTime` thay đổi (mỗi frame audio), parent re-render → tất cả rows re-render dù chỉ 1 row thay đổi `isActive`

### Lợi ích dự kiến
- Giảm ~95% re-render không cần thiết
- Mượt hơn khi play audio (đặc biệt cuộc họp dài)

### Cách làm

**File:** `app/components/TranscriptRow.tsx`

```ts
// Trước
export default function TranscriptRow(props) { ... }

// Sau
import { memo } from "react";
function TranscriptRow(props) { ... }
export default memo(TranscriptRow);
```

### Điều kiện tiên quyết
- **Bắt buộc:** Hoàn thành task 4.2 trước — parent (MeetingDetailState, EditorState) phải wrap các callback bằng `useCallback` để giữ reference ổn định
- Memo chỉ có hiệu quả khi props không đổi reference mỗi render

### Props cần chú ý
- `segment: Segment` — ổn định (không đổi trừ khi edit)
- `speaker: Speaker` — ổn định
- `allSpeakers: Speaker[]` — ổn định nếu dùng `useMemo` ở parent
- `isActive: boolean` — thay đổi thường xuyên (theo `currentTime`)
- `isAudioPlaying: boolean` — thay đổi khi play/pause
- `currentTime: number` — thay đổi liên tục
- Các callback — cần `useCallback` ở parent

### Risks
- **Rất thấp** — `memo` chỉ tối ưu re-render, không thay đổi behavior
- **Fallback:** Nếu có bug, bỏ `memo()` → quay về re-render như cũ

---

## 4.2 useCallback/useMemo

### Files cần tối ưu

#### `app/components/DashboardState.tsx`
- `loadMeetings` → `useCallback(() => {...}, [user, toast])`
- `handleMoveToTrash`, `handleRestore`, `handleFinalizeDraft`, `handleDeleteForever`, `handleDeleteSelected`, `handleEmptyTrash`, `handleMoveSelectedToTrash` → `useCallback` với deps đúng
- `toggleSelect`, `toggleSelectAll` → `useCallback`
- `filteredMeetings` → `useMemo(() => meetings.filter(...), [meetings, currentTab])`
- `formatDuration` → move ra ngoài component (pure function)

#### `app/components/MeetingDetailState.tsx`
- `togglePlay`, `skipTime`, `jumpToTime`, `scrollToSegment`, `togglePlaybackRate`, `handleTimeUpdate`, `handleLoadedMetadata` → `useCallback`
- `getSmartCopyText` → `useCallback`
- `formatTimeCode`, `formatDate`, `formatDuration` → `useCallback` (hoặc move ra ngoài)

#### `app/components/LiveRecordingState.tsx`
- `setupVisualizer`, `startRecordingSession`, `stopRecordingSession`, `handeFullStop` → `useCallback`
- `handleToggleRecord`, `handleClearTranscript`, `handleSaveAndProcess` → `useCallback`
- `flushBuffer` → `useCallback`
- `formatTime` → `useCallback`

#### `app/components/EditorState.tsx`
- `handleUpdateText`, `handleChangeSpeaker`, `handleSplitSegment`, `handleMergeSegment`, `handleAddRow`, `handleTimeChange` → `useCallback`
- `handleSave`, `handleSaveTitle` → `useCallback`
- `handleSummarizeRequest` → `useCallback`

### Lợi ích
- Kết hợp với task 4.1, đạt hiệu quả memo hóa tối đa
- Giảm re-render cascade khi state thay đổi

### Risks
- **Thấp** — `useCallback`/`useMemo` chỉ là wrapper, không thay đổi behavior
- **Lưu ý:** Deps array sai có thể gây stale closure — cần test kỹ

---

## 4.3 Firebase Pagination

### Vấn đề
- `getAllMeetings(uid)` trong `app/lib/db/meetingDb.ts` lấy tất cả meeting không giới hạn
- User có 100+ meeting → load chậm, tốn Firestore reads, UX tệ

### Cách làm

#### Bước 1: Thêm hàm mới vào `app/lib/db/meetingDb.ts`

```ts
import { query, where, orderBy, limit, startAfter, type QueryConstraint, type QueryDocumentSnapshot } from "firebase/firestore";

export const PAGE_SIZE = 20;

export const getMeetingsPaginated = async (
  userId: string,
  cursor?: QueryDocumentSnapshot
): Promise<{ meetings: Meeting[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> => {
  const constraints: QueryConstraint[] = [
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(PAGE_SIZE + 1) // +1 để biết còn page nữa không
  ];
  if (cursor) constraints.push(startAfter(cursor));

  const q = query(collection(db, COLLECTION_NAME), ...constraints);
  const snap = await getDocs(q);
  const docs = snap.docs;
  const hasMore = docs.length > PAGE_SIZE;
  const visible = hasMore ? docs.slice(0, PAGE_SIZE) : docs;

  return {
    meetings: visible.map(d => d.data() as Meeting),
    lastDoc: visible[visible.length - 1] ?? null,
    hasMore
  };
};
```

#### Bước 2: Export trong `app/lib/db/index.ts`

```ts
export { getMeetingsPaginated, PAGE_SIZE } from './meetingDb';
```

#### Bước 3: Refactor `app/components/DashboardState.tsx`

- Thêm state mới:
  ```ts
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  ```
- Refactor `loadMeetings` → `loadInitialMeetings` dùng `getMeetingsPaginated`
- Thêm `loadMoreMeetings`:
  ```ts
  const loadMoreMeetings = async () => {
    if (!user || !lastDoc || !hasMore) return;
    const { meetings: moreMeetings, lastDoc: newLastDoc, hasMore: newHasMore } = 
      await getMeetingsPaginated(user.uid, lastDoc);
    setMeetings(prev => [...prev, ...moreMeetings]);
    setLastDoc(newLastDoc);
    setHasMore(newHasMore);
  };
  ```
- Reset pagination khi đổi tab

#### Bước 4: UI "Tải thêm" trong `app/components/Dashboard/MeetingListView.tsx`

- Thêm props: `hasMore: boolean`, `onLoadMore: () => void`
- Render nút ở cuối list:
  ```tsx
  {hasMore && (
    <div className="text-center py-4">
      <button onClick={onLoadMore} className="...">
        Tải thêm
      </button>
    </div>
  )}
  ```

### Backward compat
- **Giữ `getAllMeetings` cũ** cho `MinutesState` và các nơi khác cần tất cả data
- Chỉ thêm hàm mới `getMeetingsPaginated`, không sửa hàm cũ

### Risks
- **Trung bình** — cần test kỹ với Firestore pagination
- **Cần check:** Sub-collect `Drafts` (local IndexedDB) vẫn dùng `getAllDraftsMeta` (local, nhanh, không cần pagination)

---

## 4.4 Tối ưu PollingManager

### Vấn đề
- `setInterval` chạy 5s kể cả khi `activeJobsRef.current.length === 0`
- Đã có `return` ở đầu function check nhưng interval vẫn chạy → lãng phí request

### Cách làm

**File:** `app/components/PollingManager.tsx`

```ts
// Trước (line 30-180 theo plan gốc)
useEffect(() => {
  if (!user) return;
  const intervalId = setInterval(checkRunPodStatus, 5000);
  return () => clearInterval(intervalId);
}, [user, onUpdate]);

// Sau
const [activeJobsCount, setActiveJobsCount] = useState(0);

useEffect(() => {
  if (!user) return;
  const unsubscribe = subscribeToActiveMeetings(user.uid, (meetings) => {
    setActiveJobsCount(meetings.length);
  });
  return () => unsubscribe();
}, [user]);

useEffect(() => {
  if (!user || activeJobsCount === 0) return;
  const intervalId = setInterval(checkRunPodStatus, 5000);
  return () => clearInterval(intervalId);
}, [user, activeJobsCount]);
```

### Tùy chọn nâng cao (optional)
- Tăng interval lên 10s cho job > 5 phút tuổi
- Exponential backoff: poll thưa dần khi job cũ

### Lợi ích
- Giảm Firestore reads khi không có job
- Tránh lãng phí network/CPU

### Risks
- **Thấp** — logic dừng interval đơn giản
- **Cần đảm bảo:** Job cũ vẫn được check khi user mở app lại (activeJobs sẽ subscribe lại ngay khi mount)

---

## 4.6 Bỏ `JSON.parse(JSON.stringify())`

### Vấn đề
- Dùng ở `meetingDb.ts` và có thể `liveSessionDb.ts`
- Chậm, tốn memory, mất các giá trị đặc biệt (Date, Map, Set, etc.)

### Cách làm
- Tìm: `JSON.parse(JSON.stringify(obj))` 
- Thay bằng: `structuredClone(obj)` (Node 17+, Next.js 16 đã hỗ trợ)

### Files cần check
- `app/lib/db/meetingDb.ts`
- `app/lib/db/liveSessionDb.ts` (nếu có)
- Bất kỳ chỗ nào khác trong codebase

### Lợi ích
- Nhanh hơn, ít memory hơn
- Hỗ trợ nhiều types hơn (Date, Map, Set, etc.)

### Risks
- **Rất thấp** — `structuredClone` support hầu hết types trong codebase
- **Lưu ý:** Nếu có class instances, cần check trước (nhưng codebase dùng plain objects)

---

## Manual test checklist (toàn Phase 4)

```
□ Upload file 100MB → không timeout
□ Meeting có 100 segments → render mượt, không giật khi play
□ Mở 5 tab cùng meeting → Firestore reads không tăng vọt
□ Dashboard 50 meetings → load < 1s
□ Click "Tải thêm" → load thêm 20 meetings mượt
□ Polling 2 job song song → chỉ 1 request/poll (verify Network tab)
□ Đợi job xong → Polling tự dừng (không còn request 5s/lần)
□ Mở 2 tab cùng meeting → Firestore reads không tăng vọt
□ Tạo meeting mới, edit, save → không có re-render không cần thiết (React DevTools Profiler)
□ Build production → pass
□ TypeScript → 0 errors
```

---

## Risks & giảm thiểu

| Risk | Giảm thiểu |
|------|-----------|
| Memo có thể gây bug nếu deps array sai | Test kỹ với React DevTools Profiler; giữ logic cũ làm fallback |
| Pagination thay đổi cấu trúc `getAllMeetings` | Giữ hàm cũ cho backward compat; chỉ thêm hàm mới |
| Structured clone có thể không support type đặc biệt | Check types trước (Date, Map, Set) — Next 16 + TS 5 đều support |
| Tối ưu làm hỏng UX (memo quá strict) | Manual test từng thay đổi; revert nếu thấy bug |

---

## Rollback plan

1. **Mỗi thay đổi đều có thể revert** bằng `git revert HEAD~1..HEAD` (vì 1 commit duy nhất)
2. **Hoặc revert chi tiết**: giữ code cũ trong comment khi refactor, dùng feature flag nếu cần
3. **Firestore pagination rollback**: nếu có vấn đề, dùng lại `getAllMeetings` trong `loadMeetings` cũ

---

## Bước tiếp theo: Phase 5 — UI Polish

Xem chi tiết trong plan đã chốt với user. Phase 5 tập trung vào:
- Responsive summary panel
- Breadcrumb component
- Upload modal validation
- Empty state + CTA
- Button loading state
- Toast grouping
- Dark mode consistency

---

**Navigation:** [⬅️ REFACTOR_PLAN.md](./REFACTOR_PLAN.md) • [Phase 3](./PHASE_3.md) • [Phase 4](./PHASE_4.md)
