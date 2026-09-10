"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/app/lib/cn";
import type { ReactNode } from "react";

interface SidebarNavItemProps {
  href: string;
  icon: ReactNode;
  label: string;
  badge?: string | number;
  isActive?: boolean;
  isExternal?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}

export default function SidebarNavItem({
  href, icon, label, badge, isActive, isExternal, collapsed, onClick
}: SidebarNavItemProps) {
  const router = useRouter();

  const className = cn(
    "flex items-center rounded-lg text-sm font-medium",
    "transition-all duration-150 group",
    collapsed
      ? "justify-center px-0 py-2.5 w-full"
      : "gap-3 px-3 py-2.5",
    isActive
      ? "bg-primary-50 text-primary-700"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  );

  const content = (
    <>
      <span className={cn(
        "shrink-0",
        isActive ? "text-primary-600" : "text-slate-400 group-hover:text-slate-600"
      )}>
        {icon}
      </span>
      {!collapsed && (
        <span className="truncate flex-1">{label}</span>
      )}
      {!collapsed && badge !== undefined && (
        <span className={cn(
          "px-1.5 py-0.5 text-[10px] rounded-full font-bold shrink-0",
          isActive ? "bg-primary-200 text-primary-800" : "bg-slate-200 text-slate-600"
        )}>
          {badge}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={() => {
          if (!isExternal) router.push(href);
          onClick();
        }}
        className={cn(className, "w-full text-left", collapsed && "flex justify-center")}
      >
        {content}
      </button>
    );
  }

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
