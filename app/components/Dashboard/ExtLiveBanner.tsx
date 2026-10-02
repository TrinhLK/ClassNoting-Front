"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, MessageSquare, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getLiveExtSessions } from "../../lib/db/extSessionDb";
import type { ExtSession } from "../../lib/ext-sessions";

/** Banner phiên extension đang live trên dashboard. */
export default function ExtLiveBanner() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ExtSession[]>([]);

  useEffect(() => {
    // AppShell đã chặn render + redirect khi logout nên không cần reset ở đây.
    if (!user) return;
    let alive = true;
    getLiveExtSessions(user.uid)
      .then((s) => alive && setSessions(s))
      .catch(() => {});
    const timer = setInterval(() => {
      getLiveExtSessions(user.uid)
        .then((s) => alive && setSessions(s))
        .catch(() => {});
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user]);

  if (sessions.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {sessions.map((s) => (
        <Link
          key={s.id}
          href={`/ext/${s.id}`}
          className="flex items-center gap-3 p-3 md:p-4 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-white hover:shadow-md transition-shadow"
        >
          <span className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4 animate-pulse" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-slate-800 truncate">
              Đang ghi từ Extension: {s.title}
            </span>
            <span className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" /> {s.participants.length} người
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> {s.chatMessages.length} chat ·{" "}
                {s.liveSegments.length} câu
              </span>
            </span>
          </span>
          <span className="text-xs font-bold text-red-600 shrink-0">Xem live →</span>
        </Link>
      ))}
    </div>
  );
}
