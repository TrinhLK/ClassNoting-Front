"use client";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-slate-500 px-4 md:px-6 py-2 bg-white border-b shrink-0">
      <Link href="/" className="hover:text-slate-700 transition-colors">
        <Home className="w-4 h-4 text-slate-400 shrink-0" />
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-slate-700 transition-colors font-medium truncate max-w-[200px]"
            >
              {item.label}
            </Link>
          ) : item.onClick ? (
            <button
              onClick={item.onClick}
              className="hover:text-slate-700 transition-colors font-medium truncate max-w-[200px]"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-slate-800 font-semibold truncate max-w-[200px]">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
