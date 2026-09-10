"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Home, FileText, ClipboardList, Users, Database, Upload, Mic } from "lucide-react";
import Modal from "./ui/Modal";
import Input from "./ui/Input";
import { cn } from "@/app/lib/cn";

interface Command {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  group: string;
}

export default function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const commands: Command[] = useMemo(() => [
    { id: "nav-home", label: "Dashboard", icon: <Home className="w-4 h-4" />, action: () => router.push("/"), group: "Điều hướng" },
    { id: "nav-minutes", label: "Biên bản họp", icon: <FileText className="w-4 h-4" />, action: () => router.push("/minutes"), group: "Điều hướng" },
    { id: "nav-tasks", label: "Quản lý Task", icon: <ClipboardList className="w-4 h-4" />, action: () => router.push("/tasks"), group: "Điều hướng" },
    { id: "nav-team", label: "Nhân sự", icon: <Users className="w-4 h-4" />, action: () => router.push("/team"), group: "Điều hướng" },
    { id: "nav-training", label: "Huấn luyện", icon: <Database className="w-4 h-4" />, action: () => router.push("/training"), group: "Điều hướng" },
    { id: "act-upload", label: "Tải file lên", icon: <Upload className="w-4 h-4" />, action: () => { setIsOpen(false); document.getElementById("upload-action")?.click(); }, group: "Hành động" },
    { id: "act-live", label: "Ghi âm trực tiếp", icon: <Mic className="w-4 h-4" />, action: () => { setIsOpen(false); document.getElementById("live-action")?.click(); }, group: "Hành động" },
  ], [router]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [query, commands]);

  const grouped = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    filtered.forEach((c) => {
      if (!groups[c.group]) groups[c.group] = [];
      groups[c.group].push(c);
    });
    return groups;
  }, [filtered]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[activeIndex]) { filtered[activeIndex].action(); setIsOpen(false); } }
  }, [filtered, activeIndex]);

  useEffect(() => {
    if (!isOpen) { setQuery(""); setActiveIndex(0); }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} size="md" showCloseButton={false} className="!p-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
        <Search className="w-5 h-5 text-slate-400 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder="Tìm kiếm hoặc nhập lệnh..."
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400"
        />
        <kbd className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-mono">ESC</kbd>
      </div>

      <div className="max-h-[350px] overflow-y-auto py-2">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-slate-400 text-sm">Không tìm thấy kết quả</div>
        ) : (
          Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-2">
              <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{group}</p>
              {items.map((c) => {
                const idx = filtered.indexOf(c);
                return (
                  <button
                    key={c.id}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => { c.action(); setIsOpen(false); }}
                    className={cn(
                      "w-full px-4 py-2 flex items-center gap-3 text-left transition-colors",
                      idx === activeIndex ? "bg-primary-50 text-primary-700" : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <span className={cn("shrink-0", idx === activeIndex ? "text-primary-600" : "text-slate-400")}>{c.icon}</span>
                    <span className="flex-1 text-sm font-medium">{c.label}</span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-slate-200 px-4 py-2 flex items-center justify-between text-[10px] text-slate-400">
        <span><kbd className="px-1 py-0.5 bg-slate-100 rounded font-mono">↑↓</kbd> di chuyển <kbd className="px-1 py-0.5 bg-slate-100 rounded font-mono ml-2">↵</kbd> chọn</span>
        <span>Smart Meeting</span>
      </div>
    </Modal>
  );
}
