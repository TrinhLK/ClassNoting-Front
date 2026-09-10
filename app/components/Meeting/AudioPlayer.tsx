"use client";
import { type RefObject } from "react";
import { Play, Pause, RotateCcw, RotateCw } from "lucide-react";

interface MeetingAudioPlayerProps {
  audioRef: RefObject<HTMLAudioElement | null>;
  audioSrc: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  onTogglePlay: () => void;
  onSkip: (sec: number) => void;
  onRateChange: () => void;
  onSeek: (time: number) => void;
  onTimeUpdate: () => void;
  onLoadedMetadata: () => void;
  onEnded: () => void;
  formatTimeCode: (s: number) => string;
}

export default function MeetingAudioPlayer({
  audioRef, audioSrc, isPlaying,
  currentTime, duration, playbackRate,
  onTogglePlay, onSkip, onRateChange, onSeek,
  onTimeUpdate, onLoadedMetadata, onEnded, formatTimeCode
}: MeetingAudioPlayerProps) {
  return (
    <div className="bg-white border-t p-3 md:p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-30 shrink-0">
      <div className="max-w-3xl mx-auto flex items-center gap-3 md:gap-4">
        <button
          onClick={onTogglePlay}
          className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition shadow-lg shrink-0"
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 pl-1" />}
        </button>

        <div className="flex items-center gap-1 md:gap-2">
          <button onClick={() => onSkip(-10)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition" title="Lùi 10s">
            <RotateCcw className="w-5 h-5" />
          </button>
          <button onClick={() => onSkip(10)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition" title="Tua 10s">
            <RotateCw className="w-5 h-5" />
          </button>
          <button onClick={onRateChange} className="p-2 text-slate-700 hover:bg-slate-100 rounded-lg transition text-xs font-bold min-w-[3rem]" title="Tốc độ phát">
            {playbackRate}x
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center gap-1">
          <div className="flex justify-between text-[10px] md:text-xs font-medium text-slate-500">
            <span>{formatTimeCode(currentTime)}</span>
            <span>{formatTimeCode(duration)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-full h-1.5 md:h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500"
          />
        </div>

        <audio
          ref={audioRef}
          src={audioSrc}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onEnded={onEnded}
          className="hidden"
        />
      </div>
    </div>
  );
}
