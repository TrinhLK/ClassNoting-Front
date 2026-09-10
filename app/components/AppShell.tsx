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
