"use client";

interface BrandIconProps {
  className?: string;
}

/**
 * Glyph ghim-ghi-chú (thay NotebookPen ở các vị trí brand).
 * Monochrome currentColor để tái dùng trên mọi nền.
 */
export default function BrandIcon({ className = "w-5 h-5" }: BrandIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="7.5" r="4.5" />
      <path d="M10.6 11.5h2.8L12 21z" />
    </svg>
  );
}
