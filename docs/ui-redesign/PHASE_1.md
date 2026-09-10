# Phase 1 — AppShell + Topbar + Sidebar

> **Tham chiếu:** Plan tổng thể ở [`UI-IMPROVEMENT-PLAN.md`](./UI-IMPROVEMENT-PLAN.md) Phần B. File này ghi lại chi tiết implementation Phase 1.
> **Yêu cầu:** Phase 0 phải hoàn thành (đã có `cn.ts`, `design-tokens.ts`, `PageHeader`, `Avatar`, `Button`, `Modal`).

## Tổng quan

| Sub-phase | Nội dung | Trạng thái |
|-----------|----------|-----------|
| **1.1 Tạo `SidebarNavItem`** | Nav item component | ⏳ |
| **1.2 Tạo `Sidebar.tsx`** (mới, thay dead code) | Light sidebar | ⏳ |
| **1.3 Tạo `Topbar.tsx`** | Breadcrumb + user menu | ⏳ |
| **1.4 Tạo `MobileDrawer.tsx`** | Drawer cho mobile | ⏳ |
| **1.5 Tạo `AppShell.tsx`** | Wrapper toàn layout | ⏳ |
| **1.6 Refactor `(dashboard)/layout.tsx`** | Dùng AppShell | ⏳ |
| **1.7 Xóa `Dashboard/Sidebar.tsx`** (dead code) | Cleanup | ⏳ |
| **1.8 Xóa inline tabs trong `DashboardState.tsx`** | Tích hợp với route query | ⏳ |
| **1.9 Cập nhật `useRouter`/`usePathname`** | Đảm bảo active state | ⏳ |
| **Verify** | Build + Lint + Test | ⏳ |

**Tổng effort ước tính:** 2 ngày
**Số commits khuyến nghị:** 1-2 commit (1 cho AppShell, 1 cho cleanup)

---

## 1.1 Tạo `SidebarNavItem`

### Lý do
- 5 nav items lặp pattern: icon + label, active state, hover state
- Component con để `Sidebar.tsx` sạch hơn

### File: `app/components/SidebarNavItem.tsx` (MỚI)
```tsx
"use client";
import Link from "next/link";
import { cn } from "@/app/lib/cn";
import type { ReactNode } from "react";

interface SidebarNavItemProps {
  href: string;
  icon: ReactNode;
  label: string;
  badge?: string | number;
  isActive?: boolean;
  isExternal?: boolean;
  onClick?: () => void;
}

export default function SidebarNavItem({
  href, icon, label, badge, isActive, isExternal, onClick
}: SidebarNavItemProps) {
  const className = cn(
    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
    "transition-all duration-150 group",
    isActive
      ? "bg-primary-50 text-primary-700"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  );

  const content = (
    <>
      <span className={cn(
        "shrink-0",
        isActive ? "text-primary-600" : "text-slate-400 group-hover:text-slate-600"
      )}>
        {icon}
      </span>
      <span className="truncate flex-1">{label}</span>
      {badge !== undefined && (
        <span className={cn(
          "px-1.5 py-0.5 text-[10px] rounded-full font-bold shrink-0",
          isActive ? "bg-primary-200 text-primary-800" : "bg-slate-200 text-slate-600"
        )}>
          {badge}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className={cn(className, "w-full text-left")}>
        {content}
      </button>
    );
  }

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
```

### Kết quả
- ✅ Nav items đồng nhất, dễ style chung
- ✅ Hỗ trợ cả Link, button, external link

---

## 1.2 Tạo `Sidebar.tsx` (mới — thay dead code)

### Lý do
- Dead code `Dashboard/Sidebar.tsx` cần xóa
- Cần 1 Sidebar chuẩn: light, active state đẹp, group nav, footer user

### File: `app/components/Sidebar.tsx` (MỚI — không nằm trong Dashboard/)
```tsx
"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, FileText, ClipboardList, Users, Database, LogOut,
  ChevronsLeft, ChevronsRight, NotebookPen
} from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { useGlobalUI } from "@/app/context/GlobalUIProvider";
import { cn } from "@/app/lib/cn";
import SidebarNavItem from "./SidebarNavItem";
import Avatar from "./ui/Avatar";
import Tooltip from "./ui/Tooltip";

const STORAGE_KEY = "sidebar-collapsed";

const NAV_ITEMS = [
  {
    group: "Quản lý",
    items: [
      { href: "/", icon: <Home className="w-4 h-4" />, label: "Dashboard" },
      { href: "/minutes", icon: <FileText className="w-4 h-4" />, label: "Biên bản họp" },
      { href: "/tasks", icon: <ClipboardList className="w-4 h-4" />, label: "Quản lý Task" },
    ],
  },
  {
    group: "Hệ thống",
    items: [
      { href: "/team", icon: <Users className="w-4 h-4" />, label: "Nhân sự" },
      { href: "/training", icon: <Database className="w-4 h-4" />, label: "Dữ liệu huấn luyện" },
    ],
  },
];

const isActive = (pathname: string, href: string) => {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
};

interface SidebarProps {
  onNavigate?: () => void;  // for mobile drawer close
  forceOpen?: boolean;
}

export default function Sidebar({ onNavigate, forceOpen = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { toast } = useGlobalUI();
  const [collapsed, setCollapsed] = useState(false);

  // Load collapsed state
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/login");
    } catch (e) {
      toast.error("Lỗi khi đăng xuất");
    }
  };

  return (
    <aside className={cn(
      "bg-white border-r border-slate-200 flex flex-col shrink-0",
      "transition-all duration-200",
      // Desktop: width based on collapsed
      forceOpen ? "w-64" : collapsed ? "w-16" : "w-64",
      "hidden md:flex"  // hide on mobile, drawer handles
    )}>
      {/* Logo */}
      <div className="h-16 flex items-center gap-2 px-4 border-b border-slate-200 shrink-0">
        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shadow-sm shrink-0">
          <NotebookPen className="w-5 h-5 text-white" />
        </div>
        {(!collapsed || forceOpen) && (
          <span className="font-bold text-slate-800 tracking-tight truncate">Smart Meeting</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-6">
        {NAV_ITEMS.map((group) => (
          <div key={group.group}>
            {(!collapsed || forceOpen) && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
                {group.group}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const link = (
                  <SidebarNavItem
                    {...item}
                    isActive={active}
                    onClick={onNavigate}
                  />
                );
                // Wrap with Tooltip when collapsed
                if (collapsed && !forceOpen) {
                  return (
                    <Tooltip key={item.href} content={item.label} side="right">
                      {link}
                    </Tooltip>
                  );
                }
                return <div key={item.href}>{link}</div>;
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: User + Logout + Collapse toggle */}
      <div className="border-t border-slate-200 p-3 space-y-2">
        {/* User info */}
        {user && (
          <div className={cn(
            "flex items-center gap-2 p-2 rounded-lg",
            collapsed && !forceOpen ? "justify-center" : ""
          )}>
            <Avatar
              name={user.displayName || user.email || "U"}
              size="sm"
              colorScheme={{ bg: "bg-primary-100", text: "text-primary-700" }}
            />
            {(!collapsed || forceOpen) && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 truncate">
                  {user.displayName || "User"}
                </p>
                <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
              </div>
            )}
          </div>
        )}

        {/* Logout */}
        {collapsed && !forceOpen ? (
          <Tooltip content="Đăng xuất" side="right">
            <button
              onClick={handleLogout}
              className="w-full p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </Tooltip>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất</span>
          </button>
        )}

        {/* Collapse toggle (desktop only) */}
        {!forceOpen && (
          <button
            onClick={toggleCollapsed}
            className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition-colors"
            aria-label={collapsed ? "Mở rộng" : "Thu gọn"}
          >
            {collapsed ? <ChevronsRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
            {!collapsed && <span>Thu gọn</span>}
          </button>
        )}

        {/* Copyright */}
        {(!collapsed || forceOpen) && (
          <p className="text-[10px] text-slate-400 text-center pt-2">© 2025 Smart Meeting</p>
        )}
      </div>
    </aside>
  );
}
```

### Kết quả
- ✅ Sidebar light, có 2 group nav (Quản lý / Hệ thống)
- ✅ Collapsed/expanded state lưu `localStorage`
- ✅ User info + logout + collapse toggle
- ✅ Tooltip khi collapsed

---

## 1.3 Tạo `Topbar.tsx`

### Lý do
- Hiện không có topbar, mỗi page tự code header
- Cần breadcrumb tự động + user actions

### File: `app/components/Topbar.tsx` (MỚI)
```tsx
"use client";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Bell, Search, ChevronRight, Menu, LogOut, Settings, User
} from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { cn } from "@/app/lib/cn";
import Avatar from "./ui/Avatar";

// Map route → label cho breadcrumb
const ROUTE_LABELS: Record<string, string> = {
  "": "Dashboard",
  "minutes": "Biên bản họp",
  "tasks": "Quản lý Task",
  "team": "Nhân sự",
  "training": "Dữ liệu huấn luyện",
  "edit": "Sửa",
  "meeting": "Chi tiết",
  "live": "Ghi âm trực tiếp",
  "share": "Chia sẻ",
};

function buildBreadcrumb(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const items: Array<{ label: string; href: string }> = [];
  let href = "";
  segments.forEach((seg, i) => {
    href += `/${seg}`;
    // Last segment là dynamic id → hiển thị label gốc
    const label = ROUTE_LABELS[seg] || (i === segments.length - 1 && seg.length > 8 ? "..." : seg);
    items.push({ label, href });
  });
  return items;
}

interface TopbarProps {
  onOpenMobileMenu: () => void;
}

export default function Topbar({ onOpenMobileMenu }: TopbarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const breadcrumb = buildBreadcrumb(pathname);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showUserMenu]);

  return (
    <header className="h-14 md:h-16 bg-white border-b border-slate-200 flex items-center justify-between gap-3 px-4 md:px-6 shrink-0 z-30">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Mobile menu button */}
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-500"
          aria-label="Mở menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm text-slate-500 min-w-0">
          <Link href="/" className="hover:text-slate-700 shrink-0">
            <Home className="w-4 h-4" />
          </Link>
          {breadcrumb.map((item, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <span key={item.href} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                {isLast ? (
                  <span className="text-slate-800 font-semibold truncate max-w-[200px]">
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className="hover:text-slate-700 truncate max-w-[200px]"
                  >
                    {item.label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Search button (Cmd+K placeholder) */}
        <button
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors hidden sm:flex"
          aria-label="Tìm kiếm"
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Notifications */}
        <button
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors relative"
          aria-label="Thông báo"
        >
          <Bell className="w-5 h-5" />
          {/* Badge dot - hidden by default */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full hidden" />
        </button>

        {/* User menu */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Avatar
              name={user?.displayName || user?.email || "U"}
              size="sm"
              colorScheme={{ bg: "bg-primary-100", text: "text-primary-700" }}
            />
            <span className="text-sm font-medium text-slate-700 hidden md:inline truncate max-w-[120px]">
              {user?.displayName || user?.email?.split("@")[0] || "User"}
            </span>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-800 truncate">
                  {user?.displayName || "User"}
                </p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                <User className="w-4 h-4" /> Hồ sơ
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                <Settings className="w-4 h-4" /> Cài đặt
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
```

### Kết quả
- ✅ Breadcrumb tự động từ route
- ✅ Search bell (placeholder, sẽ wire Cmd+K ở Phase 7)
- ✅ User menu với logout
- ✅ Mobile menu button

---

## 1.4 Tạo `MobileDrawer.tsx`

### Lý do
- Mobile cần drawer để mở sidebar
- Dùng portal + animation

### File: `app/components/MobileDrawer.tsx` (MỚI)
```tsx
"use client";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/app/lib/cn";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  side?: "left" | "right";
  title?: string;
}

export default function MobileDrawer({ isOpen, onClose, children, side = "left", title }: MobileDrawerProps) {
  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[var(--z-modal)] md:hidden",
          "transition-opacity",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 bottom-0 z-[var(--z-modal)] md:hidden",
          "transition-transform duration-300",
          side === "left" ? "left-0" : "right-0",
          isActive ? (side === "left" ? "translate-x-0" : "translate-x-0") : (side === "left" ? "-translate-x-full" : "translate-x-full")
        )}
        // NOTE: simplified logic below
        style={{ transform: isOpen ? "translateX(0)" : (side === "left" ? "translateX(-100%)" : "translateX(100%)") }}
      >
        <div className="h-full bg-white shadow-2xl flex flex-col">
          {title && (
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
              <span className="font-bold text-slate-800">{title}</span>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </>
  );
}
```

### Kết quả
- ✅ Drawer mượt cho mobile
- ✅ ESC + backdrop close

---

## 1.5 Tạo `AppShell.tsx`

### Lý do
- Wrapper layout thống nhất: Sidebar (desktop) + Topbar + Main + Mobile Drawer
- Auth + Polling logic tập trung

### File: `app/components/AppShell.tsx` (MỚI)
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Spinner from "./ui/Spinner";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileDrawer from "./MobileDrawer";
import { useAuth } from "@/app/context/AuthContext";
import PollingManager from "./PollingManager";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Drawer */}
      <MobileDrawer isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} title="Menu">
        <Sidebar forceOpen onNavigate={() => setMobileMenuOpen(false)} />
      </MobileDrawer>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        <PollingManager onUpdate={() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dashboard-refresh'));
          }
        }} />

        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
      </div>
    </div>
  );
}
```

### Kết quả
- ✅ Layout thống nhất
- ✅ Auth check tập trung
- ✅ Polling tập trung
- ✅ Mobile responsive (drawer)

---

## 1.6 Refactor `(dashboard)/layout.tsx`

### Lý do
- Hiện hardcode sidebar + PollingManager
- Chuyển sang dùng AppShell

### File: `app/(dashboard)/layout.tsx` (CẬP NHẬT — đơn giản hóa)
```tsx
import AppShell from "../components/AppShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

### Kết quả
- ✅ File gọn từ 99 dòng → 5 dòng
- ✅ Tất cả logic chuyển vào AppShell

---

## 1.7 Xóa dead code

### File cần xóa
```bash
rm app/components/Dashboard/Sidebar.tsx
```

### Lý do
- Đã tạo `app/components/Sidebar.tsx` mới (1.2)
- File cũ không được import ở đâu

---

## 1.8 Xóa inline tabs trong `DashboardState.tsx`

### Lý do
- Hiện `DashboardState.tsx:310-331` có 2 button inline (Tất cả / Thùng rác)
- Phase 1 chuyển logic này về Sidebar (sẽ làm ở Phase 2)
- Trước mắt, ẩn tab inline để tránh duplicate

### File: `app/components/DashboardState.tsx` (CẬP NHẬT)
Tạm thời **comment out** block 310-331, để Sidebar xử lý tab "Thùng rác" sau:

```tsx
// PHASE 1: Inline tabs tạm thời bị ẩn, Sidebar sẽ handle ở Phase 2
// <div className="flex items-center gap-4 px-4 md:px-8 py-3 bg-white border-b shrink-0">
//   <button onClick={() => handleTabChange("all")} ...>Tất cả cuộc họp</button>
//   <button onClick={() => handleTabChange("trash")} ...>Thùng rác</button>
// </div>
```

Hoặc tốt hơn: refactor `currentTab` thành `searchParams.tab`:
```tsx
import { useSearchParams, useRouter } from "next/navigation";

const searchParams = useSearchParams();
const router = useRouter();
const currentTab = (searchParams.get("tab") === "trash" ? "trash" : "all") as "all" | "trash";

const handleTabChange = (tab: "all" | "trash") => {
  const params = new URLSearchParams(searchParams);
  if (tab === "all") params.delete("tab");
  else params.set("tab", "trash");
  router.push(`?${params.toString()}`);
};
```

### Kết quả
- ✅ Tab state lưu URL → shareable, browser back hoạt động đúng
- ✅ Sidebar có thể link tới `/?tab=trash`

---

## 1.9 Cập nhật `Sidebar.tsx` thêm nút "Thùng rác" (nếu dùng query param)

### Lý do
- Sau 1.8, currentTab dựa vào `?tab=trash`
- Sidebar cần item "Thùng rác" link tới `/?tab=trash`

### File: `app/components/Sidebar.tsx` (CẬP NHẬT)
Thêm vào group "Quản lý":
```tsx
{ href: "/?tab=trash", icon: <Trash2 className="w-4 h-4" />, label: "Thùng rác" },
```

Và update `isActive`:
```tsx
const isActive = (pathname: string, href: string) => {
  if (href === "/") return pathname === "/" && !new URLSearchParams(...).get("tab");
  if (href.startsWith("/?tab=")) {
    const tab = href.split("=")[1];
    return pathname === "/" && new URLSearchParams(window.location.search).get("tab") === tab;
  }
  return pathname.startsWith(href);
};
```

### Kết quả
- ✅ Sidebar có item "Thùng rác" → click → `/?tab=trash` → Dashboard filter
- ✅ Đồng bộ với URL state

---

## Verify Phase 1

### Checklist
- [ ] Sidebar mới hiển thị đúng, light style, có 2 group nav
- [ ] Topbar có breadcrumb tự động, user menu hoạt động
- [ ] Mobile: mở drawer → sidebar hiện, click item → đóng drawer + navigate
- [ ] Click "Thu gọn" → sidebar thu lại còn 16 (chỉ icon), tooltip hiện khi hover
- [ ] Refresh trang: collapsed state được nhớ (localStorage)
- [ ] Click "Thùng rác" trên sidebar → URL có `?tab=trash`, dashboard filter đúng
- [ ] Browser back/forward giữa `/?tab=all` ↔ `/?tab=trash` hoạt động
- [ ] File `app/components/Dashboard/Sidebar.tsx` đã xóa
- [ ] File `app/(dashboard)/layout.tsx` chỉ còn 5 dòng
- [ ] `npm run build` pass
- [ ] `npm run lint` pass
- [ ] 5 flow chính vẫn hoạt động:
  1. Login → Dashboard (sidebar hiện)
  2. Click "Biên bản họp" → /minutes
  3. Click "Nhân sự" → /team
  4. Click "Thùng rác" → /?tab=trash (filter trash)
  5. Mobile (375px): mở menu → navigate → đóng

### Risk
- **Sidebar collapsible có thể bị flash** lúc đầu (chưa load localStorage). Mitigation: dùng cookie hoặc server-side state (out of scope Phase 1)
- **Mobile drawer animation** có thể giật trên iOS Safari cũ. Mitigation: test trên thiết bị thật

### Rollback
- Revert commit Phase 1, restore `app/(dashboard)/layout.tsx` về 99 dòng
- Phase 0 (components) vẫn giữ → an toàn

---

## Output Phase 1

Sau Phase 1, codebase có:
- ✅ 5 file mới:
  - `app/components/Sidebar.tsx` (light, có collapse)
  - `app/components/SidebarNavItem.tsx`
  - `app/components/Topbar.tsx` (breadcrumb + user menu)
  - `app/components/MobileDrawer.tsx`
  - `app/components/AppShell.tsx` (wrapper tổng)
- ✅ 2 file cập nhật:
  - `app/(dashboard)/layout.tsx` (99 → 5 dòng)
  - `app/components/DashboardState.tsx` (currentTab dùng URL search param)
- ✅ 1 file xóa:
  - `app/components/Dashboard/Sidebar.tsx` (dead code)
- ✅ Sidebar light, topbar chuẩn, mobile drawer mượt

Sẵn sàng cho Phase 2 (Dashboard Redesign).
