"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { LiveSession, subscribeToLiveSession } from "../../lib/db";
import { Loader2, Radio, AlertCircle, AlignLeft, Sparkles } from "lucide-react";

export default function LiveViewerPage() {
  const params = useParams();
  const id = params?.id as string;
  const [session, setSession] = useState<LiveSession | null | undefined>(undefined);
  
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const summariesEndRef = useRef<HTMLDivElement>(null);

  // Lắng nghe dữ liệu realtime từ Firebase
  useEffect(() => {
    if (!id) return;
    const unsubscribe = subscribeToLiveSession(id, (data) => {
      setSession(data);
    });
    // Cleanup khi unmount
    return () => unsubscribe();
  }, [id]);

  // Tự động cuộn xuống dưới cùng khi có chữ mới
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.segments]);

  useEffect(() => {
    summariesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.summary]);

  // UI Đang tải
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  // UI Lỗi / Không tìm thấy
  if (session === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4 p-4 text-center">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <h1 className="text-xl font-bold text-slate-800">Phiên Live không tồn tại</h1>
        <p className="text-slate-500">Đường dẫn không hợp lệ hoặc cuộc họp đã bị xóa.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* HEADER */}
      <div className="h-16 bg-white border-b flex items-center justify-between px-6 shadow-sm z-20 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
            <Radio className={`w-5 h-5 ${session.status === 'live' ? 'animate-pulse text-red-500' : ''}`} />
          </div>
          <div>
            <h1 className="font-bold text-slate-800">{session.title}</h1>
            <div className="flex items-center gap-2 text-xs font-medium">
              {session.status === 'live' ? (
                <span className="text-red-500 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  ĐANG PHÁT TRỰC TIẾP
                </span>
              ) : (
                <span className="text-slate-500">ĐÃ KẾT THÚC</span>
              )}
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">Chỉ đọc (Read-only)</span>
            </div>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row p-4 md:p-6 gap-6">
        
        {/* LEFT COLUMN: Transcript */}
        <div className="flex-1 bg-white rounded-2xl border shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="p-4 border-b bg-slate-50 flex items-center gap-2 shrink-0">
            <AlignLeft className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-bold text-slate-700 uppercase">Nội dung chi tiết</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6 font-sans text-sm md:text-base bg-slate-50/50 scroll-smooth">
            {session.segments && session.segments.length > 0 ? (
              session.segments.map((seg: { speakerId?: string; speaker?: number; text?: string; content?: string }, idx) => {
                const isHost = seg.speakerId === 'SPEAKER_00' || seg.speaker === 0;
                const speakerName = seg.speakerId || `Speaker ${seg.speaker}`;
                
                return (
                <div 
                  key={idx} 
                  className={`flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 ${isHost ? 'items-start' : 'items-end'}`}
                >
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mx-2">
                    {speakerName}
                  </span>
                  <div className={`p-4 rounded-2xl max-w-[85%] shadow-sm ${isHost ? 'bg-white border border-slate-200 rounded-tl-none' : 'bg-indigo-50 border border-indigo-100 rounded-tr-none'
                    }`}>
                    <p className="text-slate-800 leading-relaxed">
                      {seg.text || seg.content}
                    </p>
                  </div>
                </div>
              )})
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 italic">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin opacity-50" />
                  Đang chờ người nói...
                </div>
              </div>
            )}
            <div ref={transcriptEndRef} className="h-4" />
          </div>
        </div>

        {/* RIGHT COLUMN: Summary */}
        <div className="md:w-1/3 bg-white rounded-2xl border shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="p-4 border-b bg-indigo-50 flex items-center gap-2 shrink-0">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-bold text-indigo-800 uppercase">Tóm tắt (Real-time)</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 bg-indigo-50/10 scroll-smooth">
            {session.summary ? (
              <div className="prose prose-sm prose-slate max-w-none">
                {session.summary.split('\n\n').map((para, i) => (
                  <p key={i} className="text-slate-700 leading-relaxed bg-white p-4 rounded-xl border border-slate-100 shadow-sm mb-4 animate-in fade-in slide-in-from-bottom-2">
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 italic text-center text-sm px-4">
                AI đang xử lý...<br/>Tóm tắt sẽ xuất hiện sau khi có đủ dữ liệu.
              </div>
            )}
            <div ref={summariesEndRef} className="h-4" />
          </div>
        </div>
        
      </div>
    </div>
  );
}
