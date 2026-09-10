# Phase 6 — Auth & Onboarding polish

> **Tham chiếu:** Plan tổng thể ở [`UI-IMPROVEMENT-PLAN.md`](./UI-IMPROVEMENT-PLAN.md) Phần B. File này ghi lại chi tiết implementation Phase 6.
> **Yêu cầu:** Phase 0-5 hoàn thành.

## Tổng quan

| Sub-phase | Nội dung | Trạng thái |
|-----------|----------|-----------|
| **6.1 Redesign `LoginState.tsx`** | Thêm 2-panel desktop layout | ⏳ |
| **6.2 Tạo `LoginFeaturePanel`** | Features/testimonials bên phải (desktop) | ⏳ |
| **6.3 Tạo `LoginSkeleton`** | Loading state cho logo | ⏳ |
| **6.4 Redesign `OnboardingTour.tsx`** | Highlight mạnh hơn | ⏳ |
| **6.5 Tạo `TourFloatingButton`** | Nút "Bỏ qua" floating | ⏳ |
| **6.6 Tạo `TourController` hook** | Quản lý tour state | ⏳ |
| **6.7 Thêm mini-tour Editor, Tasks** | Tour cho các trang khác | ⏳ |
| **6.8 Tạo `ThemeToggle`** | Light/Dark toggle (chuẩn bị cho tương lai) | ⏳ |
| **Verify** | Build + Lint + Test | ⏳ |

**Tổng effort ước tính:** 1 ngày
**Số commits khuyến nghị:** 2-3 commit (Login, Tour, Theme)

---

## 6.1 Redesign `LoginState.tsx`

### Lý do
- Hiện chỉ 1 card giữa màn hình
- Desktop có thể có 2 panel: form trái, features phải
- Cần thêm animation load

### File: `app/components/LoginState.tsx` (CẬP NHẬT)
```tsx
"use client";

import React, { useState, useEffect } from "react";
import { BrainCircuit, NotebookPen, Zap, Sparkles, Mic, FileText, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Spinner from "./ui/Spinner";
import Button from "./ui/Button";

const FEATURES = [
  {
    icon: <Mic className="w-5 h-5" />,
    title: "Ghi âm & phiên âm tự động",
    description: "AI chuyển giọng nói thành văn bản tiếng Việt với độ chính xác cao",
  },
  {
    icon: <Users className="w-5 h-5" />,
    title: "Phân biệt người nói",
    description: "Tự động nhận diện và đặt tên cho từng người trong cuộc họp",
  },
  {
    icon: <Sparkles className="w-5 h-5" />,
    title: "Tóm tắt thông minh",
    description: "AI tạo biên bản tóm tắt với các action items rõ ràng",
  },
  {
    icon: <FileText className="w-5 h-5" />,
    title: "Xuất đa định dạng",
    description: "PDF, DOCX, TXT - chia sẻ dễ dàng với đồng nghiệp",
  },
];

export default function LoginState() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await login();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-slate-50 font-sans selection:bg-primary-100">
      {/* Background decoration */}
      <div className="absolute inset-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary-200 via-slate-50 to-white opacity-70" />
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" />
      <div className="absolute top-1/2 -right-24 w-96 h-96 bg-primary-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000" />

      <div className="relative z-10 w-full max-w-6xl p-4 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* LEFT: Login card */}
        <div className="w-full max-w-md mx-auto lg:mx-0">
          <div className="bg-white/70 backdrop-blur-2xl border border-white/50 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="h-1.5 w-full bg-gradient-to-r from-primary-500 via-purple-500 to-pink-500" />

            <div className="p-8 md:p-10 text-center">
              {/* Logo */}
              {mounted ? (
                <div className="mx-auto w-20 h-20 bg-gradient-to-tr from-primary-600 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/20 mb-8 transform hover:scale-105 transition-transform duration-300">
                  <NotebookPen className="w-10 h-10 text-white" />
                </div>
              ) : (
                <div className="mx-auto w-20 h-20 bg-slate-200 rounded-2xl mb-8 animate-pulse" />
              )}

              <h1 className="text-3xl font-extrabold text-slate-800 mb-2 tracking-tight">
                Smart Meeting Assistant
              </h1>
              <p className="text-slate-500 mb-8 text-sm md:text-base leading-relaxed">
                Biến cuộc họp thành văn bản & tóm tắt thông minh chỉ trong vài giây.
              </p>

              {/* Feature badges */}
              <div className="flex justify-center gap-2 mb-10">
                <span className="flex items-center gap-1.5 px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-bold uppercase tracking-wider">
                  <BrainCircuit className="w-3 h-3" /> AI Powered
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold uppercase tracking-wider">
                  <Zap className="w-3 h-3" /> Fast
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1 bg-violet-50 text-violet-700 rounded-full text-xs font-bold uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" /> Tiếng Việt
                </span>
              </div>

              {/* Login button */}
              <Button
                intent="outline"
                size="lg"
                onClick={handleLogin}
                loading={loading}
                className="w-full !justify-start !pl-6"
              >
                {!loading && (
                  <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                <span className="font-semibold text-slate-700 text-lg flex-1 text-center pr-6">
                  Tiếp tục với Google
                </span>
              </Button>

              <p className="mt-8 text-[10px] text-slate-400">
                Bằng việc tiếp tục, bạn đồng ý với Chính sách bảo mật & Điều khoản dịch vụ.
              </p>
            </div>
          </div>

          <div className="mt-6 text-center text-slate-400 text-xs font-medium">
            © 2025 Smart Meeting Assistant
          </div>
        </div>

        {/* RIGHT: Features (desktop only) */}
        <div className="hidden lg:block">
          <LoginFeaturePanel />
        </div>
      </div>
    </div>
  );
}
```

### Kết quả
- ✅ 2-panel desktop: login trái, features phải
- ✅ Mobile: chỉ hiện login card (centered)
- ✅ Loading state cho logo (mounted check)

---

## 6.2 Tạo `LoginFeaturePanel`

### Lý do
- Bên phải desktop (>= lg) hiện features + testimonials
- Tăng trust, giảm bounce rate

### File: `app/components/LoginFeaturePanel.tsx` (MỚI)
```tsx
"use client";
import { Quote } from "lucide-react";
import type { ReactNode } from "react";

const FEATURES = [
  { icon: "🎙️", title: "Ghi âm & phiên âm", desc: "Chuyển giọng nói thành văn bản tiếng Việt tự động" },
  { icon: "👥", title: "Phân biệt người nói", desc: "AI nhận diện từng người trong cuộc họp" },
  { icon: "✨", title: "Tóm tắt thông minh", desc: "Tạo biên bản + action items chỉ trong vài giây" },
  { icon: "📤", title: "Xuất đa định dạng", desc: "PDF, DOCX, TXT dễ chia sẻ" },
];

export default function LoginFeaturePanel() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-slate-800 mb-2">
          Trợ lý cuộc họp <span className="text-primary-600">thông minh</span>
        </h2>
        <p className="text-slate-600 text-lg">
          Tiết kiệm thời gian, tăng năng suất với AI xử lý cuộc họp tự động.
        </p>
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-2 gap-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="bg-white/60 backdrop-blur-md border border-white/60 rounded-2xl p-4">
            <div className="text-2xl mb-2">{f.icon}</div>
            <h3 className="font-bold text-slate-800 text-sm mb-1">{f.title}</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
```

### Kết quả
- ✅ Features grid 2 cột
- ✅ 2 testimonials
- ✅ Glassmorphism style (backdrop-blur)

---

## 6.3 Tạo `LoginSkeleton`

(Đã tích hợp inline trong 6.1 với `mounted` state)

---

## 6.4 Redesign `OnboardingTour.tsx`

### Lý do
- Hiện highlight mỏng, dễ miss
- Cần highlight mạnh hơn, có nút "Bỏ qua" floating

### File: `app/components/OnboardingTour.tsx` (CẬP NHẬT)
```tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { driver, DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { X } from "lucide-react";

const TOUR_CONFIG: Record<string, { key: string; steps: DriveStep[] }> = {
  "/": {
    key: "hasSeenDashboardTour",
    steps: [
      // ... (giữ nguyên 5 steps cũ)
    ],
  },
  "/minutes": {
    key: "hasSeenMinutesTour",
    steps: [
      // ... (giữ nguyên 8 steps cũ)
    ],
  },
  // NEW: Tour cho Editor
  "/edit": {
    key: "hasSeenEditorTour",
    steps: [
      {
        element: "#editor-header",
        popover: {
          title: "Header",
          description: "Đổi tên cuộc họp, chọn mẫu tóm tắt, lưu thay đổi.",
          side: "bottom", align: "start",
        },
      },
      {
        element: "#editor-transcript",
        popover: {
          title: "Vùng chỉnh sửa",
          description: "Sửa text, thay đổi người nói, tách/gộp câu. Double-click để edit.",
          side: "top", align: "start",
        },
      },
      {
        element: "#editor-speakers",
        popover: {
          title: "Quản lý người nói",
          description: "Đổi tên, thêm/xóa người nói ở đây.",
          side: "right", align: "start",
        },
      },
      {
        element: "#editor-player",
        popover: {
          title: "Audio player",
          description: "Phát audio, tua nhanh, chỉnh tốc độ. Audio sẽ tự động tua theo dòng đang chọn.",
          side: "top", align: "center",
        },
      },
    ],
  },
  // NEW: Tour cho Tasks
  "/tasks": {
    key: "hasSeenTasksTour",
    steps: [
      {
        element: "#tasks-list",
        popover: {
          title: "Danh sách cuộc họp",
          description: "Mỗi cuộc họp có 1 nút 'Trích xuất Task' để AI phân tích action items.",
          side: "top", align: "start",
        },
      },
    ],
  },
};

export default function OnboardingTour() {
  const pathname = usePathname();
  const [showSkipButton, setShowSkipButton] = useState(false);

  useEffect(() => {
    const normalizedPath = pathname.replace(/\/$/, "") || "/";
    const config = TOUR_CONFIG[normalizedPath];
    if (!config) {
      setShowSkipButton(false);
      return;
    }

    const { key, steps } = config;
    const hasSeenTour = localStorage.getItem(key);
    const params = new URLSearchParams(window.location.search);
    const forceTour = params.get("forceTour")?.toLowerCase() === "true";

    if (!hasSeenTour || forceTour) {
      const driverObj = driver({
        showProgress: true,
        animate: true,
        overlayColor: "rgba(15, 23, 42, 0.8)",
        allowClose: true,
        popoverClass: "tour-popover",
        stagePadding: 8,
        stageRadius: 12,
        // HIGHLIGHT MẠNH HƠN
        onHighlightStarted: (element) => {
          element.style.outline = "3px solid #6366f1";
          element.style.outlineOffset = "4px";
          element.style.boxShadow = "0 0 0 6px rgba(99, 102, 241, 0.2)";
        },
        onHighlighted: (element) => {
          // Cleanup nếu cần
        },
        onDeselected: (element) => {
          element.style.outline = "";
          element.style.outlineOffset = "";
          element.style.boxShadow = "";
        },
        doneBtnText: "Hoàn thành",
        nextBtnText: "Tiếp theo",
        prevBtnText: "Quay lại",
        steps,
        onDestroyStarted: (element, step, { driver }) => {
          if (!driver.hasNextStep() || confirm("Bạn có chắc chắn muốn bỏ qua hướng dẫn?")) {
            localStorage.setItem(key, "true");
            driver.destroy();
          }
        },
      });

      setShowSkipButton(true);
      const startTourIfReady = (attempts = 0) => {
        const firstElement = steps[0]?.element;
        const exists = typeof firstElement === "string" ? document.querySelector(firstElement) : null;
        if (exists) {
          driverObj.drive();
        } else if (attempts < 10) {
          setTimeout(() => startTourIfReady(attempts + 1), 500);
        }
      };
      const timer = setTimeout(() => startTourIfReady(), 500);
      return () => {
        clearTimeout(timer);
        driverObj.destroy();
        setShowSkipButton(false);
      };
    }
  }, [pathname]);

  return showSkipButton ? <TourFloatingButton /> : null;
}
```

### Kết quả
- ✅ Highlight mạnh hơn (3px outline + offset + shadow)
- ✅ Thêm tour cho Editor, Tasks
- ✅ Skip button floating

---

## 6.5 Tạo `TourFloatingButton`

### Lý do
- Nút "Bỏ qua" floating luôn hiển thị trong lúc tour
- ESC / click outside cũng bỏ qua

### File: `app/components/TourFloatingButton.tsx` (MỚI)
```tsx
"use client";
import { X, HelpCircle } from "lucide-react";

export default function TourFloatingButton() {
  const handleSkip = () => {
    const event = new KeyboardEvent("keydown", { key: "Escape" });
    document.dispatchEvent(event);
  };

  return (
    <button
      onClick={handleSkip}
      className="fixed bottom-4 right-4 z-[10000] bg-slate-900/90 backdrop-blur text-white px-3 py-2 rounded-full shadow-lg text-xs font-medium flex items-center gap-1.5 hover:bg-slate-800 transition-colors"
      aria-label="Bỏ qua hướng dẫn"
    >
      <X className="w-3.5 h-3.5" />
      Bỏ qua tour
    </button>
  );
}
```

### Kết quả
- ✅ Nút skip floating
- ✅ Aria-label cho a11y

---

## 6.6 Tạo `TourController` hook

### Lý do
- Tách logic tour ra hook riêng
- Có thể gọi `startTour("dashboard")` từ bất kỳ đâu

### File: `app/hooks/useTour.ts` (MỚI)
```ts
"use client";
import { useCallback } from "react";
import { usePathname } from "next/navigation";

export function useTour() {
  const pathname = usePathname();

  const startTour = useCallback((pageKey?: string) => {
    if (typeof window === "undefined") return;
    // Remove existing tour key
    const key = pageKey || getTourKey(pathname);
    if (key) {
      localStorage.removeItem(key);
      // Reload to trigger OnboardingTour
      window.location.reload();
    }
  }, [pathname]);

  const resetAllTours = useCallback(() => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("hasSeen")) localStorage.removeItem(k);
    });
    window.location.reload();
  }, []);

  return { startTour, resetAllTours };
}

function getTourKey(pathname: string): string | null {
  if (pathname === "/") return "hasSeenDashboardTour";
  if (pathname.startsWith("/minutes")) return "hasSeenMinutesTour";
  if (pathname.startsWith("/edit")) return "hasSeenEditorTour";
  if (pathname.startsWith("/tasks")) return "hasSeenTasksTour";
  return null;
}
```

### Kết quả
- ✅ Có thể gọi "Xem lại tour" từ settings

---

## 6.7 Thêm mini-tour Editor, Tasks

### Lý do
- Editor và Tasks là 2 trang quan trọng chưa có tour

### IDs cần thêm vào các page tương ứng
- `app/components/EditorState.tsx`:
  - `id="editor-header"` trên `<EditorHeader>`
  - `id="editor-transcript"` trên `<SegmentList>`
  - `id="editor-speakers"` trên `<SpeakerSidebar>`
  - `id="editor-player"` trên `<EditorAudioPlayer>`
- `app/tasks/page.tsx`:
  - `id="tasks-list"` trên `<TaskList>`

### Code
Trong `OnboardingTour.tsx`, thêm 2 entry vào `TOUR_CONFIG` (đã có ở 6.4)

### Kết quả
- ✅ Tour Editor: 4 steps
- ✅ Tour Tasks: 1 step

---

## 6.8 Tạo `ThemeToggle` (chuẩn bị cho dark mode tương lai)

### Lý do
- Phase 0 đã chuẩn bị CSS variables cho dark mode
- Có toggle ngay để user quen, dù chưa enable dark mode

### File: `app/components/ThemeToggle.tsx` (MỚI)
```tsx
"use client";
import { Sun, Moon, Monitor } from "lucide-react";
import { useState, useEffect } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "app-theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored) setTheme(stored);
  }, []);

  const cycle = () => {
    const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    // NOTE: Dark mode chưa được implement đầy đủ (Phase 0 đã chuẩn bị tokens)
    // Hiện tại chỉ lưu preference
    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  };

  return (
    <button
      onClick={cycle}
      className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
      aria-label={`Theme: ${theme}`}
      title={`Theme: ${theme}`}
    >
      {theme === "light" && <Sun className="w-5 h-5" />}
      {theme === "dark" && <Moon className="w-5 h-5" />}
      {theme === "system" && <Monitor className="w-5 h-5" />}
    </button>
  );
}
```

### Tích hợp vào Topbar
File: `app/components/Topbar.tsx` (CẬP NHẬT)
- Thêm `<ThemeToggle />` cạnh nút search

### Kết quả
- ✅ Theme toggle hoạt động (lưu preference)
- ✅ Sẵn sàng cho dark mode khi cần

---

## Verify Phase 6

### Checklist
- [ ] Vào `/login` → desktop hiện 2 panel (login trái, features phải)
- [ ] Mobile: chỉ hiện login card (centered)
- [ ] Logo có animation load (skeleton → logo)
- [ ] Click "Tiếp tục với Google" → loading state
- [ ] Login thành công → redirect `/`
- [ ] Lần đầu vào `/` → tour tự động mở
- [ ] Highlight mạnh (3px outline + shadow)
- [ ] Nút "Bỏ qua tour" floating ở góc dưới phải
- [ ] Tour Dashboard: 5 steps
- [ ] Tour Minutes: 8 steps
- [ ] Tour Editor: 4 steps (nếu đã thêm IDs)
- [ ] Tour Tasks: 1 step
- [ ] Refresh lại trang → không hiện tour nữa (đã lưu localStorage)
- [ ] `?forceTour=true` → reset và hiện lại
- [ ] Theme toggle trên topbar → cycle light → dark → system
- [ ] `npm run build` pass
- [ ] `npm run lint` pass

### Lưu ý
- **Driver.js highlight style** có thể conflict với Tailwind. Cần test kỹ.
- Nếu vỡ, fallback: dùng `stagePadding` + `stageRadius` của driver.js thay vì custom CSS

### Rollback
- Revert Phase 6, restore `LoginState.tsx` và `OnboardingTour.tsx` cũ
- Phase 0-5 vẫn giữ

---

## Output Phase 6

Sau Phase 6:
- ✅ Login 2-panel desktop
- ✅ Tour mạnh hơn, có nút skip
- ✅ 4 tour (Dashboard, Minutes, Editor, Tasks)
- ✅ Theme toggle (chuẩn bị dark mode)
- ✅ 5 file mới/cập nhật: `LoginState`, `LoginFeaturePanel`, `OnboardingTour`, `TourFloatingButton`, `useTour`, `ThemeToggle`

Sẵn sàng cho Phase 7 (Micro-interactions & Polish).
