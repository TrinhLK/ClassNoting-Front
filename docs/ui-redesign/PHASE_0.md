# Phase 0 — Design System Foundation

> **Tham chiếu:** Plan tổng thể ở [`UI-IMPROVEMENT-PLAN.md`](./UI-IMPROVEMENT-PLAN.md) Phần B. File này ghi lại chi tiết implementation Phase 0.

## Tổng quan

| Sub-phase | Nội dung | Trạng thái |
|-----------|----------|-----------|
| **0.1 Cài dependencies** | `clsx`, `tailwind-merge`, `class-variance-authority` | ⏳ |
| **0.2 Tạo `app/lib/cn.ts`** | Utility gộp class | ⏳ |
| **0.3 Tạo `app/lib/design-tokens.ts`** | Type-safe variants | ⏳ |
| **0.4 Mở rộng `app/globals.css`** | Tailwind 4 `@theme` tokens | ⏳ |
| **0.5 Tạo `Spinner`** | Loading chuẩn | ⏳ |
| **0.6 Tạo `Input`** | Form input với label/hint/error | ⏳ |
| **0.7 Tạo `Select`** | Dropdown wrapper | ⏳ |
| **0.8 Tạo `Modal`** | Wrapper cho mọi modal | ⏳ |
| **0.9 Tạo `Avatar`** | Speaker/member avatar | ⏳ |
| **0.10 Tạo `EmptyState`** | Icon + title + description + CTA | ⏳ |
| **0.11 Tạo `StatCard`** | KPI card | ⏳ |
| **0.12 Tạo `PageHeader`** | Title + actions pattern | ⏳ |
| **0.13 Tạo `Tabs`** | Thay inline tab buttons | ⏳ |
| **0.14 Tạo `SegmentedControl`** | Toggle đẹp hơn select | ⏳ |
| **0.15 Tạo `ProgressBar`** | Linear progress | ⏳ |
| **0.16 Tạo `Tooltip`** | Hover tooltip | ⏳ |
| **0.17 Tạo `MarkdownContent`** | An toàn thay `prose prose-sm` | ⏳ |
| **0.18 Update `Button`/`Badge`/`Card`/`LoadingSkeleton`** | Dùng tokens | ⏳ |
| **Verify** | Build + Lint + Test thủ công | ⏳ |

**Tổng effort ước tính:** 2-3 ngày
**Số commits khuyến nghị:** 1 commit cho setup (0.1-0.4), 1 commit cho mỗi nhóm component

---

## 0.1 Cài dependencies

### Lý do
- `clsx`: conditional className sạch hơn template string
- `tailwind-merge`: tránh conflict class (vd `p-2 p-4` → lấy `p-4`)
- `class-variance-authority` (cva): tạo variants cho component (size, color, intent)

### Lệnh
```bash
npm install clsx tailwind-merge class-variance-authority
```

### Verify
- `package.json` có 3 deps mới
- `npm run build` không lỗi

---

## 0.2 Tạo `app/lib/cn.ts`

### Lý do
- Tái sử dụng utility merge class, dùng ở mọi component

### File: `app/lib/cn.ts` (MỚI)
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Gộp className có điều kiện, đồng thời merge các Tailwind class conflict.
 *
 * @example
 * cn("p-2", isActive && "bg-indigo-600", "p-4")  // → "bg-indigo-600 p-4"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Kết quả
- ✅ Single source of truth cho class merging
- ✅ Tránh duplicate logic ở 5+ file

---

## 0.3 Tạo `app/lib/design-tokens.ts`

### Lý do
- Type-safe cho variants (Button intent, Badge status, Card elevation...)
- Tránh magic string rải rác

### File: `app/lib/design-tokens.ts` (MỚI)
```ts
// ============= BUTTON VARIANTS =============
export const buttonIntents = [
  "primary",
  "secondary",
  "danger",
  "ghost",
  "success",
] as const;
export type ButtonIntent = (typeof buttonIntents)[number];

export const buttonSizes = ["sm", "md", "lg"] as const;
export type ButtonSize = (typeof buttonSizes)[number];

// ============= BADGE VARIANTS =============
export const badgeIntents = [
  "neutral",
  "primary",
  "success",
  "warning",
  "danger",
  "info",
] as const;
export type BadgeIntent = (typeof badgeIntents)[number];

// ============= CARD VARIANTS =============
export const cardElevations = ["flat", "raised", "overlay"] as const;
export type CardElevation = (typeof cardElevations)[number];

// ============= MODAL SIZES =============
export const modalSizes = ["sm", "md", "lg", "xl", "full"] as const;
export type ModalSize = (typeof modalSizes)[number];

// ============= AVATAR SIZES =============
export const avatarSizes = ["xs", "sm", "md", "lg", "xl"] as const;
export type AvatarSize = (typeof avatarSizes)[number];

// ============= SPEAKER COLORS (8 màu chuẩn) =============
export const speakerColorSchemes = [
  { bg: "bg-indigo-100", text: "text-indigo-700", ring: "ring-indigo-200" },
  { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200" },
  { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200" },
  { bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-200" },
  { bg: "bg-sky-100", text: "text-sky-700", ring: "ring-sky-200" },
  { bg: "bg-violet-100", text: "text-violet-700", ring: "ring-violet-200" },
  { bg: "bg-teal-100", text: "text-teal-700", ring: "ring-teal-200" },
  { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-200" },
] as const;
```

### Kết quả
- ✅ Type-safe variants
- ✅ 8 màu speaker chuẩn (thay vì random mỗi chỗ)

---

## 0.4 Mở rộng `app/globals.css`

### Lý do
- Tailwind 4 dùng `@theme` thay cho `tailwind.config.js`
- Single source of truth cho color/spacing/shadow/radius

### File: `app/globals.css` (CẬP NHẬT)
Thay toàn bộ nội dung hiện tại bằng:

```css
@import "tailwindcss";

/* ============ DESIGN TOKENS ============ */
@theme {
  /* Brand colors - Indigo (primary) */
  --color-primary-50: #eef2ff;
  --color-primary-100: #e0e7ff;
  --color-primary-200: #c7d2fe;
  --color-primary-300: #a5b4fc;
  --color-primary-400: #818cf8;
  --color-primary-500: #6366f1;
  --color-primary-600: #4f46e5;
  --color-primary-700: #4338ca;
  --color-primary-800: #3730a3;
  --color-primary-900: #312e81;

  /* Surface - Neutral backgrounds */
  --color-surface: #ffffff;
  --color-surface-muted: #f8fafc;       /* slate-50 */
  --color-surface-subtle: #f1f5f9;     /* slate-100 */
  --color-surface-inverse: #0f172a;     /* slate-900 */

  /* Border */
  --color-border: #e2e8f0;             /* slate-200 */
  --color-border-muted: #f1f5f9;       /* slate-100 */
  --color-border-strong: #cbd5e1;      /* slate-300 */

  /* Foreground - Text colors */
  --color-foreground: #0f172a;          /* slate-900 */
  --color-foreground-muted: #475569;    /* slate-600 */
  --color-foreground-subtle: #94a3b8;   /* slate-400 */
  --color-foreground-inverse: #f8fafc;  /* slate-50 */

  /* Semantic */
  --color-success: #10b981;             /* emerald-500 */
  --color-success-bg: #ecfdf5;          /* emerald-50 */
  --color-success-text: #047857;        /* emerald-700 */
  --color-warning: #f59e0b;             /* amber-500 */
  --color-warning-bg: #fffbeb;          /* amber-50 */
  --color-warning-text: #b45309;        /* amber-700 */
  --color-danger: #ef4444;              /* red-500 */
  --color-danger-bg: #fef2f2;           /* red-50 */
  --color-danger-text: #b91c1c;         /* red-700 */
  --color-info: #3b82f6;                /* blue-500 */
  --color-info-bg: #eff6ff;             /* blue-50 */
  --color-info-text: #1d4ed8;           /* blue-700 */

  /* Border radius */
  --radius-sm: 0.375rem;                /* 6px */
  --radius-md: 0.5rem;                  /* 8px */
  --radius-lg: 0.75rem;                 /* 12px */
  --radius-xl: 1rem;                    /* 16px */
  --radius-2xl: 1.5rem;                 /* 24px */

  /* Shadow */
  --shadow-card: 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --shadow-card-hover: 0 4px 12px 0 rgb(0 0 0 / 0.08);
  --shadow-popover: 0 8px 24px 0 rgb(0 0 0 / 0.12);
  --shadow-modal: 0 24px 48px 0 rgb(0 0 0 / 0.16);

  /* Font family */
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;

  /* Z-index scale */
  --z-base: 0;
  --z-dropdown: 50;
  --z-sticky: 100;
  --z-fixed: 200;
  --z-modal: 1000;
  --z-popover: 1100;
  --z-toast: 1200;
}

/* ============ BASE ============ */
:root {
  color-scheme: light;
}

body {
  background: var(--color-surface-muted);
  color: var(--color-foreground);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ============ SCROLLBAR ============ */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: var(--radius-md);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-foreground-subtle);
}

/* ============ FOCUS RING ============ */
:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* ============ ANIMATIONS (giữ nguyên + thêm mới) ============ */
@keyframes blob {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -50px) scale(1.1); }
  66% { transform: translate(-20px, 20px) scale(0.9); }
}
.animate-blob { animation: blob 7s infinite; }
.animation-delay-2000 { animation-delay: 2s; }
.animation-delay-4000 { animation-delay: 4s; }

/* ============ DRIVER.JS TOUR (giữ nguyên) ============ */
/* ... giữ nguyên block từ .driver-popover.tour-popover ... */
```

### Kết quả
- ✅ Mọi component dùng `bg-surface`, `text-foreground-muted`, etc. thay vì hardcode
- ✅ Sửa 1 chỗ → cả app đổi
- ✅ Sẵn sàng cho dark mode (chỉ cần thêm `[data-theme="dark"]` block)

### Lưu ý
- **KHÔNG xóa** block driver.js tour (`.driver-popover.tour-popover`...) — vẫn cần cho Phase 6
- Test kỹ `npm run build` vì Tailwind 4 syntax khác v3

---

## 0.5 Component `Spinner`

### Lý do
- Hiện có 15+ chỗ dùng `<Loader2 className="animate-spin">` lặp lại
- Cần size + intent (màu) linh hoạt

### File: `app/components/ui/Spinner.tsx` (MỚI)
```tsx
import { Loader2 } from "lucide-react";
import { cn } from "@/app/lib/cn";

type SpinnerSize = "sm" | "md" | "lg" | "xl";
type SpinnerIntent = "primary" | "white" | "muted";

interface SpinnerProps {
  size?: SpinnerSize;
  intent?: SpinnerIntent;
  className?: string;
}

const sizeMap: Record<SpinnerSize, string> = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-8 h-8",
  xl: "w-12 h-12",
};

const intentMap: Record<SpinnerIntent, string> = {
  primary: "text-primary-600",
  white: "text-white",
  muted: "text-slate-400",
};

export default function Spinner({ size = "md", intent = "primary", className }: SpinnerProps) {
  return <Loader2 className={cn("animate-spin", sizeMap[size], intentMap[intent], className)} />;
}
```

### Kết quả
- ✅ Replace `<Loader2 className="w-4 h-4 animate-spin text-indigo-600" />` → `<Spinner size="sm" />`
- ✅ Intent/size chuẩn, không typo

### Files cần refactor sau Phase 0 (chưa làm trong Phase 0)
- 15+ file có `<Loader2 className="..." />`
- Đánh dấu TODO, sẽ sửa dần ở các phase sau

---

## 0.6 Component `Input`

### Lý do
- Hiện không có Input component → mỗi form hardcode className khác nhau
- Cần label, hint, error state thống nhất

### File: `app/components/ui/Input.tsx` (MỚI)
```tsx
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, leftIcon, rightIcon, className, id, ...props }, ref) => {
    const inputId = id || `input-${React.useId()}`;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full px-4 py-2.5 bg-slate-50 border rounded-xl",
              "text-sm font-medium text-slate-700",
              "transition focus:outline-none focus:ring-2",
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              error
                ? "border-red-300 focus:ring-red-400 focus:border-red-400"
                : "border-slate-200 focus:ring-primary-500 focus:border-primary-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {rightIcon}
            </div>
          )}
        </div>
        {error ? (
          <p className="text-xs text-red-600 mt-1.5 ml-1">{error}</p>
        ) : hint ? (
          <p className="text-xs text-slate-500 mt-1.5 ml-1">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;
```

### Kết quả
- ✅ Mọi form input dùng `<Input label="..." />` thay vì hardcode
- ✅ Error/hint state tự động style đúng

---

## 0.7 Component `Select`

### Lý do
- 8+ chỗ dùng `<select className="..." />` với style lặp
- Cần thống nhất với `Input`

### File: `app/components/ui/Select.tsx` (MỚI)
```tsx
import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";
import { ChevronDown } from "lucide-react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, options, className, id, ...props }, ref) => {
    const selectId = id || `select-${React.useId()}`;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl",
              "text-sm font-medium text-slate-700",
              "appearance-none cursor-pointer",
              "transition focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "pr-10",  // space for chevron
              error && "border-red-300 focus:ring-red-400",
              className
            )}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        {error ? (
          <p className="text-xs text-red-600 mt-1.5 ml-1">{error}</p>
        ) : hint ? (
          <p className="text-xs text-slate-500 mt-1.5 ml-1">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = "Select";
export default Select;
```

### Kết quả
- ✅ Select đẹp với chevron icon
- ✅ Label/hint/error đồng bộ với `Input`

---

## 0.8 Component `Modal`

### Lý do
- 4 modal trong app đang code riêng (`UploadModal`, `LiveSetupModal`, `BotJoinModal`, `DriveImportModal`)
- Cần wrapper chuẩn: backdrop, ESC close, focus trap, body scroll lock

### File: `app/components/ui/Modal.tsx` (MỚI)
```tsx
"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/app/lib/cn";
import { type ModalSize } from "@/app/lib/design-tokens";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  icon?: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

const sizeMap: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[95vw] h-[95vh]",
};

export default function Modal({
  isOpen, onClose, title, description, icon,
  size = "md", closeOnBackdrop = true, closeOnEsc = true,
  showCloseButton = true, footer, children, className
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, closeOnEsc, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        className={cn(
          "bg-white rounded-2xl border border-slate-200/80 shadow-2xl w-full",
          "max-h-[90vh] flex flex-col overflow-hidden",
          "animate-in fade-in zoom-in-95 duration-200",
          sizeMap[size],
          className
        )}
      >
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100 shrink-0">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {icon && (
                <div className="p-2 bg-primary-50 text-primary-600 rounded-lg shrink-0">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                {title && (
                  <h2 id="modal-title" className="text-lg font-bold text-slate-800 truncate">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="text-xs text-slate-500 mt-1">{description}</p>
                )}
              </div>
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
```

### Kết quả
- ✅ ESC close, backdrop click close, body scroll lock có sẵn
- ✅ Focus trap cơ bản (cải thiện sau nếu cần)
- ✅ 4 modal hiện tại sẽ refactor dùng `<Modal>` ở Phase 2

---

## 0.9 Component `Avatar`

### Lý do
- Speaker color, member avatar, user icon đang hardcode ở 10+ chỗ
- Cần size + color chuẩn

### File: `app/components/ui/Avatar.tsx` (MỚI)
```tsx
import { cn } from "@/app/lib/cn";
import { type AvatarSize } from "@/app/lib/design-tokens";

interface AvatarProps {
  name: string;
  colorScheme?: { bg: string; text: string };
  size?: AvatarSize;
  className?: string;
}

const sizeMap: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: "w-6 h-6", text: "text-xs" },
  sm: { container: "w-8 h-8", text: "text-sm" },
  md: { container: "w-10 h-10", text: "text-base" },
  lg: { container: "w-12 h-12", text: "text-lg" },
  xl: { container: "w-16 h-16", text: "text-2xl" },
};

export default function Avatar({
  name, colorScheme, size = "md", className
}: AvatarProps) {
  const initial = name?.charAt(0)?.toUpperCase() || "?";
  const scheme = colorScheme || { bg: "bg-slate-100", text: "text-slate-600" };
  const sizing = sizeMap[size];

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold shrink-0",
        scheme.bg,
        scheme.text,
        sizing.container,
        sizing.text,
        className
      )}
      title={name}
    >
      {initial}
    </div>
  );
}
```

### Kết quả
- ✅ Thay `<div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600">A</div>` → `<Avatar name="An" colorScheme={{ bg: "bg-indigo-100", text: "text-indigo-600" }} size="sm" />`

---

## 0.10 Component `EmptyState`

### Lý do
- 4 chỗ trong app đang code EmptyState riêng (Dashboard, Minutes, Tasks, Team)
- Cần 1 component thống nhất

### File: `app/components/ui/EmptyState.tsx` (MỚI)
```tsx
import { cn } from "@/app/lib/cn";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: "default" | "compact";
  className?: string;
}

export default function EmptyState({
  icon, title, description, action, variant = "default", className
}: EmptyStateProps) {
  return (
    <div className={cn(
      "text-center bg-white rounded-2xl border border-dashed border-slate-200",
      variant === "compact" ? "py-8" : "py-12 md:py-20",
      className
    )}>
      <div className={cn(
        "mx-auto mb-3 md:mb-4 rounded-full flex items-center justify-center",
        variant === "compact" ? "w-12 h-12" : "w-16 h-16",
        "bg-slate-50 text-slate-300"
      )}>
        {icon}
      </div>
      <h3 className="text-slate-700 font-bold text-base mb-1">{title}</h3>
      {description && <p className="text-slate-400 text-sm mb-5 max-w-md mx-auto px-4">{description}</p>}
      {action && <div className="flex items-center justify-center gap-3">{action}</div>}
    </div>
  );
}
```

### Kết quả
- ✅ Mọi empty state dùng `<EmptyState icon={<Calendar/>} title="..." />`
- ✅ Replace 4 đoạn code trùng

---

## 0.11 Component `StatCard`

### Lý do
- Dashboard cần 4 KPI card (Tổng cuộc họp, Tổng thời lượng, Đang xử lý, Thùng rác)
- Cần pattern icon + label + value + trend

### File: `app/components/ui/StatCard.tsx` (MỚI)
```tsx
import { cn } from "@/app/lib/cn";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  trend?: { value: number; label?: string };  // % change
  intent?: "primary" | "success" | "warning" | "danger" | "neutral";
  className?: string;
}

const intentMap = {
  primary: { bg: "bg-primary-50", text: "text-primary-600" },
  success: { bg: "bg-emerald-50", text: "text-emerald-600" },
  warning: { bg: "bg-amber-50", text: "text-amber-600" },
  danger:  { bg: "bg-red-50",    text: "text-red-600" },
  neutral: { bg: "bg-slate-100", text: "text-slate-600" },
};

export default function StatCard({ icon, label, value, trend, intent = "neutral", className }: StatCardProps) {
  const scheme = intentMap[intent];

  return (
    <div className={cn(
      "bg-white rounded-2xl border border-slate-200 p-5 shadow-sm",
      "hover:shadow-md transition-shadow",
      className
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className={cn("p-2 rounded-lg", scheme.bg, scheme.text)}>
          {icon}
        </div>
        {trend && (
          <div className={cn(
            "flex items-center gap-0.5 text-xs font-bold",
            trend.value > 0 ? "text-emerald-600" : trend.value < 0 ? "text-red-600" : "text-slate-500"
          )}>
            {trend.value > 0 ? <TrendingUp className="w-3 h-3" /> : trend.value < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
      {trend?.label && <p className="text-xs text-slate-400 mt-1">{trend.label}</p>}
    </div>
  );
}
```

### Kết quả
- ✅ 4 KPI card trên Dashboard dùng `<StatCard />` đồng nhất

---

## 0.12 Component `PageHeader`

### Lý do
- 5 chỗ trong app có pattern Header (title + subtitle + actions): Dashboard, Editor, Meeting, Minutes, Live
- Cần 1 component với variant

### File: `app/components/ui/PageHeader.tsx` (MỚI)
```tsx
import { cn } from "@/app/lib/cn";
import type { ReactNode } from "react";
import Link from "next/link";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  backHref?: string;
  onBack?: () => void;
  actions?: ReactNode;
  variant?: "default" | "compact";
  sticky?: boolean;
  className?: string;
}

export default function PageHeader({
  title, subtitle, icon, backHref, onBack, actions,
  variant = "default", sticky = false, className
}: PageHeaderProps) {
  return (
    <header className={cn(
      "bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between gap-4 shrink-0 z-20",
      variant === "compact" ? "h-14 md:h-16" : "py-3 md:py-4",
      sticky && "sticky top-0",
      className
    )}>
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
        {(backHref || onBack) && (
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors shrink-0"
            aria-label="Quay lại"
          >
            {backHref ? (
              <Link href={backHref}><ArrowLeft className="w-5 h-5" /></Link>
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        )}
        {icon && (
          <div className="p-2 bg-primary-50 text-primary-600 rounded-lg shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className={cn(
            "font-bold text-slate-800 truncate",
            variant === "compact" ? "text-base md:text-lg" : "text-lg md:text-2xl"
          )}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5 truncate hidden sm:block">{subtitle}</p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}
```

### Kết quả
- ✅ 5 chỗ dùng `<PageHeader />` thay vì code riêng

---

## 0.13 Component `Tabs`

### Lý do
- 3 chỗ dùng inline tab buttons (DashboardState, Editor, Minutes/MeetingList)
- Cần component Tabs chuẩn với keyboard navigation

### File: `app/components/ui/Tabs.tsx` (MỚI)
```tsx
"use client";
import { useState, type ReactNode } from "react";
import { cn } from "@/app/lib/cn";

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: "underline" | "pill";
  className?: string;
}

export default function Tabs({ tabs, activeTab, onChange, variant = "underline", className }: TabsProps) {
  return (
    <div role="tablist" className={cn(
      "flex items-center gap-1",
      variant === "underline" && "border-b border-slate-200",
      className
    )}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors",
              variant === "underline" && [
                "border-b-2 -mb-px",
                isActive
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              ],
              variant === "pill" && [
                "rounded-lg",
                isActive
                  ? "bg-primary-600 text-white"
                  : "text-slate-500 hover:bg-slate-100"
              ]
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={cn(
                "px-1.5 py-0.5 text-[10px] rounded-full font-bold",
                isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

### Kết quả
- ✅ Replace inline tab buttons ở 3 chỗ

---

## 0.14 Component `SegmentedControl`

### Lý do
- 2 chỗ dùng toggle button (upload language, live language)
- Cần component đẹp hơn `<select>` cho 2-3 options

### File: `app/components/ui/SegmentedControl.tsx` (MỚI)
```tsx
"use client";
import { cn } from "@/app/lib/cn";

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}

export default function SegmentedControl<T extends string>({
  options, value, onChange, size = "md", className
}: SegmentedControlProps<T>) {
  return (
    <div className={cn(
      "inline-flex bg-slate-100 rounded-lg p-0.5",
      className
    )}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex items-center gap-1.5 font-bold rounded-md transition-all",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              isActive
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
```

### Kết quả
- ✅ Replace 2-3 chỗ dùng `<select>` cho 2 options

---

## 0.15 Component `ProgressBar`

### Lý do
- Upload progress bar đang inline trong `app/(dashboard)/page.tsx:150-169`
- Cần component tái sử dụng

### File: `app/components/ui/ProgressBar.tsx` (MỚI)
```tsx
import { cn } from "@/app/lib/cn";

interface ProgressBarProps {
  value: number;  // 0-100
  variant?: "primary" | "success" | "warning" | "danger";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const variantMap = {
  primary: "bg-primary-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

const sizeMap = {
  sm: "h-1",
  md: "h-2",
  lg: "h-3",
};

export default function ProgressBar({
  value, variant = "primary", size = "md", showLabel = false, className
}: ProgressBarProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
          <span>Tiến trình</span>
          <span>{Math.round(safeValue)}%</span>
        </div>
      )}
      <div className={cn(
        "w-full bg-slate-100 rounded-full overflow-hidden",
        sizeMap[size]
      )}>
        <div
          className={cn("h-full transition-all duration-300 rounded-full", variantMap[variant])}
          style={{ width: `${safeValue}%` }}
          role="progressbar"
          aria-valuenow={safeValue}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
```

### Kết quả
- ✅ Replace inline progress bar ở upload toast

---

## 0.16 Component `Tooltip`

### Lý do
- Một số icon button cần giải thích (lúc đầu dùng `title=""` native → ugly)
- Cần tooltip đẹp

### File: `app/components/ui/Tooltip.tsx` (MỚI)
```tsx
"use client";
import { useState, type ReactNode } from "react";
import { cn } from "@/app/lib/cn";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

const sideMap = {
  top:    "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left:   "right-full top-1/2 -translate-y-1/2 mr-2",
  right:  "left-full top-1/2 -translate-y-1/2 ml-2",
};

export default function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            "absolute z-[var(--z-popover)] px-2 py-1 text-xs font-medium text-white",
            "bg-slate-800 rounded-md whitespace-nowrap pointer-events-none",
            "animate-in fade-in zoom-in-95 duration-150",
            sideMap[side],
            className
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
```

### Kết quả
- ✅ Thay `title="..."` bằng `<Tooltip content="...">`

---

## 0.17 Component `MarkdownContent`

### Lý do
- 3 chỗ dùng raw `dangerouslySetInnerHTML` cho AI summary
- 1 chỗ dùng `prose prose-sm` Tailwind
- Cần 1 component render markdown an toàn + style đẹp

### File: `app/components/ui/MarkdownContent.tsx` (MỚI)
```tsx
"use client";
import ReactMarkdown from "react-markdown";
import { cn } from "@/app/lib/cn";
import type { Components } from "react-markdown";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

const components: Components = {
  h1: ({ children }) => <h1 className="text-xl font-bold text-slate-900 mt-6 mb-3 border-b border-slate-200 pb-1 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-bold text-primary-700 mt-5 mb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-bold text-slate-800 mt-4 mb-2">{children}</h3>,
  p:  ({ children }) => <p className="text-sm text-slate-700 leading-relaxed mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-outside ml-5 mb-3 space-y-1.5 text-sm text-slate-700">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-outside ml-5 mb-3 space-y-1.5 text-sm text-slate-700">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => <code className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-xs font-mono">{children}</code>,
  pre:  ({ children }) => <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto text-xs mb-3">{children}</pre>,
  a:   ({ href, children }) => <a href={href} className="text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
  blockquote: ({ children }) => <blockquote className="border-l-4 border-primary-200 pl-4 italic text-slate-600 my-3">{children}</blockquote>,
};

export default function MarkdownContent({ content, className }: MarkdownContentProps) {
  if (!content) return null;
  return (
    <div className={cn("max-w-none", className)}>
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
}
```

### Kết quả
- ✅ Replace 3 chỗ `dangerouslySetInnerHTML` + 1 chỗ `prose prose-sm`
- ✅ Style đồng nhất toàn app

---

## 0.18 Update components hiện có

### `Button.tsx` (CẬP NHẬT)
```tsx
"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/app/lib/cn";
import Spinner from "./Spinner";

const buttonVariants = cva(
  "font-bold transition flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      intent: {
        primary: "bg-primary-600 hover:bg-primary-700 text-white shadow-sm",
        secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200",
        danger: "bg-red-600 hover:bg-red-700 text-white shadow-sm",
        ghost: "bg-transparent hover:bg-slate-100 text-slate-600",
        success: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
        outline: "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700",
      },
      size: {
        sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
        md: "px-4 py-2.5 text-sm rounded-xl gap-2",
        lg: "px-6 py-3 text-base rounded-xl gap-2.5",
      },
    },
    defaultVariants: { intent: "primary", size: "md" },
  }
);

interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size">,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export default function Button({
  intent, size, loading, disabled, leftIcon, rightIcon,
  className, children, ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(buttonVariants({ intent, size }), className)}
      {...props}
    >
      {loading ? <Spinner size="sm" intent="white" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
```

### `Badge.tsx` (CẬP NHẬT)
```tsx
import { cn } from "@/app/lib/cn";
import { MeetingStatus, MEETING_STATUS, MEETING_STATUS_LABELS } from "@/app/lib/constants";

const statusStyles: Record<MeetingStatus, string> = {
  [MEETING_STATUS.DRAFT]:        "bg-slate-100 text-slate-600 border-slate-200",
  [MEETING_STATUS.TRANSCRIBING]: "bg-blue-50 text-blue-700 border-blue-200",
  [MEETING_STATUS.TRANSCRIBED]:  "bg-primary-50 text-primary-700 border-primary-200",
  [MEETING_STATUS.SUMMARIZING]:  "bg-amber-50 text-amber-700 border-amber-200",
  [MEETING_STATUS.COMPLETED]:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  [MEETING_STATUS.FAILED]:       "bg-red-50 text-red-700 border-red-200",
};

interface BadgeProps { status: MeetingStatus; className?: string; }

export default function Badge({ status, className }: BadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
      statusStyles[status] || statusStyles[MEETING_STATUS.DRAFT],
      className
    )}>
      {MEETING_STATUS_LABELS[status] || status}
    </span>
  );
}
```

### `Card.tsx` (CẬP NHẬT)
```tsx
import { cn } from "@/app/lib/cn";
import { type CardElevation } from "@/app/lib/design-tokens";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
  elevation?: CardElevation;
  hoverable?: boolean;
  as?: keyof JSX.IntrinsicElements;
}

const elevationMap = {
  flat:    "border border-slate-200",
  raised:  "border border-slate-200 shadow-sm",
  overlay: "border border-slate-200 shadow-md",
};

export default function Card({
  children, className, padding = true, elevation = "raised", hoverable = false, as: Tag = "div"
}: CardProps) {
  return (
    <Tag className={cn(
      "bg-white rounded-2xl",
      elevationMap[elevation],
      padding && "p-6",
      hoverable && "transition-shadow hover:shadow-md cursor-pointer",
      className
    )}>
      {children}
    </Tag>
  );
}
```

### `LoadingSkeleton.tsx` (CẬP NHẬT)
- Cập nhật dùng `bg-slate-200` (giữ nguyên)
- Thêm `MeetingDetailSkeleton` cho Meeting Detail page
- (Code không đổi nhiều, chỉ bổ sung variant)

---

## Verify Phase 0

### Checklist
- [ ] `npm install clsx tailwind-merge class-variance-authority` chạy không lỗi
- [ ] Tất cả file mới compile được
- [ ] `npm run build` pass
- [ ] `npm run lint` pass
- [ ] Smoke test:
  - [ ] Vào Dashboard, kiểm tra không vỡ style (vì `globals.css` đã thay đổi)
  - [ ] Mở 1 modal bất kỳ (UploadModal), vẫn hoạt động
  - [ ] Hardcode test: tạo 1 page test dùng `<Button intent="primary" />`, `<Input label="Test" />`, `<Modal isOpen={true}>`, `<EmptyState icon={<Calendar/>} title="Test" />`
- [ ] Không có regression về logic

### Risk
- **`@theme` syntax** có thể khác Tailwind 3. Cần test build ngay.
- **Nếu `bg-primary-600` không work**, fallback về `bg-indigo-600` cho đến khi fix.

### Rollback plan
- Phase 0 là setup, dễ rollback. Nếu vỡ nhiều, revert commit và fix từng phần.

---

## Output Phase 0

Sau Phase 0, codebase có:
- ✅ 1 file `app/lib/cn.ts` mới
- ✅ 1 file `app/lib/design-tokens.ts` mới
- ✅ 1 file `app/globals.css` mở rộng (giữ block driver.js tour)
- ✅ 13 component mới trong `app/components/ui/`: `Spinner`, `Input`, `Select`, `Modal`, `Avatar`, `EmptyState`, `StatCard`, `PageHeader`, `Tabs`, `SegmentedControl`, `ProgressBar`, `Tooltip`, `MarkdownContent`
- ✅ 4 component cũ update: `Button`, `Badge`, `Card`, `LoadingSkeleton`
- ✅ 3 deps mới: `clsx`, `tailwind-merge`, `class-variance-authority`

Sẵn sàng cho Phase 1 (AppShell).
