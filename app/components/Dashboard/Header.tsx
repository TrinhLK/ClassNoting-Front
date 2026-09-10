"use client";
import { LogOut, Bot, Mic } from "lucide-react";

type DashboardTab = "all" | "trash";

interface HeaderProps {
  currentTab: DashboardTab;
  liveLanguage: "vi" | "en";
  onLive: (language: "vi" | "en") => void;
  onOpenDrive: () => void;
  onOpenBot: () => void;
  onLogout: () => void;
}

export default function Header({
  currentTab, liveLanguage, onLive, onOpenDrive, onOpenBot, onLogout
}: HeaderProps) {
  return (
    <header className="bg-white border-b px-4 py-3 md:px-8 md:py-4 flex justify-between items-center shrink-0 sticky top-0 z-20">
      <h1 className="text-lg md:text-2xl font-bold text-slate-800 flex items-center gap-2">
        {currentTab === "all" ? (
          "Danh sách cuộc họp"
        ) : (
          <span className="text-red-600 flex items-center gap-2">
            <LogOut className="w-5 h-5" /> Thùng rác
          </span>
        )}
      </h1>
      <div className="flex items-center gap-2 md:gap-4">
        <button
          onClick={onLogout}
          className="md:hidden p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
          title="Đăng xuất"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      <div className="hidden md:flex gap-2">
        <button
          onClick={onOpenBot}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <Bot className="w-4 h-4" /> Mời Bot
        </button>
        <button
          onClick={onOpenDrive}
          className="text-sm font-medium text-green-600 hover:text-green-800 hover:bg-green-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
          </svg>
          Import Drive
        </button>
        <button
          onClick={() => onLive(liveLanguage)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm shadow-md transition-all active:scale-95"
        >
          <Mic className="w-4 h-4" /> Ghi âm mới
        </button>
      </div>
    </header>
  );
}
