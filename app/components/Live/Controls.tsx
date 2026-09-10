"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Pause, MonitorPlay } from "lucide-react";

interface ControlsProps {
  isListening: boolean;
  volume: number;
  captureSystemAudio: boolean;
  onToggleRecord: () => void;
  onToggleCaptureSystemAudio: () => void;
  canToggleSystemAudio: boolean;
}

export default function Controls({
  isListening, volume, captureSystemAudio,
  onToggleRecord, onToggleCaptureSystemAudio, canToggleSystemAudio
}: ControlsProps) {
  const [heights, setHeights] = useState<number[]>(() => Array(20).fill(5));
  const volumeRef = useRef(volume);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    if (!isListening) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const tick = () => {
      const v = volumeRef.current;
      setHeights(prev =>
        prev.map(() => Math.min(100, Math.max(15, v * (1 + Math.random()) * 2)))
      );
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isListening]);

  return (
    <div className="bg-slate-900 rounded-2xl p-4 pt-14 md:p-6 shadow-lg shrink-0 flex items-center justify-between gap-4 md:flex-col md:justify-center md:h-64 transition-all relative overflow-hidden">
      <div className="absolute top-3 right-4 md:top-4 md:right-4 z-10">
        <button
          onClick={() => canToggleSystemAudio && onToggleCaptureSystemAudio()}
          disabled={!canToggleSystemAudio}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            captureSystemAudio
              ? 'bg-green-500/20 text-green-400 border border-green-500/50 shadow-green-500/20 shadow-lg hover:bg-green-500/30'
              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
          }`}
          title="Thu âm cả tiếng từ tab Google Meet/Youtube (Cần chọn tab)"
        >
          <MonitorPlay className="w-4 h-4" />
          {captureSystemAudio ? "Đã bật thu Tab" : "Thu âm Tab"}
        </button>
      </div>

      <div className="flex items-center justify-center gap-1 h-12 md:h-32 flex-1 md:w-full">
        {heights.map((h, i) => (
          <div key={i} className="w-1.5 md:w-2 bg-indigo-500 rounded-full transition-all duration-75" style={{ height: `${isListening ? h : 5}%` }}></div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3">
        <button onClick={onToggleRecord} className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center text-white shadow-xl border-4 border-slate-800 transition-transform active:scale-95 shrink-0 ${isListening ? 'bg-yellow-500 animate-pulse' : 'bg-red-600'}`}>
          {isListening ? <Pause className="w-5 h-5 md:w-6 md:h-6" /> : <Mic className="w-5 h-5 md:w-6 md:h-6" />}
        </button>
        {!isListening && (
          <p className="text-slate-500 text-xs animate-pulse">
            {captureSystemAudio ? "Sẵn sàng (Mic + Tab Audio)" : "Sẵn sàng (Mic Only)"}
          </p>
        )}
      </div>
    </div>
  );
}
