"use client";
import TranscriptRow from "../TranscriptRow";
import type { Segment, Speaker } from "@/app/lib/db";

interface SegmentListProps {
  segments: Segment[];
  speakers: Speaker[];
  currentTime: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onTextChange: (id: string, text: string) => void;
  onSpeakerChange: (id: string, spkId: string) => void;
  onSplit: (id: string, cursor: number) => void;
  onMerge: (id: string) => void;
  onAddRow: (id: string) => void;
  onTimeChange: (id: string, newTime: number) => void;
}

export default function SegmentList({
  segments, speakers, currentTime, isPlaying,
  onTogglePlay, onSeek, onTextChange, onSpeakerChange,
  onSplit, onMerge, onAddRow, onTimeChange
}: SegmentListProps) {
  const getActiveWordIndex = (seg: Segment) => {
    if (!isPlaying || !seg.words) return -1;
    return seg.words.findIndex(w => currentTime >= w.start && currentTime <= (w.end + 0.15));
  };

  return (
    <div className="p-4 md:p-8 space-y-2">
      {segments.map((seg) => {
        const currentSpeaker = speakers.find(s => s.id === seg.speakerId) || speakers[0];
        const isActive = currentTime >= seg.start && currentTime <= seg.end;
        return (
          <TranscriptRow
            key={seg.id}
            segment={seg}
            speaker={currentSpeaker}
            allSpeakers={speakers}
            isActive={isActive}
            isAudioPlaying={isPlaying}
            activeWordIndex={getActiveWordIndex(seg)}
            onTogglePlay={onTogglePlay}
            onSeek={onSeek}
            onTextChange={onTextChange}
            onSpeakerChange={onSpeakerChange}
            onSplit={onSplit}
            onMerge={onMerge}
            onAddRow={onAddRow}
            onTimeChange={onTimeChange}
          />
        );
      })}
    </div>
  );
}
