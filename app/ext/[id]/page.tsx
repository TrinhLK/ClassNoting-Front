"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Radio, AlertCircle, AlignLeft, MessageSquare, Users } from "lucide-react";
import { subscribeToExtSession } from "@/app/lib/db/extSessionDb";
import type { ExtSession } from "@/app/lib/ext-sessions";
import ChatPanel from "@/app/components/Meeting/ChatPanel";
import ExtLiveInsight from "@/app/components/Meeting/ExtLiveInsight";
import { PROVIDER_LABELS } from "@/app/lib/meeting-links";

/** Màn hình xem live phiên ghi từ Chrome extension: ai nói gì + chat realtime. */
export default function ExtLivePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [session, setSession] = useState<ExtSession | null | undefined>(undefined);
  const [tab, setTab] = useState<"transcript" | "chat">("transcript");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    return subscribeToExtSession(id, setSession);
  }, [id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.liveSegments, session?.chatMessages]);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 text-center bg-slate-50">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <h1 className="text-xl font-bold text-slate-800">Phiên không tồn tại</h1>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Về Dashboard
        </button>
      </div>
    );
  }

  const rosterMissing = session.status === "live" && session.participants.length === 0;
  const speakerMissing = session.status === "live" && session.liveSegments.length > 0 &&
    session.liveSegments.every((s) => s.uncertain || s.speaker === "Chưa xác định");

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <div className="bg-white border-b px-4 md:px-6 py-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600 shrink-0">
            <Radio className={`w-5 h-5 ${session.status === "live" ? "animate-pulse" : ""}`} />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-slate-800 truncate">{session.title}</h1>
            <p className="text-xs text-slate-500">
              {PROVIDER_LABELS[session.provider] ?? session.provider} ·{" "}
              {session.status === "live" ? (
                <span className="text-red-500 font-bold">ĐANG GHI</span>
              ) : (
                <span>
                  ĐÃ KẾT THÚC
                  {session.meetingId && (
                    <>
                      {" · "}
                      <Link href={`/meeting/${session.meetingId}`} className="text-indigo-600 font-bold hover:underline">
                        Xem biên bản →
                      </Link>
                    </>
                  )}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 shrink-0">
          <Users className="w-4 h-4" /> {session.participants.length} người
        </div>
      </div>

      {(rosterMissing || speakerMissing) && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-2 text-xs text-amber-900 shrink-0">
          <span className="font-semibold">Chưa xác định được người nói.</span>{" "}
          {rosterMissing && <>Extension chưa đọc được roster Meet (0 người). Mở panel People và chạy “Chẩn đoán tab Meet này” trong popup extension. </>}
          {speakerMissing && <>Transcript vẫn đến nhưng chưa có cụm giọng chắc chắn; kiểm tra popup xem ASR đang dùng protocol 2 và diarization đã bật chưa.</>}
        </div>
      )}

      <div className="md:hidden flex bg-white border-b shrink-0">
        {(["transcript", "chat"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-xs font-bold uppercase flex items-center justify-center gap-2 border-b-2 ${
              tab === t
                ? "border-indigo-600 text-indigo-700 bg-indigo-50/50"
                : "border-transparent text-slate-500"
            }`}
          >
            {t === "transcript" ? <AlignLeft className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
            {t === "transcript" ? `Ai nói gì (${session.liveSegments.length})` : `Chat (${session.chatMessages.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row p-4 md:p-6 gap-4 md:gap-6">
        <div className={`flex-1 bg-white rounded-2xl border flex-col min-h-0 overflow-hidden ${tab === "chat" ? "hidden md:flex" : "flex"}`}>
          <div className="p-4 border-b bg-slate-50 font-bold text-xs uppercase text-slate-600 shrink-0">
            Ai nói gì · trực tiếp
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {session.liveSegments.length === 0 && (
              <p className="text-slate-400 italic text-center py-10 text-sm">
                Đang chờ câu nói đầu tiên...
              </p>
            )}
            {session.liveSegments.map((s) => (
              <div key={s.id} className="flex gap-2 items-start">
                <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center shrink-0">
                  {s.speaker.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700">
                    {s.speaker}
                    {s.uncertain && <span className="text-slate-400 font-normal"> · đang xác minh</span>}
                  </p>
                  <p className="text-sm text-slate-800 break-words">{s.text}</p>
                </div>
              </div>
            ))}
            <div ref={endRef} className="h-2" />
          </div>
        </div>

        <div className={`md:w-1/3 flex-col min-h-0 gap-4 md:gap-6 overflow-hidden ${tab === "transcript" ? "hidden md:flex" : "flex"} flex-1 md:flex-none`}>
          {/* Nửa trên: live insight từ transcript ASR (như Ghi âm trực tiếp) */}
          <div className="flex-1 min-h-0 flex">
            <ExtLiveInsight segments={session.liveSegments} />
          </div>
          {/* Nửa dưới: box chat của cuộc họp */}
          <div className="flex-1 min-h-0 bg-white rounded-2xl border flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-emerald-50 font-bold text-xs uppercase text-emerald-800 shrink-0">
              Chat · trực tiếp ({session.chatMessages.length})
            </div>
            <div className="flex-1 overflow-y-auto">
              <ChatPanel messages={session.chatMessages} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
