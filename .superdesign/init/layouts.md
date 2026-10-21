# Layouts
## app/layout.tsx

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono,Inter } from "next/font/google";
import "./globals.css";
import GlobalUIProvider from "./context/GlobalUIProvider";
import { AuthProvider } from "./context/AuthContext";

const inter = Inter({ 
  subsets: ["latin", "vietnamese"],
  variable: '--font-inter'
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Meeting Notes",
  description: "Ghi biên bản và tóm tắt cuộc họp",
};

import OnboardingTour from "./components/OnboardingTour";
import ToastProvider from "./components/ToastProvider";
import ExtensionBridge from "./components/ExtensionBridge";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body
        suppressHydrationWarning={true}
        className={`${inter.variable} font-sans`}
      >
          <AuthProvider>
            <GlobalUIProvider>
             <OnboardingTour />
             <ToastProvider />
             <ExtensionBridge />
             {children}
          </GlobalUIProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

```
## app/(dashboard)/layout.tsx

```tsx
import AppShell from "../components/AppShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}

```
## app/components/AppShell.tsx

```tsx
"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Menu } from "lucide-react";
import Spinner from "./ui/Spinner";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileDrawer from "./MobileDrawer";
import { useAuth } from "@/app/context/AuthContext";
import PollingManager from "./PollingManager";
import CommandPalette from "./CommandPalette";

export default function AppShell({ children, hideTopbar: hideTopbarProp = false }: { children: React.ReactNode; hideTopbar?: boolean }) {
  const pathname = usePathname();
  // Auto-hide topbar for live recording (full-screen experience)
  const hideTopbar = hideTopbarProp || pathname.startsWith("/live");
  const { user, loading } = useAuth();
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
        {!hideTopbar && <Topbar onOpenMobileMenu={() => setMobileMenuOpen(true)} />}

        {/* Floating hamburger on mobile when topbar is hidden (but not for live recording) */}
        {hideTopbar && !pathname.startsWith("/live") && (
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden fixed top-3 left-3 z-50 p-2 bg-white border border-slate-200 rounded-lg shadow-md text-slate-600 hover:bg-slate-50"
            aria-label="Mở menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <PollingManager onUpdate={() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("dashboard-refresh"));
          }
        }} />

        <CommandPalette />
        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
      </div>
    </div>
  );
}

```
## app/components/Sidebar.tsx

```tsx
"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Home, FileText, ClipboardList, Users, Database, LogOut,
  ChevronsLeft, ChevronsRight, Trash2
} from "lucide-react";
import BrandIcon from "./BrandIcon";
import { useAuth } from "@/app/context/AuthContext";
import { useGlobalUI } from "@/app/context/GlobalUIProvider";
import { cn } from "@/app/lib/cn";
import SidebarNavItem from "./SidebarNavItem";
import Avatar from "./ui/Avatar";
import Tooltip from "./ui/Tooltip";

const STORAGE_KEY = "sidebar-collapsed-session";

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

function isActive(
  pathname: string,
  searchParam: string | null,
  href: string
): boolean {
  // Handle tab query param for trash
  if (href.startsWith("/?tab=")) {
    const tab = href.split("=")[1];
    return pathname === "/" && searchParam === tab;
  }
  // Dashboard is only active if no tab param
  if (href === "/") return pathname === "/" && searchParam === null;
  return pathname.startsWith(href);
}

interface SidebarProps {
  onNavigate?: () => void;
  forceOpen?: boolean;
}

export default function Sidebar({ onNavigate, forceOpen = false }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { toast } = useGlobalUI();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(STORAGE_KEY) === "true";
  });

  const currentTab = searchParams.get("tab");

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      sessionStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/login");
    } catch {
      toast.error("Lỗi khi đăng xuất");
    }
  };

  const allNavItems = [
    ...NAV_ITEMS,
    {
      group: "Khác",
      items: [
        { href: "/?tab=trash", icon: <Trash2 className="w-4 h-4" />, label: "Thùng rác" },
      ],
    },
  ];

  return (
    <aside className={cn(
      "bg-white flex flex-col shrink-0 overflow-hidden",
      forceOpen ? "" : "border-r border-slate-200",
      "transition-all duration-200",
      forceOpen || !collapsed ? "w-64" : "w-16",
      forceOpen ? "flex" : "hidden md:flex"
    )}>
      {/* Logo */}
      <div className="h-16 flex items-center gap-2 px-4 border-b border-slate-200 shrink-0">
        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shadow-sm shrink-0">
          <BrandIcon className="w-5 h-5 text-white" />
        </div>
        {(forceOpen || !collapsed) && (
          <span className="font-bold text-slate-800 tracking-tight truncate">Smart Meeting</span>
        )}
      </div>

      {/* Nav */}
      <nav className={cn(
        "flex-1 overflow-y-auto overflow-x-hidden space-y-6",
        collapsed && !forceOpen ? "p-1" : "p-3"
      )}>
        {allNavItems.map((group) => (
          <div key={group.group}>
            {(forceOpen || !collapsed) && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
                {group.group}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(pathname, currentTab, item.href);
                const handleClick = onNavigate
                  ? () => { onNavigate(); }
                  : undefined;
                const link = (
                  <SidebarNavItem
                    {...item}
                    isActive={active}
                    collapsed={collapsed && !forceOpen}
                    onClick={handleClick}
                  />
                );
                if (collapsed && !forceOpen) {
                  return (
                    <div key={item.href}>
                      <Tooltip content={item.label} side="right">
                        {link}
                      </Tooltip>
                    </div>
                  );
                }
                return <div key={item.href}>{link}</div>;
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn(
        "border-t border-slate-200 space-y-2",
        collapsed && !forceOpen ? "p-1" : "p-3"
      )}>
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
            {(forceOpen || !collapsed) && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 truncate">
                  {user.displayName || "User"}
                </p>
                <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
              </div>
            )}
          </div>
        )}

        {collapsed && !forceOpen ? (
          <div>
            <Tooltip content="Đăng xuất" side="right">
              <button onClick={handleLogout} className="w-full p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center">
                <LogOut className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất</span>
          </button>
        )}

        {!forceOpen && (
          <button onClick={toggleCollapsed} className={cn(
            "flex items-center justify-center transition-colors rounded",
            collapsed
              ? "w-full py-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              : "w-full gap-1 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-600 hover:bg-slate-50"
          )} aria-label={collapsed ? "Mở rộng" : "Thu gọn"}>
            {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
            {!collapsed && <span>Thu gọn</span>}
          </button>
        )}

        {(forceOpen || !collapsed) && (
          <p className="text-[10px] text-slate-400 text-center pt-2">© 2025 Smart Meeting</p>
        )}
      </div>
    </aside>
  );
}

```
## app/components/SidebarNavItem.tsx

```tsx
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/app/lib/cn";
import type { ReactNode } from "react";

interface SidebarNavItemProps {
  href: string;
  icon: ReactNode;
  label: string;
  badge?: string | number;
  isActive?: boolean;
  isExternal?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}

export default function SidebarNavItem({
  href, icon, label, badge, isActive, isExternal, collapsed, onClick
}: SidebarNavItemProps) {
  const router = useRouter();

  const className = cn(
    "flex items-center rounded-lg text-sm font-medium",
    "transition-all duration-150 group",
    collapsed
      ? "justify-center px-0 py-2.5 w-full"
      : "gap-3 px-3 py-2.5",
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
      {!collapsed && (
        <span className="truncate flex-1">{label}</span>
      )}
      {!collapsed && badge !== undefined && (
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
      <button
        onClick={() => {
          if (!isExternal) router.push(href);
          onClick();
        }}
        className={cn(className, "w-full text-left", collapsed && "flex justify-center")}
      >
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
## app/components/Topbar.tsx

```tsx
"use client";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Bell, Search, ChevronRight, Menu, LogOut, Settings, User, Home
} from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { cn } from "@/app/lib/cn";
import Avatar from "./ui/Avatar";

const ROUTE_LABELS: Record<string, string> = {
  "": "Dashboard",
  minutes: "Biên bản họp",
  tasks: "Quản lý Task",
  team: "Nhân sự",
  training: "Dữ liệu huấn luyện",
  edit: "Sửa",
  meeting: "Chi tiết",
  live: "Ghi âm trực tiếp",
  share: "Chia sẻ",
};

function buildBreadcrumb(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const items: Array<{ label: string; href: string }> = [];
  let href = "";
  for (const seg of segments) {
    href += `/${seg}`;
    const label = ROUTE_LABELS[seg] || (seg.length > 8 ? "..." : seg);
    items.push({ label, href });
  }
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
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-500"
          aria-label="Mở menu"
        >
          <Menu className="w-5 h-5" />
        </button>

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
                  <Link href={item.href} className="hover:text-slate-700 truncate max-w-[200px]">
                    {item.label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors hidden sm:flex" aria-label="Tìm kiếm">
          <Search className="w-5 h-5" />
        </button>

        <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors relative" aria-label="Thông báo">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full hidden" />
        </button>

        <div ref={userMenuRef} className="relative">
          <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <Avatar name={user?.displayName || user?.email || "U"} size="sm" colorScheme={{ bg: "bg-primary-100", text: "text-primary-700" }} />
            <span className="text-sm font-medium text-slate-700 hidden md:inline truncate max-w-[120px]">
              {user?.displayName || user?.email?.split("@")[0] || "User"}
            </span>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-800 truncate">{user?.displayName || "User"}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                <User className="w-4 h-4" /> Hồ sơ
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                <Settings className="w-4 h-4" /> Cài đặt
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
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
## app/components/MobileDrawer.tsx

```tsx
"use client";
import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/app/lib/cn";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  side?: "left" | "right";
  title?: string;
}

export default function MobileDrawer({
  isOpen, onClose, children, side = "left", title
}: MobileDrawerProps) {
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      document.body.style.overflow = "hidden";
    } else {
      // Delay unmount to allow transition
      const timer = setTimeout(() => setShouldRender(false), 300);
      document.body.style.overflow = "";
      return () => clearTimeout(timer);
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!shouldRender) return null;

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[var(--z-modal)] md:hidden",
          "transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        className={cn(
          "fixed top-0 bottom-0 w-[280px] z-[var(--z-modal)] md:hidden",
          "transition-transform duration-300 ease-out",
          "bg-white shadow-2xl flex flex-col",
          side === "left" ? "left-0" : "right-0"
        )}
        style={{
          transform: isOpen
            ? "translateX(0)"
            : `translateX(${side === "left" ? "-100%" : "100%"})`
        }}
      >
        {title && (
          <div className="h-14 flex items-center justify-between px-4 shrink-0">
            <span className="font-bold text-slate-800">{title}</span>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}

```
