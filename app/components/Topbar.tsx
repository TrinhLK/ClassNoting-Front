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
