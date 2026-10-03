"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { requestSegmentSummary } from "@/app/lib/api";
import { createAiSessionId } from "@/app/lib/ai-session";
import type { ExtLiveSegment } from "@/app/lib/ext-sessions";

export interface InsightItem {
  id: number;
  content: string;
  isLoading: boolean;
}

/**
 * Live insight cho phiên extension: gom câu mới từ transcript realtime (ASR),
 * gọi tóm tắt incremental như luồng "Ghi âm trực tiếp".
 */
export default function ExtLiveInsight({
  segments,
  compact = false,
}: {
  segments: ExtLiveSegment[];
  compact?: boolean;
}) {
  const [insights, setInsights] = useState<InsightItem[]>([]);
  // Tick để đánh thức effect sau khi nhịp trước xong (tránh kẹt khi câu mới
  // đến đúng lúc đang bận — effect đã return sớm mà không chạy lại).
  const [tick, setTick] = useState(0);
  const processedRef = useRef(0);
  const bufferRef = useRef("");
  const aiSessionIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const pending = useMemo(
    () => segments.filter((s) => (s.text || "").trim() !== ""),
    [segments]
  );

  useEffect(() => {
    if (pending.length <= processedRef.current || busyRef.current) return;
    const fresh = pending.slice(processedRef.current);
    const words = fresh
      .map((s) => s.text)
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
    // Gom đủ ~40 từ mới thì tóm tắt 1 nhịp (tránh gọi API mỗi câu).
    if (words < 40) return;
    processedRef.current = pending.length;
    const chunk = fresh.map((s) => `${s.speaker}: ${s.text}`.trim()).join("\n");
    bufferRef.current += (bufferRef.current ? "\n" : "") + chunk;
    const text = bufferRef.current;
    bufferRef.current = "";
    const id = Date.now();
    busyRef.current = true;
    setInsights((prev) => [...prev, { id, content: "Đang tóm tắt...", isLoading: true }]);
    const sessionId = aiSessionIdRef.current ??= createAiSessionId("live");
    const prevSummary = insights
      .filter((s) => !s.isLoading)
      .slice(-1)
      .map((s) => s.content)
      .join("\n\n");
    requestSegmentSummary(text, sessionId, prevSummary)
      .then((summary) => {
        setInsights((prev) =>
          prev.map((it) =>
            it.id === id
              ? { ...it, content: summary || "Không có nội dung chính.", isLoading: false }
              : it
          )
        );
      })
      .catch(() => {
        setInsights((prev) =>
          prev.map((it) =>
            it.id === id ? { ...it, content: "Lỗi tóm tắt, sẽ thử lại ở nhịp sau.", isLoading: false } : it
          )
        );
      })
      .finally(() => {
        busyRef.current = false;
        setTick((t) => t + 1);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, tick]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [insights]);

  return (
    <div className={`flex-1 bg-white ${compact ? "" : "rounded-2xl border"} flex flex-col min-h-0 overflow-hidden`}>
      <div className="p-3 border-b bg-indigo-50 flex items-center gap-2 shrink-0">
        <Sparkles className="w-4 h-4 text-indigo-600" />
        <span className="text-xs font-bold text-indigo-800 uppercase">Live insight</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {insights.length === 0 && (
          <p className="text-slate-400 italic text-center py-6 text-sm">
            AI tóm tắt sẽ hiện sau khi có đủ nội dung nói...
          </p>
        )}
        {insights.map((it) => (
          <div key={it.id} className="flex gap-2 animate-in fade-in slide-in-from-bottom-2">
            {it.isLoading ? (
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0 mt-0.5" />
            ) : (
              <span className="mt-1.5 w-2 h-2 rounded-full bg-green-500 shrink-0" />
            )}
            <p className={`text-sm leading-relaxed ${it.isLoading ? "text-slate-400 italic" : "text-slate-700"}`}>
              {it.content}
            </p>
          </div>
        ))}
        <div ref={endRef} className="h-2" />
      </div>
    </div>
  );
}
