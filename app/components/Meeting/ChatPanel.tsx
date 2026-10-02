"use client";
import { MessageSquare } from "lucide-react";
import type { ChatMessage, ChatStats } from "@/app/lib/db";

export function formatChatTime(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function ChatStatsBar({ stats }: { stats: ChatStats }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs">
      <p className="font-bold text-slate-700 uppercase tracking-wide mb-2">
        Tương tác chat: {stats.totalMessages} tin · {stats.uniqueSenders} người gửi ·{" "}
        {stats.responseRate}% phòng họp phản hồi
      </p>
      <div className="space-y-1.5 max-h-32 overflow-y-auto">
        {stats.bySender.map((s) => (
          <div key={s.sender} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate font-medium text-slate-600">{s.sender}</span>
            <span className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <span className="block h-full bg-emerald-500 rounded-full" style={{ width: `${s.pct}%` }} />
            </span>
            <span className="w-14 text-right font-bold text-slate-700 shrink-0">
              {s.count} ({s.pct}%)
            </span>
          </div>
        ))}
      </div>
      {stats.silent.length > 0 && (
        <p className="mt-2 text-slate-500">
          Chưa nhắn gì: <span className="font-medium">{stats.silent.join(", ")}</span>
        </p>
      )}
    </div>
  );
}

export default function ChatPanel({ messages, stats }: { messages: ChatMessage[]; stats?: ChatStats }) {
  if (!messages || messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
        <MessageSquare className="w-10 h-10" />
        <p className="text-sm font-medium">Chưa có tin nhắn nào trong khung chat cuộc họp.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-3">
      {stats && <ChatStatsBar stats={stats} />}
      {messages.map((m) => (
        <div key={m.id} className="flex gap-3 items-start bg-white border border-slate-150 rounded-xl p-3 shadow-sm">
          <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">
            {m.sender.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-xs">
              <span className="font-bold text-slate-800">{m.sender}</span>
              <span className="text-slate-400"> · {formatChatTime(m.timestamp)}</span>
            </p>
            <p className="text-sm text-slate-700 mt-1 break-words whitespace-pre-wrap">{m.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
