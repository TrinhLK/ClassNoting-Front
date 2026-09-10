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
