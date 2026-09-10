"use client";
import { X } from "lucide-react";
import { cn } from "@/app/lib/cn";
import type { ReactNode } from "react";

interface BulkAction {
  label?: string;
  icon?: ReactNode;
  onClick: () => void;
  intent?: "primary" | "success" | "warning" | "danger";
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
  className?: string;
}

const intentMap: Record<string, string> = {
  primary: "text-primary-300 hover:text-white",
  success: "text-emerald-300 hover:text-white",
  warning: "text-amber-300 hover:text-white",
  danger:  "text-red-300 hover:text-white",
};

export default function BulkActionBar({
  selectedCount, actions, onClear, className
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className={cn(
      "fixed bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-50",
      "bg-slate-900 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-full shadow-xl",
      "flex items-center gap-3 md:gap-6 animate-in slide-in-from-bottom-4",
      "w-[90%] md:w-auto max-w-sm md:max-w-none justify-between md:justify-start",
      className
    )}>
      <span className="font-semibold text-xs md:text-sm whitespace-nowrap">
        Đã chọn {selectedCount}
      </span>
      <div className="h-4 md:h-6 w-px bg-slate-700" />
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={action.onClick}
          disabled={action.disabled}
          className={cn(
            "flex items-center gap-1.5 md:gap-2 font-bold text-xs md:text-sm whitespace-nowrap transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            intentMap[action.intent || "primary"]
          )}
        >
          {action.icon}
          <span className="hidden sm:inline">{action.label}</span>
        </button>
      ))}
      <div className="h-4 md:h-6 w-px bg-slate-700" />
      <button
        onClick={onClear}
        className="text-slate-500 hover:text-white transition-colors"
        aria-label="Bỏ chọn"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
