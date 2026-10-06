"use client";

import { NotebookPen } from "lucide-react";

interface BrandIconProps {
  className?: string;
}

/**
 * Biểu tượng ghi chú cuộc họp, dùng chung trong header và thương hiệu ứng dụng.
 */
export default function BrandIcon({ className = "w-5 h-5" }: BrandIconProps) {
  return <NotebookPen className={className} aria-hidden="true" />;
}
