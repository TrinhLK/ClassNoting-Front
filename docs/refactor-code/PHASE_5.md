# Phase 5 — UI Polish

> **Tham chiếu:** Plan tổng thể ở [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md) (dòng 544-564). File này ghi lại chi tiết implementation Phase 5.
>
> **Phase trước:** [`PHASE_4.md`](./PHASE_4.md) — Performance (✅)
>
> **Trạng thái:** ✅ **HOÀN THÀNH**

## Tổng quan

| Task | Tên | Effort | Impact | Trạng thái |
|------|-----|--------|--------|-----------|
| **5.1** | Summary panel responsive | 1h | 🟡 Trung bình | ✅ |
| **5.2** | Breadcrumb component | 2h | 🟡 Trung bình | ✅ |
| **5.3** | Upload modal validation + loading | 1.5h | 🟡 Trung bình | ✅ |
| **5.4** | Empty state + CTA | 1.5h | 🟡 Trung bình | ✅ |
| **5.5** | Button loading state (adopt `ui/Button`) | 2h | 🟡 Trung bình | ✅ |
| **5.6** | Toast grouping + max limit | 1.5h | 🟢 Thấp | ✅ |
| **5.7** | Dark mode consistency | 4-6h | 🟢 Thấp | ✅ |

**Tổng effort:** ~14-16h (~2-3 ngày làm việc)
**Files modified:** 17 files (7 tasks)
**Build:** ✅ Pass — TypeScript 0 errors

---

## Thứ tự thực hiện (đã tối ưu theo dependency)

```
Day 1 (5-6h):
  1. 5.1 — Summary panel responsive          [1h - Quick win]
  2. 5.2 — Breadcrumb component              [2h - Component mới, không phụ thuộc]
  3. 5.4 — Empty state + CTA                 [1.5h]
  4. 5.3 — Upload modal validation + loading [1.5h - cần 5.5 trước nếu dùng Button]

Day 2 (5-6h):
  5. 5.5 — Button loading state              [2h - Nên làm trước 5.3]
  6. 5.6 — Toast grouping + max limit        [1.5h]

Day 3 (4-6h):
  7. 5.7 — Dark mode consistency             [4-6h - Task lớn nhất, làm cuối]

Verify: 1-2h (build + manual test)
```

**Lý do thứ tự:**
1. **5.1** là quick win, chỉ thay 1 class CSS.
2. **5.2** tạo component mới, không ảnh hưởng code cũ.
3. **5.5** làm trước 5.3 vì UploadModal/LiveSetupModal sẽ adopt `ui/Button` (có sẵn `loading` prop).
4. **5.4** độc lập, chỉ thay empty state UI.
5. **5.6** chỉ sửa `GlobalUIProvider`, không ảnh hưởng logic.
6. **5.7** lớn nhất — touch nhiều file, làm cuối để tránh conflict.

---

## 5.1 Summary Panel Responsive

### Vấn đề
- `SummaryPanel.tsx:85` dùng `md:w-[400px]` cố định — trên tablet (768-1024px) quá hẹp, trên ultrawide quá nhỏ
- Metadata card (`SummaryPanel.tsx:196`) bị `hidden md:block` — mất hoàn toàn trên mobile

### Cách làm

**File:** `app/components/Meeting/SummaryPanel.tsx`

```tsx
// Line 85 — Trước
<div className={`md:w-[400px] bg-slate-50 flex flex-col shrink-0 ${activeTab === "summary" ? "flex flex-1" : "hidden md:flex"}`}>

// Sau
<div className={`lg:w-2/5 md:w-[350px] bg-slate-50 flex flex-col shrink-0 ${activeTab === "summary" ? "flex flex-1" : "hidden md:flex"}`}>
```

**File:** `app/components/MeetingDetailState.tsx` (layout shell line 760)

- Giữ nguyên `flex-col md:flex-row` — không cần thay đổi
- Summary panel đã có `shrink-0` nên sẽ không bị co nhỏ hơn `350px`

### Risks
- **Rất thấp** — chỉ thay đổi responsive breakpoint, không thay đổi logic

---

## 5.2 Breadcrumb Component

### Vấn đề
- Không có breadcrumb navigation. User phải dùng back button để quay lại Dashboard
- Không rõ đang ở meeting nào khi scroll sâu trong transcript

### Cách làm

**Tạo mới:** `app/components/Breadcrumb.tsx`

```tsx
"use client";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string; // không có = current page (text-only)
  onClick?: () => void; // fallback cho SPA state (chưa có routing)
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-slate-500 px-4 md:px-6 py-2 bg-white border-b shrink-0">
      <Home className="w-4 h-4 text-slate-400" />
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          {item.href ? (
            <Link href={item.href} className="hover:text-slate-700 transition-colors font-medium truncate">
              {item.label}
            </Link>
          ) : item.onClick ? (
            <button onClick={item.onClick} className="hover:text-slate-700 transition-colors font-medium truncate">
              {item.label}
            </button>
          ) : (
            <span className="text-slate-800 font-semibold truncate max-w-[200px]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
```

**Sử dụng ở:**

#### `app/components/MeetingDetailState.tsx`
```tsx
import Breadcrumb from "./Breadcrumb";

// Render trước Header
<Breadcrumb
  items={[
    { label: "Dashboard", onClick: () => setCurrentState("DASHBOARD") },
    { label: meeting?.title || "Cuộc họp" },
  ]}
/>
```

#### `app/components/EditorState.tsx`
```tsx
<Breadcrumb
  items={[
    { label: "Dashboard", onClick: () => setCurrentState("DASHBOARD") },
    { label: `Sửa: ${meeting?.title || ""}` },
  ]}
/>
```

### Lưu ý
- Hiện tại app dùng SPA state machine (`page.tsx`), không có URL routing thật
- Dùng `onClick` callback thay vì `href` cho đến khi Phase 6 (Routing) hoàn thành
- Khi Phase 6 xong, thay `onClick` bằng `href="/meeting/[id]"`

### Risks
- **Thấp** — component mới, không ảnh hưởng code cũ
- **Cần:** Truyền `setCurrentState` callback từ `page.tsx` xuống `MeetingDetailState` và `EditorState`

---

## 5.3 Upload Modal Validation + Loading

### Vấn đề
- `UploadModal.tsx:73-78`: Nút "Bắt đầu tải lên" không có loading state, không disable khi chưa có title
- `LiveSetupModal.tsx:75-79`: Tương tự — nút "Bắt đầu ghi âm" không loading
- Không validate file size > 100MB warning
- Không có `loading` prop nào được truyền vào

### Cách làm

#### Bước 1: Thêm `loading` prop vào UploadModal

**File:** `app/components/Dashboard/UploadModal.tsx`

```tsx
// Thêm prop
interface UploadModalProps {
  // ... existing props
  loading?: boolean;
}

// Thêm file size warning (sau line 27, trước line 30)
{selectedFile.size > 100 * 1024 * 1024 && (
  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs font-medium">
    <AlertTriangle className="w-4 h-4 shrink-0" />
    File lớn (&gt;100MB) có thể mất nhiều thời gian để xử lý.
  </div>
)}

// Thay nút confirm (line 73-78) — adopt ui/Button
import Button from "../ui/Button";

<Button
  variant="primary"
  loading={loading}
  disabled={!uploadTitle.trim()}
  onClick={onConfirm}
  className="flex-1"
>
  Bắt đầu tải lên
</Button>
```

#### Bước 2: Tương tự cho LiveSetupModal

**File:** `app/components/Dashboard/LiveSetupModal.tsx`

```tsx
interface LiveSetupModalProps {
  // ... existing props
  loading?: boolean;
}

// Thay nút confirm (line 75-79)
<Button
  variant="danger"
  loading={loading}
  disabled={!liveTitle.trim()}
  onClick={onConfirm}
  className="flex-1"
>
  <Mic className="w-4 h-4" /> Bắt đầu ghi âm
</Button>
```

#### Bước 3: Truyền `loading` từ DashboardState

**File:** `app/components/DashboardState.tsx`

```tsx
// Thêm state
const [isUploadLoading, setIsUploadLoading] = useState(false);
const [isLiveLoading, setIsLiveLoading] = useState(false);

// Wrap onConfirm handlers
const handleUploadConfirm = async () => {
  setIsUploadLoading(true);
  try {
    await doUpload(); // logic hiện tại
  } finally {
    setIsUploadLoading(false);
  }
};

// Truyền vào modal
<UploadModal ... loading={isUploadLoading} onConfirm={handleUploadConfirm} />
<LiveSetupModal ... loading={isLiveLoading} onConfirm={handleLiveConfirm} />
```

### Risks
- **Thấp** — chỉ thêm UI state, không thay đổi logic upload
- **Cần:** Đảm bảo `onConfirm` là async hoặc wrap trong try/finally

---

## 5.4 Empty State + CTA

### Vấn đề
- `MeetingListView.tsx:63-76`: Empty state chỉ có icon + "Danh sách trống." — không có CTA
- `Minutes/MeetingList.tsx:82-95`: Tương tự — text "Chưa có biên bản nào" nhưng không có nút hành động
- User mới không biết phải làm gì tiếp

### Cách làm

#### File: `app/components/Dashboard/MeetingListView.tsx`

```tsx
// Thêm prop
interface MeetingListViewProps {
  // ... existing
  onNavigateToUpload?: () => void;
  onNavigateToLive?: () => void;
}

// Empty state với CTA (thay thế line 63-76)
if (meetings.length === 0) {
  if (currentTab === "trash") {
    return (
      <div className="text-center py-12 md:py-20 bg-white rounded-2xl border border-dashed border-slate-200">
        <div className="w-12 h-12 md:w-16 md:h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300">
          <Trash2 className="w-6 h-6 md:w-8 md:h-8" />
        </div>
        <p className="text-slate-500 font-medium text-sm">Thùng rác trống.</p>
      </div>
    );
  }

  return (
    <div className="text-center py-12 md:py-20 bg-white rounded-2xl border border-dashed border-slate-200">
      <div className="w-12 h-12 md:w-16 md:h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-300">
        <Calendar className="w-6 h-6 md:w-8 md:h-8" />
      </div>
      <h3 className="text-slate-700 font-bold text-base mb-1">Chưa có cuộc họp nào</h3>
      <p className="text-slate-400 text-sm mb-5">Tải lên file audio hoặc ghi âm trực tiếp để bắt đầu.</p>
      <div className="flex items-center justify-center gap-3">
        {onNavigateToUpload && (
          <button
            onClick={onNavigateToUpload}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all"
          >
            Tải file lên
          </button>
        )}
        {onNavigateToLive && (
          <button
            onClick={onNavigateToLive}
            className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl border border-slate-200 transition-all"
          >
            Ghi âm trực tiếp
          </button>
        )}
      </div>
    </div>
  );
}
```

#### File: `app/components/Minutes/MeetingList.tsx`

```tsx
// Thêm prop
interface MeetingListProps {
  // ... existing
  onNavigateToDashboard?: () => void;
}

// Empty state (thay thế line 82-95)
if (meetings.length === 0) {
  return (
    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
      <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-300">
        <FileText className="w-8 h-8" />
      </div>
      <h3 className="text-slate-700 font-bold text-base mb-1">
        {searchQuery.trim() ? "Không tìm thấy biên bản" : "Chưa có biên bản nào"}
      </h3>
      <p className="text-slate-400 text-sm mb-5">
        {searchQuery.trim()
          ? "Thử thay đổi từ khóa tìm kiếm."
          : "Tạo cuộc họp để biên bản xuất hiện ở đây."}
      </p>
      {!searchQuery.trim() && onNavigateToDashboard && (
        <button
          onClick={onNavigateToDashboard}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all"
        >
          Tạo cuộc họp
        </button>
      )}
    </div>
  );
}
```

### Truyền callback từ parent

**File:** `app/components/DashboardState.tsx` — truyền `onNavigateToUpload` và `onNavigateToLive` vào `MeetingListView`

**File:** `app/components/MinutesState.tsx` — truyền `onNavigateToDashboard` vào `MeetingList`

### Risks
- **Rất thấp** — chỉ thay đổi empty state UI, thêm callback props

---

## 5.5 Button Loading State (Adopt `ui/Button`)

### Vấn đề
- `app/components/ui/Button.tsx` đã có sẵn `loading` prop với `Loader2 animate-spin`
- Nhưng **không có component nào** trong app sử dụng nó — tất cả dùng raw `<button>` với inline classes
- Dẫn đến: loading state không nhất quán, nhiều chỗ phải tự implement spinner

### Cách làm

Thay thế raw `<button>` bằng `Button` component ở các vị trí có loading state:

#### File: `app/components/Dashboard/UploadModal.tsx`
```tsx
import Button from "../ui/Button";
// Thay nút Hủy bỏ (line 67-71) và nút Confirm (line 73-78)
<Button variant="secondary" onClick={onCancel} className="flex-1">Hủy bỏ</Button>
<Button variant="primary" loading={loading} disabled={!uploadTitle.trim()} onClick={onConfirm} className="flex-1">Bắt đầu tải lên</Button>
```

#### File: `app/components/Dashboard/LiveSetupModal.tsx`
```tsx
import Button from "../ui/Button";
// Thay nút Hủy bỏ (line 69-72) và nút Confirm (line 75-80)
<Button variant="secondary" onClick={onCancel} className="flex-1">Hủy bỏ</Button>
<Button variant="danger" loading={loading} disabled={!liveTitle.trim()} onClick={onConfirm} className="flex-1"><Mic className="w-4 h-4" /> Bắt đầu ghi âm</Button>
```

#### File: `app/components/Dashboard/MeetingListView.tsx`
```tsx
import Button from "../ui/Button";
// Draft finalize button (line 189) — thay raw button bằng Button
<Button variant="ghost" size="sm" loading={isFinalizing === m.id} onClick={(e) => onFinalizeDraft(e, m)}>
  <Wand2 className="w-4 h-4" /> Tóm tắt
</Button>
```

#### File: `app/components/MeetingDetailState.tsx`
```tsx
// Các nút action trong Header (share, download, reprocess, edit)
// Có thể adopt Button nhưng cần xem xét vì Header đã có styling riêng
// → Ưu tiên các nút có loading state trước
```

#### File: `app/context/GlobalUIProvider.tsx`
```tsx
import Button from "../components/ui/Button";
// Confirm dialog buttons (line 128-141)
<Button variant="secondary" onClick={() => handleConfirm(false)}>{cancelText}</Button>
<Button variant={type === 'danger' ? 'danger' : 'primary'} onClick={() => handleConfirm(true)}>{confirmText}</Button>
```

### Cần mở rộng `ui/Button.tsx`

Thêm variant `danger` (đã có) và đảm bảo `icon` prop hoặc children slot cho icon:

```tsx
// Hiện tại Button đã support children nên có thể:
<Button variant="danger" loading={loading}>
  <Mic className="w-4 h-4" /> Bắt đầu ghi âm
</Button>
```

### Files KHÔNG thay đổi
- `app/page.tsx` — nút action chính, giữ raw button vì có styling phức tạp
- Các nút icon-only (sidebar, header) — giữ raw button vì chỉ có icon

### Risks
- **Thấp** — `Button` component đã hoạt động, chỉ cần adopt
- **Cần test:** Visual consistency giữa nút mới (dùng `Button`) và nút cũ (raw `<button>`)

---

## 5.6 Toast Grouping + Max Limit

### Vấn đề
- `GlobalUIProvider.tsx:95-112`: Toast render tất cả, không giới hạn số lượng
- Nếu 10 toast cùng lúc → che hết màn hình
- Không group toast cùng type (vd: 3 error liên tiếp → nên gộp thành 1)

### Cách làm

**File:** `app/context/GlobalUIProvider.tsx`

```tsx
// Thêm MAX_TOASTS constant
const MAX_TOASTS = 3;

// Sửa addToast (line 54-58)
const addToast = (message: string, type: ToastType) => {
  const id = Math.random().toString(36).substr(2, 9);
  setToasts((prev) => {
    // Group: nếu đã có toast cùng message + type → reset timer thay vì thêm mới
    const existing = prev.find((t) => t.message === message && t.type === type);
    if (existing) {
      // Reset timer cho existing toast
      setTimeout(() => removeToast(existing.id), 3000);
      return prev;
    }
    // Giới hạn số lượng
    const newToasts = [...prev, { id, message, type }];
    if (newToasts.length > MAX_TOASTS) {
      return newToasts.slice(-MAX_TOASTS); // Giữ 3 toast mới nhất
    }
    return newToasts;
  });
  setTimeout(() => removeToast(id), 3000);
};
```

### Risks
- **Rất thấp** — chỉ thay đổi logic toast queue, không ảnh hưởng UI

---

## 5.7 Dark Mode Consistency

### Vấn đề
- **Không có dark mode implementation.** Chỉ có `@media (prefers-color-scheme: dark)` trong `globals.css` đổi CSS vars cho `body`
- Tất cả component dùng hardcoded light classes: `bg-white`, `bg-slate-50`, `text-slate-800`
- Nếu user bật dark mode ở OS → body tối nhưng component vẫn sáng → rất xấu

### Quyết định
Dark mode là feature **lớn** (touch mọi file `.tsx`). Có 2 lựa chọn:

| Lựa chọn | Effort | Ưu điểm | Nhược điểm |
|----------|--------|----------|------------|
| **A. Thêm `dark:` classes** | 4-6h | Native Tailwind, performant | Touch 20+ files |
| **B. Chặn dark mode hoàn toàn** | 0.5h | Nhanh, an toàn | Không có dark mode |

**Đề xuất: Lựa chọn B** — Chặn dark mode trong `globals.css` để app luôn light mode. Dark mode có thể làm sau khi Phase 6 (Routing) hoàn thành.

### Cách làm (Lựa chọn B)

**File:** `app/globals.css`

```css
/* Xóa block @media (prefers-color-scheme: dark) ở line 15-20 */
/* Thêm vào :root để force light mode */
:root {
  --background: #ffffff;
  --foreground: #171717;
  color-scheme: light;
}
```

### Cách làm (Lựa chọn A — nếu muốn dark mode)

Nếu chọn A, cần:

1. **Cấu hình Tailwind** — thêm `darkMode: 'class'` vào config (hoặc `@custom-variant dark (&:is(.dark *));` trong CSS cho Tailwind v4)

2. **Thêm dark mode toggle** — tạo `app/components/ThemeToggle.tsx`

3. **Thêm `dark:` variants** cho mọi component — touch 20+ files:

   | File | Số chỗ cần sửa |
   |------|----------------|
   | `Dashboard/Sidebar.tsx` | `bg-slate-900` → ok, nhưng text cần `dark:` |
   | `Dashboard/Header.tsx` | bg, text, border |
   | `Dashboard/StatsCards.tsx` | bg, text, border, hover |
   | `Dashboard/MeetingListView.tsx` | bg, text, border, badge |
   | `Dashboard/UploadModal.tsx` | bg, text, input, border |
   | `Dashboard/LiveSetupModal.tsx` | Tương tự |
   | `Meeting/Header.tsx` | bg, text, border |
   | `Meeting/SummaryPanel.tsx` | bg, text, border |
   | `Meeting/AudioPlayer.tsx` | bg, text, border |
   | `Meeting/SpeakerFilter.tsx` | bg, text, pill colors |
   | `Meeting/TabSwitcher.tsx` | bg, text |
   | `MeetingDetailState.tsx` | bg, text |
   | `EditorState.tsx` | bg, text, input |
   | `LiveRecordingState.tsx` | bg, text, waveform |
   | `Minutes/Header.tsx` | bg, text, input |
   | `Minutes/MeetingList.tsx` | bg, text, table |
   | `Minutes/FolderGrid.tsx` | bg, text, card |
   | `GlobalUIProvider.tsx` | toast, confirm modal |
   | `Breadcrumb.tsx` | bg, text, border |
   | `ui/Button.tsx` | variant dark colors |
   | `ui/Card.tsx` | bg, border |
   | `ui/Badge.tsx` | dark variant colors |

4. **Pattern chuẩn:**
   ```tsx
   // Light (default) + Dark
   className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700"
   ```

### Risks
- **Lựa chọn B:** Rất thấp — chỉ sửa CSS
- **Lựa chọn A:** Trung bình — touch nhiều file, dễ miss, cần test kỹ trên mọi route

---

## Manual test checklist (toàn Phase 5)

```
□ Resize window 320px → 1920px → UI không vỡ
□ Summary panel trên tablet (768px) → width hợp lý, không quá hẹp
□ Breadcrumb hiển thị đúng: Dashboard > [tên meeting]
□ Breadcrumb click → quay về Dashboard
□ Empty state Dashboard → hiển thị 2 nút CTA "Tải file lên" + "Ghi âm trực tiếp"
□ Empty state Minutes → hiển thị nút CTA "Tạo cuộc họp"
□ Upload modal: chưa nhập title → nút disabled
□ Upload modal: file > 100MB → hiện warning
□ Upload modal: click "Tải lên" → nút show spinner, disabled
□ LiveSetup modal: tương tự upload modal
□ Draft finalize → button show spinner
□ Toast: gửi 5 toast cùng lúc → chỉ hiện 3 toast mới nhất
□ Toast: gửi cùng message 2 lần → chỉ hiện 1 toast (group)
□ Dark mode (nếu implement): mở tất cả route, check contrast
□ Build production → pass
□ TypeScript → 0 errors
```

---

## Risks & giảm thiểu

| Risk | Giảm thiểu |
|------|-----------|
| Breadcrumb không có routing thật (Phase 6 chưa xong) | Dùng `onClick` callback, sau đó migrate sang `href` |
| Adopt `ui/Button` có thể khác styling nút cũ | So sánh visual trước/sau; giữ raw button nếu styling phức tạp |
| Dark mode touch nhiều file | Chọn Lựa chọn B (chặn) trước, làm A sau Phase 6 |
| Toast grouping logic có thể miss edge case | Test kỹ với toast trùng message, trùng type |

---

## Rollback plan

1. **Mỗi task có thể revert độc lập** — các task ít dependency nhau
2. **5.1:** Đổi class CSS về `md:w-[400px]`
3. **5.2:** Xóa `Breadcrumb.tsx`, xóa import/usage
4. **5.3/5.5:** Bỏ `loading` prop, revert về raw `<button>`
5. **5.4:** Revert empty state về icon + text đơn giản
6. **5.6:** Revert `addToast` logic cũ
7. **5.7:** Revert `globals.css` về `@media (prefers-color-scheme: dark)` block

---

## Bước tiếp theo: Phase 6 — Routing

Xem chi tiết trong [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md) (dòng 568-636). Phase 6 tập trung vào:
- Chuyển SPA state machine → proper Next.js routes
- Tạo `(dashboard)/layout.tsx` với sidebar
- Auth middleware
- URL params cho search/filter

---

**Navigation:** [⬅️ Phase 4](./PHASE_4.md) • [REFACTOR_PLAN.md](./REFACTOR_PLAN.md) • [Phase 6 ➡️](./REFACTOR_PLAN.md#phase-6-routing--spa--proper-routes-5-7-ngày)
