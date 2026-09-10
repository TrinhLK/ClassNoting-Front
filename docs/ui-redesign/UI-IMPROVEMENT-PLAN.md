# Kế hoạch cải thiện UI — Smart Meeting Assistant

> **Tài liệu liên quan (file chi tiết thực thi):**
> - [`PHASE_0.md`](./PHASE_0.md) — Design System Foundation
> - [`PHASE_1.md`](./PHASE_1.md) — AppShell + Topbar + Sidebar
> - [`PHASE_2.md`](./PHASE_2.md) — Dashboard Redesign
> - [`PHASE_3.md`](./PHASE_3.md) — Editor & Meeting Detail
> - [`PHASE_4.md`](./PHASE_4.md) — Minutes (Kho biên bản)
> - [`PHASE_5.md`](./PHASE_5.md) — Trang phụ (Tasks / Team / Training / Live)
> - [`PHASE_6.md`](./PHASE_6.md) — Auth & Onboarding
> - [`PHASE_7.md`](./PHASE_7.md) — Micro-interactions & Polish

> **Context dự án:**
> - Tech: Next.js 16 + Tailwind 4 + TypeScript + Firebase
> - UI lib hiện tại: chỉ 4 component (`Button`, `Badge`, `Card`, `LoadingSkeleton`)
> - Palette: giữ nguyên **indigo + slate**
> - Dark mode: chưa triển khai (tập trung light mode)
> - Deploy: Vercel auto-deploy từ `main`, dùng branch `ui-redesign` cho preview
> - Testing: Manual only (giống refactor phase)
>
> **Đánh giá tổng thể hiện tại:** Component consistency 3/10, Layout coherence 4/10, Design system 2/10, UX polish 4/10

---

# PHẦN A: PHÂN TÍCH VẤN ĐỀ UI

---

## 1. Vấn đề tổng quan

### 🔴 Nghiêm trọng (gây "rối mắt")

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 1.1 | **Sidebar tối đứt gãy với content sáng** | `app/(dashboard)/layout.tsx:51` | `bg-slate-900` cho sidebar vs `bg-slate-50` cho content → 2 vùng màu xung khắc |
| 1.2 | **Dead code Sidebar.tsx không dùng** | `app/components/Dashboard/Sidebar.tsx` (toàn file) | Được tạo nhưng DashboardState có inline tab riêng, file này không được import ở đâu |
| 1.3 | **Inline tabs lặp với Sidebar logic** | `app/components/DashboardState.tsx:310-331` | 2 button "Tất cả / Thùng rác" inline trong khi Sidebar (dead code) cũng có |
| 1.4 | **3 modal dùng 3 phong cách khác nhau** | `BotJoinModal.tsx:241-254` (gradient), `LiveSetupModal.tsx:23` (flat), `DriveImportModal.tsx` (ring) | Cùng chức năng modal nhưng UI lệch nhau hoàn toàn |
| 1.5 | **`MeetingDetailState.tsx` 904 dòng** | `app/components/MeetingDetailState.tsx` | Lẫn logic + UI + export function. Khó đọc, khó test |
| 1.6 | **2 audio player duplicate** | `EditorState.tsx:535-586` + `Editor/AudioPlayer.tsx` | Cùng chức năng play/pause/seek, code lặp |
| 1.7 | **`dangerouslySetInnerHTML` raw** | `MeetingDetailState.tsx`, `Minutes/MeetingList.tsx:159-164`, `Meeting/SummaryPanel.tsx:115-117` | XSS risk nếu AI trả về content không sạch |

### 🟡 Trung bình

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 1.8 | **UI library chỉ có 4 components, hầu hết page không dùng** | `app/components/ui/*` | Button, Badge, Card, LoadingSkeleton — 90% page hardcode className |
| 1.9 | **Hardcode color ở khắp nơi** | Tất cả component | `indigo-600`, `slate-900`, `red-500`... không có token |
| 1.10 | **2 button styles lẫn lộn blue vs indigo** | `ui/Button.tsx:16` (blue-600) vs phần còn lại (indigo-600) | Cùng primary style nhưng khác màu |
| 1.11 | **Hover-only action trên touch** | `MeetingListView.tsx:201-242` | Action bar ẩn sau hover → mobile không thấy |
| 1.12 | **2 phiên bản list (table + card) song song** | `MeetingListView.tsx:149-322` | Logic trùng, dễ lệch khi sửa |
| 1.13 | **Border-dashed trên CTA chính** | `Dashboard/StatsCards.tsx:34-55` | Card "Tải file lên" / "Ghi âm" trông "placeholder" thay vì "hành động chính" |
| 1.14 | **2 button size tự định nghĩa (sm/md/lg) + responsive tự code** | `Editor/Header.tsx:89-91`, `Live/Header.tsx:39-55` | `<span class="hidden md:inline">` lặp khắp nơi |

### 🟢 Nhẹ

| # | Vấn đề | File:Line | Mô tả |
|---|--------|-----------|-------|
| 1.15 | **Toast tự code trong GlobalUIProvider** | `app/context/GlobalUIProvider.tsx` | Không có progress bar, không có stack management |
| 1.16 | **Spinner lẻ tẻ `<Loader2 class="animate-spin">`** | 15+ file | Nên có `<Spinner />` chuẩn |
| 1.17 | **Empty state 4 chỗ khác nhau** | `MeetingListView.tsx:67-105`, `Minutes/MeetingList.tsx:84-107`, `team/page.tsx:228-235` | Cùng pattern icon + text + CTA, code 3 lần |
| 1.18 | **Driver.js tour highlight yếu** | `OnboardingTour.tsx` + `globals.css:23-152` | Highlight border mỏng, dễ miss |

---

## 2. Phân tích theo khu vực

### 2.1. Dashboard
- **Header** (`Dashboard/Header.tsx`): Quá nhiều button trên mobile, không có primary/secondary phân cấp rõ
- **StatsCards** (`Dashboard/StatsCards.tsx`): Dashed border cho CTA chính → counter-intuitive
- **MeetingListView** (`Dashboard/MeetingListView.tsx`): 2 phiên bản (table + card) lặp, hover action
- **UploadModal / LiveSetupModal**: Gần giống nhau 90%, nên gộp
- **BotJoinModal / DriveImportModal**: 3 style modal khác nhau (gradient/flat/ring)

### 2.2. Editor & Meeting Detail
- **`EditorState.tsx` (643 dòng)**: Audio player inline dù đã có `Editor/AudioPlayer.tsx`
- **`MeetingDetailState.tsx` (904 dòng)**: Quá lớn, lẫn UI + logic + export
- **`TranscriptRow.tsx` (302 dòng)**: `dangerouslySetInnerHTML` raw, hover-only trên touch
- **`SpeakerSidebar.tsx`**: Quá tối giản, không có duration %

### 2.3. Minutes
- **`Minutes/MeetingList.tsx`**: 2 phiên bản (table + card) lặp, `dangerouslySetInnerHTML`
- **`AIChatModal.tsx`**: Header gradient, message bubble sơ sài
- **`TemplateManagerModal.tsx`**: Inline form, không consistent với modal khác

### 2.4. Tasks / Team / Training / Live
- **`tasks/page.tsx` (534 dòng)**: Lẫn logic AI extract + UI render
- **`team/page.tsx` (435 dòng)**: Form modal inline, không dùng Modal component
- **`Live/*`**: Áp dụng riêng lẻ, chưa có design system

### 2.5. Auth & Onboarding
- **`LoginState.tsx`**: Đã đẹp, cần polish nhỏ
- **`OnboardingTour.tsx`**: Highlight yếu, cần mini-tour cho từng trang

---

## 3. Nguyên tắc redesign

1. **Design tokens trước, components sau**: Phase 0 phải xong trước khi sửa page nào
2. **Không phá vỡ logic**: Refactor chỉ đổi UI, KHÔNG đổi data layer / API
3. **Component reuse tối đa**: 1 component dùng được ở 5 chỗ tốt hơn 5 component riêng
4. **Mobile-first**: 70% user truy cập từ mobile (theo analytics nếu có, nếu không estimate)
5. **Accessibility**: Focus ring, aria-label, color contrast WCAG AA
6. **Test thủ công từng phase** trước khi qua phase tiếp theo

---

# PHẦN B: KẾ HOẠCH THỰC THI (8 PHASES)

> Chi tiết từng phase ở file riêng (xem danh sách ở đầu file).

| Phase | Nội dung | Output | Effort |
|-------|----------|--------|--------|
| **0** | Design System Foundation | Tokens, 16 UI components, `cn.ts` | 2-3 ngày |
| **1** | AppShell + Topbar + Sidebar | Layout đồng nhất, xóa dead code | 2 ngày |
| **2** | Dashboard Redesign | Dashboard đẹp, modal gộp | 2-3 ngày |
| **3** | Editor & Meeting Detail | Editor UX mượt, transcript đẹp | 2-3 ngày |
| **4** | Minutes | Kho biên bản đẹp, AI chat polish | 1-2 ngày |
| **5** | Tasks/Team/Training/Live | Áp design system | 1-2 ngày |
| **6** | Auth & Onboarding | Login + tour đẹp hơn | 1 ngày |
| **7** | Micro-interactions & Polish | Animation, a11y, cleanup | 1 ngày |

**Tổng:** ~10-15 ngày làm việc.

---

# PHẦN C: QUICK WINS (làm ngay nếu muốn)

3 thay đổi nhỏ trong 1-2 giờ sẽ giảm "rối mắt" tức thì:

### QW-1: Đổi sidebar từ tối sang sáng
**File**: `app/(dashboard)/layout.tsx:51`
```diff
- <div className="hidden md:flex w-64 bg-slate-900 text-slate-300 p-6 flex-col gap-8 shrink-0">
+ <div className="hidden md:flex w-64 bg-white border-r text-slate-700 p-6 flex-col gap-8 shrink-0">
```
Và đổi toàn bộ text class trong sidebar từ `text-slate-300` → `text-slate-600`, `text-slate-500` → `text-slate-400`, `hover:bg-slate-800` → `hover:bg-slate-100`.

### QW-2: Xóa dead code
```bash
rm app/components/Dashboard/Sidebar.tsx
```

### QW-3: Đồng bộ button primary
**File**: `app/components/ui/Button.tsx:16`
```diff
- "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200",
+ "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200",
```

---

# PHẦN D: RỦI RO & LƯU Ý

1. **Tailwind 4 + `@theme`**: syntax khác v3, cần test kỹ PostCSS compile
2. **Component import paths**: dùng `@/` alias đã có sẵn — không cần đổi
3. **Driver.js tour**: Phase 6 cần test tour sau khi layout đổi, vì highlight dựa vào `id` có thể bị mất
4. **Dark mode sau**: Phase 0 design tokens sẵn sàng cho dark mode (chỉ cần thêm 1 set CSS variables)
5. **Backup branch**: tạo branch `ui-redesign` riêng
6. **Migration path**: Phase 0 → Phase 1 có thể merge riêng, các phase sau cũng vậy (chia PR nhỏ)

---

# PHẦN E: TIÊU CHÍ HOÀN THÀNH

Mỗi phase chỉ tính "xong" khi:

- [ ] Build không lỗi (`npm run build`)
- [ ] TypeScript không lỗi (`npm run lint`)
- [ ] Test thủ công 5 flow chính:
  1. Login → Dashboard
  2. Upload file → xem meeting detail
  3. Edit transcript → save
  4. Xem minutes → search → AI chat
  5. Mobile responsive (Chrome DevTools 375px)
- [ ] Không regression so với phase trước
- [ ] Screenshot before/after (optional nhưng nên có)
