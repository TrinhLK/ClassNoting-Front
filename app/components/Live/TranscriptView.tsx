"use client";
import { useRef, useEffect } from "react";
import { AlignLeft, Trash2 } from "lucide-react";

interface TranscriptSegment {
  speaker: number;
  content: string;
  words?: { start: number; end: number; word: string }[];
  [key: string]: unknown;
}

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  interimContent: string;
  onClear: () => void;
}

export default function TranscriptView({ segments, interimContent, onClear }: TranscriptViewProps) {
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, interimContent]);

  return (
    <div className="bg-white rounded-2xl border shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden transition-all flex">
      <div className="p-3 border-b bg-slate-50 flex items-center gap-2 shrink-0">
        <AlignLeft className="w-4 h-4 text-indigo-600" />
        <span className="text-xs font-bold text-slate-600 uppercase">Nội dung chi tiết</span>
        <button onClick={onClear} className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-sm">
        {segments.map((seg, idx) => {
          const startTime = seg.words?.[0]?.start || 0;
          const isLastSegment = idx === segments.length - 1;
          const showInterimInline = isLastSegment && interimContent && interimContent.trim().length > 0;

          return (
            <div
              key={idx}
              id={`live-seg-${startTime}`}
              className={`flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 ${seg.speaker === 0 ? 'items-start' : 'items-end'}`}
            >
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mx-2">
                Speaker {seg.speaker}
              </span>
              <div className={`p-3 rounded-2xl max-w-[85%] ${seg.speaker === 0 ? 'bg-slate-50 border border-slate-100 rounded-tl-none' : 'bg-indigo-50 border border-indigo-100 rounded-tr-none'}`}>
                <p className="text-slate-800 leading-relaxed text-sm">
                  {seg.content}
                  {showInterimInline && (
                    <span className="text-slate-400 italic ml-1">{interimContent} ...</span>
                  )}
                </p>
              </div>
            </div>
          );
        })}

        {segments.length === 0 && interimContent && (
          <div className="flex gap-3 opacity-75 mt-2">
            <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse shrink-0 flex items-center justify-center">
              <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-dashed border-slate-300 shadow-sm max-w-[85%]">
              <p className="text-slate-500 italic font-medium text-sm">{interimContent} ...</p>
            </div>
          </div>
        )}
        <div ref={transcriptEndRef} className="h-2" />
      </div>
    </div>
  );
}
