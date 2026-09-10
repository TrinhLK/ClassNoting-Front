import { cn } from "@/app/lib/cn";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  trend?: { value: number; label?: string };
  intent?: "primary" | "success" | "warning" | "danger" | "neutral";
  className?: string;
}

const intentMap: Record<string, { bg: string; text: string }> = {
  primary: { bg: "bg-primary-50", text: "text-primary-600" },
  success: { bg: "bg-emerald-50", text: "text-emerald-600" },
  warning: { bg: "bg-amber-50", text: "text-amber-600" },
  danger:  { bg: "bg-red-50",    text: "text-red-600" },
  neutral: { bg: "bg-slate-100", text: "text-slate-600" },
};

export default function StatCard({
  icon, label, value, trend, intent = "neutral", className
}: StatCardProps) {
  const scheme = intentMap[intent] || intentMap.neutral;

  return (
    <div className={cn(
      "bg-white rounded-2xl border border-slate-200 p-5",
      "hover:shadow-md transition-shadow",
      className
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className={cn("p-2 rounded-lg", scheme.bg, scheme.text)}>
          {icon}
        </div>
        {trend && (
          <div className={cn(
            "flex items-center gap-0.5 text-xs font-bold",
            trend.value > 0 ? "text-emerald-600" : trend.value < 0 ? "text-red-600" : "text-slate-500"
          )}>
            {trend.value > 0 ? <TrendingUp className="w-3 h-3" /> : trend.value < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
      {trend?.label && <p className="text-xs text-slate-400 mt-1">{trend.label}</p>}
    </div>
  );
}
