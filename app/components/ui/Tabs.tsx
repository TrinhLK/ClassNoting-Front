"use client";
import { cn } from "@/app/lib/cn";
import type { ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: "underline" | "pill";
  className?: string;
}

export default function Tabs({
  tabs, activeTab, onChange, variant = "underline", className
}: TabsProps) {
  return (
    <div role="tablist" className={cn(
      "flex items-center gap-1",
      variant === "underline" && "border-b border-slate-200",
      className
    )}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors",
              variant === "underline" && [
                "border-b-2 -mb-px",
                isActive
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              ],
              variant === "pill" && [
                "rounded-lg",
                isActive
                  ? "bg-primary-600 text-white"
                  : "text-slate-500 hover:bg-slate-100"
              ]
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={cn(
                "px-1.5 py-0.5 text-[10px] rounded-full font-bold",
                isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
