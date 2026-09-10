"use client";
import { User } from "lucide-react";
import type { Speaker } from "@/app/lib/db";

interface SpeakerFilterProps {
  speakers: Speaker[];
  filteredSpeakerId: string | null;
  onFilterChange: (id: string | null) => void;
}

export default function SpeakerFilter({ speakers, filteredSpeakerId, onFilterChange }: SpeakerFilterProps) {
  return (
    <div className="px-4 py-3 md:px-8 border-b border-slate-200 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide sticky top-0 bg-white z-20 shadow-sm">
      <span className="text-xs font-bold text-slate-500 uppercase flex items-center mr-2 shrink-0">
        <User className="w-3.5 h-3.5 mr-1" /> Người nói:
      </span>
      <button
        onClick={() => onFilterChange(null)}
        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
          !filteredSpeakerId
            ? "bg-slate-800 text-white border-slate-800"
            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
        }`}
      >
        Tất cả ({speakers.length})
      </button>
      {speakers.map((speaker) => (
        <button
          key={speaker.id}
          onClick={() => onFilterChange(filteredSpeakerId === speaker.id ? null : speaker.id)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            filteredSpeakerId === speaker.id
              ? "bg-primary-600 text-white border-primary-600 shadow-sm"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          {speaker.name}
        </button>
      ))}
    </div>
  );
}
