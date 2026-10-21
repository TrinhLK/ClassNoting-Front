# Relevant shared primitives
## app/components/ui/Button.tsx
```tsx
"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/app/lib/cn";
import Spinner from "./Spinner";

const buttonVariants = cva(
  "font-bold transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary:   "bg-primary-600 hover:bg-primary-700 text-white shadow-sm active:scale-[0.98]",
        secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200",
        danger:    "bg-red-600 hover:bg-red-700 text-white shadow-sm",
        ghost:     "bg-transparent hover:bg-slate-100 text-slate-600",
        success:   "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
        outline:   "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700",
      },
      size: {
        sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
        md: "px-4 py-2.5 text-sm rounded-xl gap-2",
        lg: "px-6 py-3.5 text-base rounded-xl gap-2.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size">,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export default function Button({
  variant, size, loading, disabled, leftIcon, rightIcon,
  className, children, ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? <Spinner size="sm" intent="white" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

```
## app/components/ui/Card.tsx
```tsx
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

```
## app/components/ui/Avatar.tsx
```tsx
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

```
## app/components/ui/Spinner.tsx
```tsx
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

```
