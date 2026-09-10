"use client";
import { ChevronLeft, ArrowLeft } from "lucide-react";
import { cn } from "@/app/lib/cn";
import type { ReactNode } from "react";
import Link from "next/link";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  backHref?: string;
  onBack?: () => void;
  actions?: ReactNode;
  variant?: "default" | "compact";
  sticky?: boolean;
  className?: string;
  id?: string;
  children?: ReactNode;
}

export default function PageHeader({
  title, subtitle, icon, backHref, onBack, actions,
  variant = "default", sticky = false, className, id, children
}: PageHeaderProps) {
  return (
    <header id={id} className={cn(
      "bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between gap-3 shrink-0",
      variant === "compact" ? "h-14 md:h-16" : "py-3 md:py-4",
      sticky && "sticky top-0 z-30",
      !children && "min-h-[64px]",
      className
    )}>
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
        {(backHref || onBack) && (
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors shrink-0"
            aria-label="Quay lại"
          >
            {backHref ? (
              <Link href={backHref}><ArrowLeft className="w-5 h-5" /></Link>
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        )}
        {icon && (
          <div className="p-2 bg-primary-50 text-primary-600 rounded-lg shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {children || (
            <>
              <h1 className={cn(
                "font-bold text-slate-800 truncate",
                variant === "compact" ? "text-base md:text-lg" : "text-lg md:text-2xl"
              )}>
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-slate-500 mt-0.5 truncate hidden sm:block">{subtitle}</p>
              )}
            </>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}
