"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, NotebookPen, AlertCircle, AlignLeft, MessageSquare, Users, Share2, Check } from "lucide-react";
import { subscribeToExtSession } from "@/app/lib/db/extSessionDb";
import type { ExtSession } from "@/app/lib/ext-sessions";
import ChatPanel from "@/app/components/Meeting/ChatPanel";
import ExtLiveInsight from "@/app/components/Meeting/ExtLiveInsight";
import { PROVIDER_LABELS } from "@/app/lib/meeting-links";
import { useAuth } from "@/app/context/AuthContext";

/** Màn hình xem live phiên ghi từ Chrome extension: ai nói gì + chat realtime. */
export default function ExtLivePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const id = params?.id as string;
  const [session, setSession] = useState<ExtSession | null | undefined>(undefined);
  const [tab, setTab] = useState<"transcript" | "chat">("transcript");
  const [publicMode, setPublicMode] = useState(false);
  const [publicEnded, setPublicEnded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [shareError, setShareError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("key");
    if (token) {
      setPublicMode(true);
      setSession(undefined);
      let cancelled = false;
      let polling = false;
      let lastUpdatedAt: number | null = null;
      const refresh = async () => {
        if (polling) return;
        polling = true;
        try {
          const res = await fetch(`/api/extension/public/${encodeURIComponent(id)}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...(lastUpdatedAt !== null ? { "If-None-Match": `"${lastUpdatedAt}"` } : {}),
            },
            cache: "no-store",
          });
          if (cancelled) return;
          if (res.status === 304) {
            return;
          } else if (res.ok) {
            const data = await res.json();
            const publicSession = data.session as ExtSession;
            if (publicSession.updatedAt !== lastUpdatedAt) {
              lastUpdatedAt = publicSession.updatedAt;
              setSession(publicSession);
            }
            setPublicEnded(false);
            setShareError("");
          } else if (res.status === 410) {
            setPublicEnded(true);
            setSession((current) => current ?? null);
          } else if (res.status === 404) {
            setSession(null);
          } else {
            setShareError("Không thể cập nhật phiên live. Hãy thử tải lại trang sau ít phút.");
            setSession((current) => current ?? null);
          }
        } catch {
          if (!cancelled) {
            setShareError("Không kết nối được để cập nhật phiên live.");
            setSession((current) => current ?? null);
          }
        } finally {
          polling = false;
        }
      };
      void refresh();
      const timer = window.setInterval(refresh, 3000);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
    }
    setPublicMode(false);
    return subscribeToExtSession(id, setSession);
  }, [id]);

  const handleShare = async () => {
    if (!session || !user || sharing) return;
    setSharing(true);
    setShareError("");
    setShareNotice("");
    setShareCopied(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/extension/share", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.path) throw new Error(data.error || "Không tạo được link chia sẻ.");
      await navigator.clipboard.writeText(`${window.location.origin}${data.path}`);
      setShareCopied(true);
      setShareNotice("Đã copy link công khai. Bất kỳ ai có link đều xem được transcript và chat khi phiên còn live.");
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Không tạo được link chia sẻ.");
    } finally {
      setSharing(false);
    }
  };

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
        <h1 className="text-xl font-bold text-slate-800">{publicMode && publicEnded ? "Link live đã hết hiệu lực" : publicMode && shareError ? "Không tải được phiên live" : "Phiên không tồn tại hoặc link không hợp lệ"}</h1>
        {publicMode && shareError && <p className="max-w-md text-sm text-slate-500">{shareError}</p>}
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
            <NotebookPen className={`w-5 h-5 ${session.status === "live" && !publicEnded ? "animate-pulse" : ""}`} />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-slate-800 truncate">{session.title}</h1>
            <p className="text-xs text-slate-500">
              {PROVIDER_LABELS[session.provider] ?? session.provider} ·{" "}
              {session.status === "live" && !publicEnded ? (
                <span className="text-red-500 font-bold">ĐANG GHI</span>
              ) : (
                <span>
                  ĐÃ KẾT THÚC
                  {!publicMode && session.meetingId && (
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
        <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
          {!publicMode && user?.uid === session.ownerUid && session.status === "live" && (
            <button
              onClick={handleShare}
              disabled={sharing}
              className="px-2.5 py-2 md:px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold flex items-center gap-1.5 disabled:opacity-60"
              title="Copy link public để người khác theo dõi phiên live"
            >
              {shareCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{sharing ? "Đang tạo link..." : shareCopied ? "Đã copy link" : "Chia sẻ live"}</span>
            </button>
          )}
          <span className="hidden md:flex items-center gap-2"><Users className="w-4 h-4" /> {session.participants.length} người</span>
        </div>
      </div>

      {(shareError || shareNotice) && (
        <div className={`${shareError ? "bg-red-50 border-red-200 text-red-700" : "bg-emerald-50 border-emerald-200 text-emerald-800"} border-b px-4 md:px-6 py-2 text-xs shrink-0`}>
          {shareError || shareNotice}
        </div>
      )}

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
