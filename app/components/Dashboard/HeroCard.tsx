"use client";
import { cn } from "@/app/lib/cn";
import Button from "@/app/components/ui/Button";
import type { ReactNode } from "react";

interface HeroCardProps {
  title: string;
  description?: string;
  icon: ReactNode;
  primaryAction: { label: string; onClick: () => void; icon?: ReactNode };
  secondaryAction?: { label: string; onClick: () => void; icon?: ReactNode };
  stepNumber?: number;
  totalSteps?: number;
  className?: string;
}

export default function HeroCard({
  title, description, icon, primaryAction, secondaryAction,
  stepNumber, totalSteps, className
}: HeroCardProps) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border border-primary-100",
      "bg-gradient-to-br from-primary-50 via-white to-primary-50/50",
      "p-6 md:p-8",
      className
    )}>
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary-200 rounded-full opacity-30 blur-3xl" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-primary-300 rounded-full opacity-20 blur-3xl" />

      <div className="relative flex flex-col md:flex-row md:items-center gap-6">
        <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-primary-600 text-white flex items-center justify-center shadow-lg shrink-0">
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          {stepNumber && totalSteps && (
            <p className="text-[10px] font-bold text-primary-600 uppercase tracking-wider mb-1">
              Bước {stepNumber} / {totalSteps}
            </p>
          )}
          <h2 className="text-lg md:text-xl font-bold text-slate-800 mb-1">{title}</h2>
          {description && (
            <p className="text-sm text-slate-600 max-w-md">{description}</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          {secondaryAction && (
            <Button
              variant="outline"
              size="md"
              onClick={secondaryAction.onClick}
              leftIcon={secondaryAction.icon}
            >
              {secondaryAction.label}
            </Button>
          )}
          <Button
            variant="primary"
            size="md"
            onClick={primaryAction.onClick}
            leftIcon={primaryAction.icon}
          >
            {primaryAction.label}
          </Button>
        </div>
      </div>
    </div>
  );
}
