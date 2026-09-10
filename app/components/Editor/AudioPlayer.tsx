"use client";
import { useRef } from "react";
import { Play, Pause, RotateCcw, RotateCw } from "lucide-react";
import Spinner from "../ui/Spinner";

interface EditorAudioPlayerProps {
  audioSrc: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isBuffering?: boolean;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onRateChange: () => void;
  onSeek: (time: number) => void;
  onTimeUpdate: () => void;
  onLoadedMetadata: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  onEnded: () => void;
  onSummarize?: () => void;
  formatTime: (s: number) => string;
}

export default function EditorAudioPlayer({
  audioSrc, isPlaying, currentTime, duration, playbackRate,
  isBuffering = false, onTogglePlay, onSkip, onRateChange, onSeek,
  onTimeUpdate, onLoadedMetadata, onEnded, formatTime
}: EditorAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  return (
    <div className="h-16 md:h-20 bg-white border-t border-slate-200 px-3 md:px-8 flex items-center gap-2 md:gap-4 shadow-sm z-20 shrink-0 pb-[env(safe-area-inset-bottom)]">
      <button
        onClick={onTogglePlay}
        disabled={isBuffering}
        className="w-10 h-10 md:w-12 md:h-12 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700 active:scale-95 transition shadow-lg shrink-0 disabled:opacity-50"
      >
        {isBuffering ? <Spinner size="sm" intent="white" /> :
         isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
      </button>

      <div className="flex items-center gap-1">
        <button onClick={() => onSkip(-10)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition" title="Lùi 10 giây">
          <RotateCcw className="w-5 h-5" />
        </button>
        <button onClick={() => onSkip(10)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition" title="Tua 10 giây">
          <RotateCw className="w-5 h-5" />
        </button>
        <button onClick={onRateChange} className="p-2 px-2.5 text-slate-700 hover:bg-slate-100 rounded-lg transition text-xs font-bold min-w-[3rem]" title="Tốc độ phát">
          {playbackRate}x
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div className="flex justify-between text-[10px] md:text-xs font-medium text-slate-500 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600 hover:accent-primary-500"
          aria-label="Audio progress"
        />
      </div>

      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
      />
    </div>
  );
}
