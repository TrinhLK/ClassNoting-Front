# Phase 7 — Micro-interactions & Polish

> **Tham chiếu:** Plan tổng thể ở [`UI-IMPROVEMENT-PLAN.md`](./UI-IMPROVEMENT-PLAN.md) Phần B. File này ghi lại chi tiết implementation Phase 7.
> **Yêu cầu:** Phase 0-6 hoàn thành.

## Tổng quan

| Sub-phase | Nội dung | Trạng thái |
|-----------|----------|-----------|
| **7.1 Refactor Toast system** | Dùng `sonner` thay GlobalUI tự code | ⏳ |
| **7.2 Tạo `CommandPalette` (Cmd+K)** | Search + actions nhanh | ⏳ |
| **7.3 Tạo `KeyboardShortcutsProvider`** | Quản lý shortcuts toàn cục | ⏳ |
| **7.4 Tạo `useKeyboardShortcuts` hook** | Helper đăng ký shortcuts | ⏳ |
| **7.5 Thêm page transitions** | Fade in khi navigate | ⏳ |
| **7.6 Thêm list stagger animation** | Items xuất hiện lần lượt | ⏳ |
| **7.7 A11y pass** | aria-label, focus trap, color contrast | ⏳ |
| **7.8 Performance pass** | Memo các component nặng | ⏳ |
| **7.9 Final cleanup** | Xóa dead code, file thừa | ⏳ |
| **7.10 Lint + build cuối** | Đảm bảo pass | ⏳ |
| **Verify** | Manual test toàn app | ⏳ |

**Tổng effort ước tính:** 1 ngày
**Số commits khuyến nghị:** 4-5 commit (Toast, Cmd+K, A11y, Perf, Cleanup)

---

## 7.1 Refactor Toast system

### Lý do
- `GlobalUIProvider` đang tự code toast, không có progress bar, không stack
- `sonner` lib nhẹ, đẹp, dễ dùng

### Cài thêm
```bash
npm install sonner
```

### File: `app/components/ToastProvider.tsx` (MỚI)
```tsx
"use client";
import { Toaster } from "sonner";

export default function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        className: "!rounded-2xl !shadow-lg !border !border-slate-200",
      }}
    />
  );
}
```

### File: `app/layout.tsx` (CẬP NHẬT)
```tsx
import ToastProvider from "./components/ToastProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body suppressHydrationWarning className={`${inter.variable} font-sans`}>
        <AuthProvider>
          <GlobalUIProvider>
            <OnboardingTour />
            <ToastProvider />  {/* <-- thêm ở đây */}
            {children}
          </GlobalUIProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
```

### File: `app/context/GlobalUIProvider.tsx` (CẬP NHẬT)
```tsx
"use client";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { toast as sonnerToast } from "sonner";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "info" | "warning" | "danger";
}

interface GlobalUIContextType {
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
    warning: (msg: string) => void;
    loading: (msg: string) => string;  // returns id
    promise: <T>(promise: Promise<T>, msgs: { loading: string; success: string; error: string }) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const GlobalUIContext = createContext<GlobalUIContextType | null>(null);

export function GlobalUIProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const toast = {
    success: (msg: string) => sonnerToast.success(msg),
    error: (msg: string) => sonnerToast.error(msg),
    info: (msg: string) => sonnerToast.info(msg),
    warning: (msg: string) => sonnerToast.warning(msg),
    loading: (msg: string) => sonnerToast.loading(msg),
    promise: <T,>(promise: Promise<T>, msgs: { loading: string; success: string; error: string }) =>
      sonnerToast.promise(promise, msgs),
  };

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  return (
    <GlobalUIContext.Provider value={{ toast, confirm }}>
      {children}
      <Modal
        isOpen={!!confirmState}
        onClose={() => handleConfirm(false)}
        title={confirmState?.title}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button intent="outline" onClick={() => handleConfirm(false)}>
              {confirmState?.cancelText || "Hủy"}
            </Button>
            <Button
              intent={confirmState?.type === "danger" ? "danger" : "primary"}
              onClick={() => handleConfirm(true)}
            >
              {confirmState?.confirmText || "Xác nhận"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 leading-relaxed">{confirmState?.message}</p>
      </Modal>
    </GlobalUIContext.Provider>
  );
}

export function useGlobalUI() {
  const ctx = useContext(GlobalUIContext);
  if (!ctx) throw new Error("useGlobalUI must be used within GlobalUIProvider");
  return ctx;
}
```

### Kết quả
- ✅ Toast dùng `sonner` → đẹp, có progress, stack
- ✅ Có `toast.promise()` cho async operations
- ✅ Có `toast.loading()` cho loading state
- ✅ Confirm modal đẹp hơn (dùng `<Modal>`)

---

## 7.2 Tạo `CommandPalette` (Cmd+K)

### Lý do
- Topbar có nút search (Phase 1.3) nhưng chưa wire
- Cần Cmd+K → mở search + actions

### File: `app/components/CommandPalette.tsx` (MỚI)
```tsx
"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Home, FileText, ClipboardList, Users, Database,
  Plus, Mic, Upload, Sparkles, Moon, Sun
} from "lucide-react";
import Modal from "./ui/Modal";
import { cn } from "../lib/cn";

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
  group: string;
}

export default function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Open with Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const commands: Command[] = useMemo(() => [
    { id: "nav-home", label: "Dashboard", icon: <Home className="w-4 h-4" />, action: () => router.push("/"), group: "Điều hướng" },
    { id: "nav-minutes", label: "Biên bản họp", icon: <FileText className="w-4 h-4" />, action: () => router.push("/minutes"), group: "Điều hướng" },
    { id: "nav-tasks", label: "Quản lý Task", icon: <ClipboardList className="w-4 h-4" />, action: () => router.push("/tasks"), group: "Điều hướng" },
    { id: "nav-team", label: "Nhân sự", icon: <Users className="w-4 h-4" />, action: () => router.push("/team"), group: "Điều hướng" },
    { id: "nav-training", label: "Dữ liệu huấn luyện", icon: <Database className="w-4 h-4" />, action: () => router.push("/training"), group: "Điều hướng" },
    { id: "act-upload", label: "Tải file lên", icon: <Upload className="w-4 h-4" />, action: () => document.getElementById("tour-upload")?.click(), group: "Hành động" },
    { id: "act-live", label: "Ghi âm trực tiếp", icon: <Mic className="w-4 h-4" />, action: () => document.getElementById("tour-record")?.click(), group: "Hành động" },
  ], [router]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.keywords?.some(k => k.toLowerCase().includes(q))
    );
  }, [query, commands]);

  // Group filtered commands
  const grouped = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    filtered.forEach(c => {
      if (!groups[c.group]) groups[c.group] = [];
      groups[c.group].push(c);
    });
    return groups;
  }, [filtered]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[activeIndex]) {
          filtered[activeIndex].action();
          setIsOpen(false);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, filtered, activeIndex]);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      size="md"
      showCloseButton={false}
      className="!p-0"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
        <Search className="w-5 h-5 text-slate-400 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm kiếm hoặc nhập lệnh..."
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400"
        />
        <kbd className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-mono">ESC</kbd>
      </div>

      <div className="max-h-[400px] overflow-y-auto py-2">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-slate-400 text-sm">
            Không tìm thấy kết quả
          </div>
        ) : (
          Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-2">
              <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {group}
              </p>
              {items.map((c) => {
                const globalIndex = filtered.indexOf(c);
                const isActive = globalIndex === activeIndex;
                return (
                  <button
                    key={c.id}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                    onClick={() => { c.action(); setIsOpen(false); }}
                    className={cn(
                      "w-full px-4 py-2 flex items-center gap-3 text-left transition-colors",
                      isActive ? "bg-primary-50 text-primary-700" : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <span className={cn(
                      "shrink-0",
                      isActive ? "text-primary-600" : "text-slate-400"
                    )}>
                      {c.icon}
                    </span>
                    <span className="flex-1 text-sm font-medium">{c.label}</span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-slate-200 px-4 py-2 flex items-center justify-between text-[10px] text-slate-400">
        <div className="flex items-center gap-3">
          <span><kbd className="px-1 py-0.5 bg-slate-100 rounded font-mono">↑↓</kbd> di chuyển</span>
          <span><kbd className="px-1 py-0.5 bg-slate-100 rounded font-mono">↵</kbd> chọn</span>
        </div>
        <span>Smart Meeting</span>
      </div>
    </Modal>
  );
}
```

### Tích hợp vào AppShell
File: `app/components/AppShell.tsx` (CẬP NHẬT)
```tsx
import CommandPalette from "./CommandPalette";

// Trong return:
<CommandPalette />
```

### Kết quả
- ✅ Cmd+K (hoặc Ctrl+K) mở palette
- ✅ Search + navigate nhanh
- ✅ Keyboard navigation (↑↓ + Enter)

---

## 7.3 Tạo `KeyboardShortcutsProvider`

### Lý do
- Quản lý shortcuts toàn cục (Esc, Cmd+K, Space play/pause)
- Tránh duplicate code

### File: `app/components/KeyboardShortcutsProvider.tsx` (MỚI)
```tsx
"use client";
import { useEffect, type ReactNode } from "react";

interface Shortcut {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  description: string;
  handler: (e: KeyboardEvent) => void;
  preventDefault?: boolean;
}

interface KeyboardShortcutsProviderProps {
  shortcuts?: Shortcut[];
  children: ReactNode;
}

export default function KeyboardShortcutsProvider({ shortcuts = [], children }: KeyboardShortcutsProviderProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input/textarea
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (isTyping && !e.metaKey && !e.ctrlKey) return;

      for (const shortcut of shortcuts) {
        const metaMatch = shortcut.meta ? e.metaKey : !e.metaKey;
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey : !e.ctrlKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (metaMatch && ctrlMatch && shiftMatch && keyMatch) {
          if (shortcut.preventDefault !== false) e.preventDefault();
          shortcut.handler(e);
          break;
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcuts]);

  return <>{children}</>;
}
```

### Kết quả
- ✅ Quản lý shortcuts tập trung
- ✅ Không trigger khi đang gõ input

---

## 7.4 Tạo `useKeyboardShortcuts` hook

### Lý do
- Hook tiện cho mỗi page đăng ký shortcuts riêng

### File: `app/hooks/useKeyboardShortcuts.ts` (MỚI)
```ts
"use client";
import { useEffect } from "react";

interface ShortcutOptions {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  description?: string;
  handler: (e: KeyboardEvent) => void;
  preventDefault?: boolean;
}

export function useKeyboardShortcuts(shortcuts: ShortcutOptions[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (isTyping && !e.metaKey && !e.ctrlKey) return;

      for (const shortcut of shortcuts) {
        const metaMatch = shortcut.meta ? e.metaKey : !e.metaKey;
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey : !e.ctrlKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (metaMatch && ctrlMatch && shiftMatch && keyMatch) {
          if (shortcut.preventDefault !== false) e.preventDefault();
          shortcut.handler(e);
          break;
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
```

### Tích hợp
Ví dụ trong `EditorState.tsx`:
```tsx
useKeyboardShortcuts([
  { key: " ", handler: () => togglePlay(), description: "Play/Pause audio" },
  { key: "ArrowLeft", handler: () => skipTime(-5), description: "Lùi 5s" },
  { key: "ArrowRight", handler: () => skipTime(5), description: "Tua 5s" },
  { key: "s", meta: true, handler: () => handleSave(), description: "Save" },
]);
```

### Kết quả
- ✅ Mỗi page tự đăng ký shortcuts
- ✅ Không conflict với nhau

---

## 7.5 Thêm page transitions

### Lý do
- Next.js 16 có `loading.tsx` → tự động loading state
- Có thể thêm `template.tsx` cho page transition

### File: `app/(dashboard)/template.tsx` (MỚI)
```tsx
"use client";
import { useEffect, useState } from "react";

export default function Template({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(true);
  }, []);

  return (
    <div
      className={`h-full transition-opacity duration-150 ${show ? "opacity-100" : "opacity-0"}`}
    >
      {children}
    </div>
  );
}
```

### Kết quả
- ✅ Mỗi lần navigate trong dashboard, page fade in
- ✅ Smooth transition

---

## 7.6 Thêm list stagger animation

### Lý do
- List item xuất hiện cùng lúc → kém mượt
- Stagger (lần lượt) → mượt hơn

### File: `app/lib/animations.ts` (MỚI)
```ts
import type { Variants } from "framer-motion";

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};
```

### Tích hợp
Dùng `framer-motion` (optional - cài thêm nếu muốn):
```bash
npm install framer-motion
```

Trong `MeetingCard`:
```tsx
<motion.div
  variants={staggerItem}
  whileHover={{ y: -2 }}
  transition={{ duration: 0.15 }}
>
  {/* card content */}
</motion.div>
```

Trong parent:
```tsx
<motion.div variants={staggerContainer} initial="hidden" animate="show">
  {meetings.map(m => <MeetingCard key={m.id} meeting={m} ... />)}
</motion.div>
```

### Lưu ý
- **Optional**: Nếu không muốn thêm lib, có thể dùng CSS `animation-delay` cho từng item
- Trade-off: thêm 30KB cho lib, nhưng UX mượt hơn nhiều

### Kết quả (nếu làm)
- ✅ List items xuất hiện lần lượt
- ✅ Card hover lift

---

## 7.7 A11y pass

### Checklist A11y

**Icon buttons cần `aria-label`**:
```bash
grep -r "icon.*lucide" app/components/ --include="*.tsx" -l | xargs grep -L "aria-label"
```

- Tất cả button chỉ có icon → thêm `aria-label="..."`
- File kiểm tra: `Meeting/Header.tsx`, `Editor/Header.tsx`, `MeetingCard.tsx`, `TranscriptRow.tsx`, `Topbar.tsx`, `Sidebar.tsx`

**Modal cần `role` + `aria-modal`**:
- Đã có trong `<Modal>` (Phase 0.8) ✅

**Form input cần `<label>`**:
- Đã có trong `<Input>` (Phase 0.6) ✅

**Focus ring**:
- Đã có global style trong `globals.css` (Phase 0.4) ✅

**Color contrast**:
- Test với Chrome DevTools Lighthouse
- Indent: `text-slate-500` trên `bg-white` → 4.5:1 ✅
- Cảnh báo: `text-slate-400` trên `bg-slate-50` → có thể dưới 4.5:1. Mitigation: dùng `text-slate-500` thay

**Keyboard navigation**:
- Tất cả button/link/checkbox phải tab được
- Skip link đến main content (optional)

**File mới**: `app/components/SkipToContent.tsx`
```tsx
export default function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg"
    >
      Bỏ qua đến nội dung chính
    </a>
  );
}
```

Thêm `<SkipToContent />` vào `AppShell.tsx` đầu file.

### Kết quả
- ✅ Lighthouse Accessibility ≥ 90
- ✅ Tab navigation hoạt động
- ✅ Screen reader đọc đúng

---

## 7.8 Performance pass

### Memo các component nặng
```tsx
// TranscriptRow đã có memo ✅
// MeetingCard: thêm memo
import { memo } from "react";
export default memo(MeetingCard);

// AudioPlayer: thêm memo
export default memo(EditorAudioPlayer);
```

### Lazy load các component không cần ngay
```tsx
// CommandPalette lazy load
const CommandPalette = dynamic(() => import("./CommandPalette"), { ssr: false });

// TemplateManagerModal lazy load
const TemplateManagerModal = dynamic(() => import("./TemplateManagerModal"), { ssr: false });
```

### Image optimization
- Nếu có ảnh: dùng `next/image`
- Hiện tại app không có ảnh nhiều, không cần lo

### Bundle size check
```bash
npm run build
# Xem output bundle size
```

Nếu component nào > 100KB → tách thành chunk riêng.

### Kết quả
- ✅ Memo các component render nhiều
- ✅ Lazy load modal/command palette
- ✅ Bundle size < 500KB initial

---

## 7.9 Final cleanup

### Xóa dead code (verify lại)
```bash
# Tìm file không được import
npx ts-prune

# Tìm function không dùng
npx unimported
```

Có thể xóa:
- Bất kỳ file nào không còn được import

### Xóa console.log
```bash
grep -r "console.log" app/ --include="*.tsx" --include="*.ts" -l
```

Loại bỏ các `console.log` debug, giữ lại `console.error` quan trọng.

### Loại bỏ import không dùng
```bash
npm run lint -- --fix
```

### Đồng nhất format
```bash
npx prettier --write .
```

### Kết quả
- ✅ Không còn dead code
- ✅ Không còn console.log thừa
- ✅ Format đồng nhất
- ✅ Lint pass

---

## 7.10 Lint + build cuối

```bash
# Clean install
rm -rf node_modules .next
npm install

# Build
npm run build

# Lint
npm run lint

# Type check
npx tsc --noEmit
```

### Kết quả kỳ vọng
- ✅ Build pass
- ✅ Lint 0 errors
- ✅ TypeScript 0 errors
- ✅ Bundle size hợp lý

---

## Verify Phase 7

### Checklist tổng

**Toast (7.1)**:
- [ ] `npm install sonner` không lỗi
- [ ] `toast.success("...")` hiển thị đẹp góc dưới phải
- [ ] `toast.promise()` có loading → success/error
- [ ] Confirm modal dùng `<Modal>` đẹp

**Cmd+K (7.2)**:
- [ ] Cmd+K (hoặc Ctrl+K) mở CommandPalette
- [ ] Gõ "dashboard" → filter ra commands
- [ ] ↑↓ di chuyển, Enter chọn
- [ ] Click command → navigate + đóng palette
- [ ] ESC đóng palette

**Keyboard shortcuts (7.3-7.4)**:
- [ ] Editor: Space play/pause audio
- [ ] Editor: Cmd+S save
- [ ] Editor: ← → skip 5s
- [ ] Không trigger shortcut khi đang gõ input

**Page transitions (7.5)**:
- [ ] Navigate giữa các page trong dashboard có fade in mượt
- [ ] Không bị "flash" trắng

**Stagger (7.6)** (nếu làm):
- [ ] List meeting items xuất hiện lần lượt
- [ ] Card hover lift 2px

**A11y (7.7)**:
- [ ] Lighthouse Accessibility ≥ 90
- [ ] Tab navigation đầy đủ
- [ ] Skip to content hoạt động
- [ ] Screen reader (VoiceOver/NVDA) đọc đúng

**Performance (7.8)**:
- [ ] Lighthouse Performance ≥ 80
- [ ] Initial bundle < 500KB
- [ ] Memo các component nặng

**Cleanup (7.9)**:
- [ ] `npx ts-prune` không cảnh báo
- [ ] Không còn console.log debug
- [ ] Prettier format pass

**Build (7.10)**:
- [ ] `npm run build` pass
- [ ] `npm run lint` 0 errors
- [ ] `npx tsc --noEmit` 0 errors

### Test toàn app (5 flow chính)
1. **Login flow**: Login → Dashboard → Sidebar visible → Topbar visible
2. **Upload flow**: Click "Tải file lên" → Modal mở → Chọn file → Submit → Toast success → List refresh
3. **Edit flow**: Click meeting → Edit → Sửa text → Save → Toast success
4. **Minutes flow**: Vào /minutes → Search "abc" → Highlight vàng → Click → Detail mở
5. **Mobile flow**: 375px → Mở drawer → Navigate → Đóng drawer

### Rollback
- Revert Phase 7
- Phase 0-6 vẫn giữ

---

## Output Phase 7

Sau Phase 7:
- ✅ Toast đẹp (sonner)
- ✅ Command palette (Cmd+K)
- ✅ Keyboard shortcuts
- ✅ Page transitions mượt
- ✅ A11y ≥ 90
- ✅ Performance ≥ 80
- ✅ Code clean, không dead code
- ✅ Build + lint + type check 0 errors

**UI REDESIGN HOÀN THÀNH!**

---

## Tổng kết toàn bộ (Phase 0-7)

### Output tổng
- ✅ **Design system foundation**: 16 UI components + tokens
- ✅ **Layout đồng nhất**: AppShell + Topbar + Sidebar light
- ✅ **Dashboard đẹp**: Hero card + stat cards + list cards
- ✅ **Editor & Meeting Detail mượt**: Audio player + transcript
- ✅ **Minutes đẹp**: Folder + meeting list + AI chat
- ✅ **Trang phụ polish**: Tasks, Team, Live
- ✅ **Login + Onboarding polish**: 2-panel + tour mạnh
- ✅ **Micro-interactions**: Cmd+K + keyboard shortcuts + transitions
- ✅ **A11y + Performance đạt chuẩn**

### Số liệu
- **File mới**: ~40 files (components, hooks, ui)
- **File cập nhật**: ~30 files
- **File xóa**: ~5 files (dead code, duplicate)
- **LOC giảm**: ~3000 dòng (do gộp, tách logic khỏi UI)
- **Dependencies thêm**: 4 (`clsx`, `tailwind-merge`, `class-variance-authority`, `sonner`)
- **Dependencies optional**: 1 (`framer-motion`)

### Khuyến nghị tiếp theo
1. **Dark mode** (dù đã chuẩn bị tokens): chỉ cần thêm `[data-theme="dark"]` block trong CSS
2. **E2E tests** với Playwright (nếu cần)
3. **Storybook** cho UI components (nếu muốn document riêng)
4. **i18n** (đa ngôn ngữ) - hiện hardcode tiếng Việt
5. **Mobile app** (React Native) - dùng lại design system
