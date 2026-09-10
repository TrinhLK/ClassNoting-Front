"use client";
import React, { memo, useRef, useEffect, useState } from "react";
import { ChevronDown, Play, Pause, ArrowUpToLine, Plus, Edit2 } from "lucide-react";

import type { Segment, Speaker } from "../lib/db";
import type { Word } from "../lib/mockData";

interface TranscriptRowProps {
  segment: Segment;
  speaker: Speaker;
  allSpeakers: Speaker[];
  isActive: boolean;
  isAudioPlaying: boolean;
  activeWordIndex: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onTextChange: (id: string, text: string) => void;
  onSpeakerChange: (id: string, spkId: string) => void;
  onSplit: (id: string, cursor: number) => void;
  onMerge: (id: string) => void;
  onAddRow: (id: string) => void;
  onTimeChange: (id: string, newTime: number) => void;
}

function TranscriptRow({
  segment, speaker, allSpeakers, isActive,
  isAudioPlaying, activeWordIndex, onTogglePlay,
  onSeek, onTextChange, onSpeakerChange, onSplit, onMerge,
  onAddRow, onTimeChange
}: TranscriptRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // State nội bộ để quản lý việc sửa thời gian
  const [timeStr, setTimeStr] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [showSpeakerMenu, setShowSpeakerMenu] = useState(false);
  // Auto resize textarea (Chỉ chạy khi đang edit)
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [segment.text, isEditing]);
  // Helper: Chuyển giây -> MM:SS

  const renderKaraokeText = () => {
    // Nếu text bị sửa thủ công khác với các từ trong mảng words, ta sẽ chỉ hiện text thường
    // (Bỏ qua khoảng trắng thừa để so sánh chính xác hơn)
    const originalText = segment.words ? segment.words.map((w: Word) => w.word).join(" ") : "";
    const isEdited = segment.words && segment.words.length > 0 && 
                     segment.text.replace(/\s+/g, ' ').trim() !== originalText.replace(/\s+/g, ' ').trim();

    // BACKWARD COMPATIBILITY & EDIT FALLBACK
    if (!segment.words || segment.words.length === 0 || isEdited) {
      return (
        <p
          className="text-slate-800 leading-relaxed text-sm md:text-base smart-copy-text"
          data-smart-copy="true"
          data-speaker={speaker.name}
          data-timestamp={formatTime(segment.start)}
        >
          {segment.text}
        </p>
      );
    }
    return (
      <p
        className="leading-relaxed text-slate-800 text-sm md:text-base smart-copy-text"
        data-smart-copy="true"
        data-speaker={speaker.name}
        data-timestamp={formatTime(segment.start)}
      >
        {segment.words.map((w: Word, idx: number) => {
          const isHighlight = activeWordIndex >= 0 && idx === activeWordIndex;

          return (
            <React.Fragment key={idx}>
              <span
                className={`transition-all duration-150 rounded px-0.5 inline-block
                  ${isHighlight
                    ? "bg-green-200 text-black font-semibold  shadow-sm ring-1 ring-green-300"
                    : "hover:bg-slate-100"
                  }
                `}
                title={`${w.start.toFixed(2)}s`}
                data-word-start={w.start}
              >
                {w.word}
              </span>{" "}
            </React.Fragment>
          );
        })}
      </p>
    );
  };
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // Helper: Chuyển MM:SS -> giây
  const parseTime = (str: string) => {
    const parts = str.split(":").map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    return segment.start; // Fallback nếu nhập sai
  };

  // Sync state khi prop thay đổi
  useEffect(() => {
    setTimeStr(formatTime(segment.start));
  }, [segment.start]);

  // Auto resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [segment.text]);

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActive) {
      onTogglePlay();
    } else {
      onSeek(segment.start);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLTextAreaElement;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSplit(segment.id, target.selectionStart);
      setIsEditing(false); // Thoát chế độ sửa để tránh kẹt focus ở dòng cũ
    }
    if (e.key === 'Backspace' && target.selectionStart === 0 && target.selectionEnd === 0) {
      // Chỉ cho phép gộp nếu không bôi đen
      e.preventDefault();
      onMerge(segment.id);
      setIsEditing(false);
    }
  };

  const handleTimeBlur = () => {
    const newTime = parseTime(timeStr);
    if (newTime !== segment.start) {
      onTimeChange(segment.id, newTime);
    } else {
      // Nếu nhập sai hoặc không đổi, reset lại hiển thị cũ
      setTimeStr(formatTime(segment.start));
    }
  };

  return (
    <div className={`flex gap-4 group transition-all duration-300 ${isActive ? "opacity-100" : "opacity-80 hover:opacity-100"}`}>

      {/* 1. Cột Thời Gian & Nút Play */}
      <div className="w-16 flex flex-col items-end pt-1 gap-2 flex-shrink-0">
        
        <div className="relative group/time">
          <input
            className={`text-xs font-mono text-right bg-transparent border-b border-transparent focus:border-indigo-500 outline-none w-14
                      ${isActive ? "text-indigo-600 font-bold" : "text-slate-400"}
                  `}
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            onBlur={handleTimeBlur}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          {/* Tooltip nhắc nhở format */}
          <span className="absolute right-0 -top-6 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-focus-within/time:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
            Nhập MM:SS
          </span>
        </div>

        <button
          onClick={handlePlayClick}
          className={`w-6 h-6 rounded-full flex items-center justify-center transition-all 
            ${isActive
              ? "bg-indigo-600 text-white shadow-md scale-110"
              : "bg-slate-100 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-indigo-100 hover:text-indigo-600"
            }`}
          title={isActive && isAudioPlaying ? "Tạm dừng" : "Nghe đoạn này"}
        >
          {isActive && isAudioPlaying ? (
            <Pause className="w-3 h-3 fill-current" />
          ) : (
            <Play className="w-3 h-3 ml-0.5 fill-current" />
          )}
        </button>
      </div>

      {/* 2. Cột Nội Dung */}
      <div
        className={`flex-1 p-4 rounded-xl border transition-all relative group/content 
            ${isActive ? "bg-indigo-50 border-indigo-200 shadow-sm" : "bg-white border-transparent hover:border-slate-200"}
        `}
        // Double click để vào chế độ sửa nhanh
        onDoubleClick={() => setIsEditing(true)}
      >

        
        <div className="absolute right-2 top-2 opacity-0 group-hover/content:opacity-100 transition-opacity flex gap-1 bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-slate-100 z-10">
          {!isEditing && (
            <button onClick={() => setIsEditing(true)} title="Sửa văn bản" className="p-1.5 hover:bg-blue-50 rounded text-slate-400 hover:text-blue-600 transition-colors">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onAddRow(segment.id)}
            title="Chèn dòng mới phía dưới"
            className="p-1.5 hover:bg-green-50 rounded text-slate-400 hover:text-green-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-slate-200 my-auto"></div>
          <button
            onClick={() => onMerge(segment.id)}
            title="Gộp với đoạn trên (Backspace)"
            className="p-1.5 hover:bg-indigo-50 rounded text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <ArrowUpToLine className="w-4 h-4" />
          </button>
        </div>

        {/* Speaker Name */}
        <div className="group/spk relative inline-block mb-1">
          <button
            // SỬA: Chuyển sang onClick, bỏ group-hover
            onClick={(e) => {
              e.stopPropagation(); // Tránh kích hoạt play audio
              setShowSpeakerMenu(!showSpeakerMenu);
            }}
            className={`text-xs font-bold px-2 py-1 rounded border flex items-center gap-1 transition-colors ${speaker.color}`}
          >
            {speaker.name}
            <ChevronDown className="w-3 h-3 opacity-50" />
          </button>

          {/* SỬA: Logic hiển thị dựa trên State thay vì CSS Hover */}
          {showSpeakerMenu && (
            <>
              {/* Lớp màng vô hình: Click ra ngoài để đóng menu */}
              <div
                className="fixed inset-0 z-40 cursor-default"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSpeakerMenu(false);
                }}
              />

              {/* Dropdown Menu */}
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border rounded-lg shadow-xl z-50 py-1 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                {allSpeakers.map((spk: Speaker) => (
                  <div
                    key={spk.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSpeakerChange(segment.id, spk.id);
                      setShowSpeakerMenu(false); // Chọn xong tự đóng
                    }}
                    className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer flex items-center gap-2"
                  >
                    <div className={`w-2 h-2 rounded-full ${spk.color.split(" ")[0].replace("bg-", "bg-slate-900")}`}></div>
                    {spk.name}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Text Area */}
        <div className="mt-1 min-h-[24px]">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={segment.text}
              onChange={(e) => onTextChange(segment.id, e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => setIsEditing(false)} // Blur ra ngoài thì lưu và thoát chế độ sửa
              autoFocus
              rows={1}
              className="w-full bg-transparent resize-none outline-none text-slate-800 leading-relaxed placeholder:text-slate-300 focus:ring-0 border-none p-0"
              placeholder="Nhập nội dung hội thoại..."
            />
          ) : (
            <div onClick={() => !isActive && onSeek(segment.start)} className="cursor-text">
              {renderKaraokeText()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(TranscriptRow);