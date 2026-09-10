"use client";
import { X } from "lucide-react";

export default function TourFloatingButton() {
  const handleSkip = () => {
    const event = new KeyboardEvent("keydown", { key: "Escape" });
    document.dispatchEvent(event);
  };

  return (
    <button
      onClick={handleSkip}
      className="fixed bottom-4 right-4 z-[var(--z-popover)] bg-slate-900/90 backdrop-blur text-white px-3 py-2 rounded-full shadow-lg text-xs font-medium flex items-center gap-1.5 hover:bg-slate-800 transition-colors"
      aria-label="Bỏ qua hướng dẫn"
    >
      <X className="w-3.5 h-3.5" />
      Bỏ qua tour
    </button>
  );
}
