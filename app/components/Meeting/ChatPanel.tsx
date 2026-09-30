"use client";
import { MessageSquare } from "lucide-react";
import type { ChatMessage } from "@/app/lib/db";

export function formatChatTime(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPanel({ messages }: { messages: ChatMessage[] }) {
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
