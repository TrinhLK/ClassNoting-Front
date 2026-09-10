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
