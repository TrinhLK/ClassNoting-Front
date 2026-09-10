import { cn } from "@/app/lib/cn";
import { type AvatarSize } from "@/app/lib/design-tokens";

interface AvatarProps {
  name: string;
  colorScheme?: { bg: string; text: string };
  size?: AvatarSize;
  className?: string;
}

const sizeMap: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: "w-6 h-6", text: "text-[10px]" },
  sm: { container: "w-8 h-8", text: "text-xs" },
  md: { container: "w-10 h-10", text: "text-sm" },
  lg: { container: "w-12 h-12", text: "text-base" },
  xl: { container: "w-16 h-16", text: "text-2xl" },
};

export default function Avatar({
  name, colorScheme, size = "md", className
}: AvatarProps) {
  const initial = name?.charAt(0)?.toUpperCase() || "?";
  const scheme = colorScheme || { bg: "bg-slate-100", text: "text-slate-600" };
  const sizing = sizeMap[size];

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold shrink-0",
        scheme.bg,
        scheme.text,
        sizing.container,
        sizing.text,
        className
      )}
      title={name}
    >
      {initial}
    </div>
  );
}
