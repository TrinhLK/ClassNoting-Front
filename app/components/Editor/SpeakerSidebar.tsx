"use client";
import { Plus, Trash2, FileText, GripVertical, Mic } from "lucide-react";
import type { Speaker } from "@/app/lib/db";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import Tooltip from "../ui/Tooltip";

interface SpeakerSidebarProps {
  speakers: Speaker[];
  speakerDurations?: Record<string, number>;
  totalDuration?: number;
  onAddSpeaker: () => void;
  onUpdateSpeakerName: (id: string, name: string) => void;
  onDeleteSpeaker: (id: string) => void;
  onViewTranscript: () => void;
}

export default function SpeakerSidebar({
  speakers, speakerDurations = {}, totalDuration = 0,
  onAddSpeaker, onUpdateSpeakerName, onDeleteSpeaker, onViewTranscript
}: SpeakerSidebarProps) {
  return (
    <div className="hidden md:flex w-72 border-r border-slate-200 bg-slate-50 flex-col shrink-0">
      <div className="p-4 border-b border-slate-200 flex items-center bg-white gap-2">
        <h3 className="font-bold text-slate-700 flex items-center gap-2 whitespace-nowrap">
          <Mic className="w-4 h-4 text-primary-600 shrink-0" />
          Người tham gia
          <span className="text-xs text-slate-400 font-medium shrink-0">({speakers.length})</span>
        </h3>
        <Tooltip content="Thêm người nói">
          <Button variant="primary" size="sm" onClick={onAddSpeaker} className="!p-1.5">
            <Plus className="w-4 h-4" />
          </Button>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {speakers.map((spk) => {
          const duration = speakerDurations[spk.id] || 0;
          const percent = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
          return (
            <div
              key={spk.id}
              className="bg-white p-3 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-2">
                <GripVertical className="w-3 h-3 text-slate-300 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
                <Avatar
                  name={spk.name}
                  size="sm"
                  colorScheme={{ bg: spk.color?.split(" ")[0] || "bg-primary-100", text: "text-primary-700" }}
                />
                <span className="text-[10px] font-mono text-slate-400 flex-1">
                  {spk.id.split("_")[1] || "?"}
                </span>
                <Tooltip content="Xóa">
                  <button
                    onClick={() => onDeleteSpeaker(spk.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Tooltip>
              </div>
              <input
                value={spk.name}
                onChange={(e) => onUpdateSpeakerName(spk.id, e.target.value)}
                className="w-full text-sm font-medium border-b border-transparent focus:border-primary-500 outline-none bg-transparent"
                placeholder="Tên..."
              />
              {duration > 0 && (
                <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 transition-all" style={{ width: `${percent}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-slate-200 bg-white">
        <Button variant="outline" size="sm" onClick={onViewTranscript} leftIcon={<FileText className="w-4 h-4" />} className="w-full">
          Xem toàn văn
        </Button>
      </div>
    </div>
  );
}
