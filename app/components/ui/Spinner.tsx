import { Loader2 } from "lucide-react";
import { cn } from "@/app/lib/cn";

type SpinnerSize = "sm" | "md" | "lg" | "xl";
type SpinnerIntent = "primary" | "white" | "muted" | "danger";

interface SpinnerProps {
  size?: SpinnerSize;
  intent?: SpinnerIntent;
  className?: string;
}

const sizeMap: Record<SpinnerSize, string> = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-8 h-8",
  xl: "w-12 h-12",
};

const intentMap: Record<SpinnerIntent, string> = {
  primary: "text-primary-600",
  white: "text-white",
  muted: "text-slate-400",
  danger: "text-red-600",
};

export default function Spinner({ size = "md", intent = "primary", className }: SpinnerProps) {
  return <Loader2 className={cn("animate-spin", sizeMap[size], intentMap[intent], className)} />;
}
