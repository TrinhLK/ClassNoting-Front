"use client";
import { AlignLeft, Sparkles } from "lucide-react";

interface TabSwitcherProps {
  activeTab: "transcript" | "summary";
  onTabChange: (tab: "transcript" | "summary") => void;
}

export default function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
  return (
    <div className="md:hidden flex bg-white border-b sticky top-0 z-10 shrink-0">
      <button
        onClick={() => onTabChange("transcript")}
        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-all border-b-2 
          ${activeTab === "transcript" ? "border-indigo-600 text-indigo-700 bg-indigo-50/50" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
      >
        <AlignLeft className="w-4 h-4" /> Nội dung
      </button>
      <button
        onClick={() => onTabChange("summary")}
        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-all border-b-2
          ${activeTab === "summary" ? "border-orange-500 text-orange-700 bg-orange-50/50" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
      >
        <Sparkles className="w-4 h-4" /> Tóm tắt
      </button>
    </div>
  );
}
