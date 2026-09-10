import { cn } from "@/app/lib/cn";
import { type CardElevation } from "@/app/lib/design-tokens";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
  elevation?: CardElevation;
  hoverable?: boolean;
}

const elevationMap: Record<CardElevation, string> = {
  flat:    "border border-slate-200",
  raised:  "border border-slate-200 shadow-sm",
  overlay: "border border-slate-200 shadow-md",
};

export default function Card({
  children, className, padding = true, elevation = "raised", hoverable = false
}: CardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl",
        elevationMap[elevation],
        padding && "p-6",
        hoverable && "hover:shadow-md transition-shadow cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}
