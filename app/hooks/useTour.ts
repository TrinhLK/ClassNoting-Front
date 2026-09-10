"use client";
import { useCallback } from "react";
import { usePathname } from "next/navigation";

export function useTour() {
  const pathname = usePathname();

  const startTour = useCallback((pageKey?: string) => {
    if (typeof window === "undefined") return;
    const key = pageKey || (() => {
      if (pathname === "/") return "hasSeenDashboardTour";
      if (pathname.startsWith("/minutes")) return "hasSeenMinutesTour";
      if (pathname.startsWith("/edit")) return "hasSeenEditorTour";
      if (pathname.startsWith("/tasks")) return "hasSeenTasksTour";
      return null;
    })();
    if (key) {
      localStorage.removeItem(key);
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
