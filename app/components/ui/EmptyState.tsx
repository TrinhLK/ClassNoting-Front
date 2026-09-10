import { cn } from "@/app/lib/cn";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: "default" | "compact";
  className?: string;
}

export default function EmptyState({
  icon, title, description, action, variant = "default", className
}: EmptyStateProps) {
  return (
    <div className={cn(
      "text-center bg-white rounded-2xl border border-dashed border-slate-200",
      variant === "compact" ? "py-8" : "py-12 md:py-20",
      className
    )}>
      <div className={cn(
        "mx-auto mb-3 md:mb-4 rounded-full flex items-center justify-center",
        variant === "compact" ? "w-12 h-12" : "w-16 h-16",
        "bg-slate-50 text-slate-300"
      )}>
        {icon}
      </div>
      <h3 className="text-slate-700 font-bold text-base mb-1">{title}</h3>
      {description && <p className="text-slate-400 text-sm mb-5 max-w-md mx-auto px-4">{description}</p>}
      {action && <div className="flex items-center justify-center gap-3">{action}</div>}
    </div>
  );
}
