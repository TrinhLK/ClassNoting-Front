"use client";
import { useRef, useEffect } from "react";
import { Sparkles } from "lucide-react";

interface SummaryItem {
  id: number;
  content: string;
  isLoading: boolean;
  timestamp?: number;
}

interface LVSummaryPanelProps {
  summaries: SummaryItem[];
  mobileTab: "transcript" | "summary";
  onScrollToSegment: (time: number) => void;
  formatTime: (s: number) => string;
}

export default function LVSummaryPanel({ summaries, mobileTab, onScrollToSegment, formatTime }: LVSummaryPanelProps) {
  const summariesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    summariesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [summaries]);

  return (
    <div className={`md:w-1/3 bg-white rounded-2xl border shadow-sm flex flex-col min-h-0 overflow-hidden transition-all ${mobileTab === 'summary' ? 'flex flex-1' : 'hidden md:flex'}`}>
      <div className="p-3 border-b bg-indigo-50 flex items-center gap-2 shrink-0">
        <Sparkles className="w-4 h-4 text-indigo-600" />
        <span className="text-xs font-bold text-indigo-800 uppercase">Live Insights (Tóm tắt)</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 scroll-smooth">
        <div className="space-y-4">
          {summaries.filter(s => !s.isLoading).map((item) => (
            <div
              key={item.id}
              onClick={() => item.timestamp !== undefined && onScrollToSegment(item.timestamp)}
              className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 group cursor-pointer hover:bg-indigo-50/50 p-2 -mx-2 rounded-xl transition-colors"
            >
              <div className="mt-1.5 w-2 h-2 rounded-full bg-green-500 shrink-0 group-hover:scale-125 transition-transform"></div>
              <div className="flex flex-col gap-0.5">
                {item.timestamp !== undefined && (
                  <span className="text-[10px] font-mono font-bold text-indigo-500 uppercase">
                    [{formatTime(item.timestamp)}]
                  </span>
                )}
                <p className="text-slate-700 text-sm leading-relaxed text-justify">{item.content}</p>
              </div>
            </div>
          ))}
          {summaries.filter(s => s.isLoading).map((item) => (
            <div key={item.id} className="flex gap-3 opacity-70">
              <div className="mt-1.5 w-2 h-2 rounded-full bg-slate-300 animate-bounce shrink-0"></div>
              <p className="text-slate-400 text-sm italic">{item.content}</p>
            </div>
          ))}
        </div>
        <div ref={summariesEndRef} className="h-4" />
      </div>
    </div>
  );
}
