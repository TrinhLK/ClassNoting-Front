"use client";

import { cn } from "@/app/lib/cn";

interface ProgressBarProps {
  value: number;
  variant?: "primary" | "success" | "warning" | "danger";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const variantMap: Record<string, string> = {
  primary: "bg-primary-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

const sizeMap: Record<string, string> = {
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
