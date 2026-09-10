"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import {
  Play, Pause, ChevronLeft, Save, Sparkles, X,
  FileText, Copy, Check,
  Plus, Trash2, Pencil, Type, Eye, Users,
  RotateCcw, RotateCw, LayoutTemplate
} from "lucide-react";
import { Meeting, saveMeeting, updateMeetingTitle } from "../lib/db";
import { MEETING_STATUS } from "../lib/constants";
import type { Word } from "../lib/mockData";
import { formatTime as formatTimestamp } from "../lib/format";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { useAuth } from "../context/AuthContext";
import { MeetingTemplate, DEFAULT_TEMPLATES } from "../lib/templates";
import TemplateManagerModal from "./TemplateManagerModal";
import SegmentList from "./Editor/SegmentList";
import EditorHeader from "./Editor/Header";
import EditorAudioPlayer from "./Editor/AudioPlayer";
import SpeakerSidebar from "./Editor/SpeakerSidebar";
import Breadcrumb from "./Breadcrumb";

export default function EditorState({
  audioSrc,
  initialData,
  onBack,
  onSummarize
}: {
  audioSrc: string,
  initialData: Meeting,
  onBack: () => void,
  onSummarize: (meeting: Meeting, text: string, templateStructure?: string) => void
}) {
  const { user } = useAuth();

  // --- STATE ---
  const [showIntroModal, setShowIntroModal] = useState(true);
  const [segments, setSegments] = useState(initialData.segments);
  const [speakers, setSpeakers] = useState(initialData.speakers);

  // Edit Title
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(initialData.title);

  // Audio
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialData.duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Modals
  const [showSummary, setShowSummary] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSpeakerModal, setShowSpeakerModal] = useState(false);
  const [exportContent, setExportContent] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Mobile Tabs
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');

  // --- TEMPLATE STATE ---
  const [selectedTemplate, setSelectedTemplate] = useState<MeetingTemplate>(DEFAULT_TEMPLATES[0]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  const { toast, confirm } = useGlobalUI();

  // Focus input title
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // --- ACTIONS (Giữ nguyên logic cũ) ---
  const formatTime = useCallback((time: number) => {
    if (!time || isNaN(time) || !Number.isFinite(time)) return "00:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, time);
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  }, [isPlaying]);

  const skipTime = useCallback((seconds: number) => {
    if (audioRef.current) {
      const newTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds));
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [duration]);

  const togglePlaybackRate = useCallback(() => {
    const rates = [0.5, 1.0, 1.25, 1.5, 2.0];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    setPlaybackRate(rates[nextIdx]);
  }, [playbackRate]);

  // Logic Title
  const handleSaveTitle = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(initialData.title);
      setIsEditingTitle(false);
      return;
    }
    if (trimmed === initialData.title) {
      setIsEditingTitle(false);
      return;
    }
    const previousTitle = initialData.title;
    setIsEditingTitle(false);
    try {
      if (initialData.status === MEETING_STATUS.DRAFT) {
        const { getDraftFull, saveDraftMeta } = await import("../lib/indexedDB");
        const draft = await getDraftFull(initialData.id);
        if (!draft) throw new Error("Không tìm thấy bản nháp");
        await saveDraftMeta({ ...draft.meta, title: trimmed });
      } else {
        await updateMeetingTitle(initialData.id, trimmed);
      }
      toast.success("Đã đổi tên cuộc họp");
    } catch (err) {
      setTitle(previousTitle);
      toast.error("Lỗi đổi tên: " + (err as Error).message);
    }
  }, [title, initialData, toast]);

  const handleCancelTitle = useCallback(() => {
    setTitle(initialData.title);
    setIsEditingTitle(false);
  }, [initialData.title]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveTitle(); }
    if (e.key === 'Escape') { e.preventDefault(); handleCancelTitle(); }
  }, [handleSaveTitle, handleCancelTitle]);

  // Logic Speakers
  const handleAddSpeaker = useCallback(() => {
    let nextIndex = speakers.length;
    let newId = `SPEAKER_${String(nextIndex).padStart(2, '0')}`;
    while (speakers.some(s => s.id === newId)) {
      nextIndex++;
      newId = `SPEAKER_${String(nextIndex).padStart(2, '0')}`;
    }
    const colors = [
      "bg-indigo-50 text-indigo-700 border-indigo-200",
      "bg-emerald-50 text-emerald-700 border-emerald-200",
      "bg-orange-50 text-orange-700 border-orange-200",
      "bg-pink-50 text-pink-700 border-pink-200"
    ];
    setSpeakers([...speakers, {
      id: newId,
      name: `Người mới ${nextIndex}`,
      color: colors[Math.floor(Math.random() * colors.length)]
    }]);
  }, [speakers]);

  const handleDeleteSpeaker = useCallback(async (idToDelete: string) => {
    if (speakers.length <= 1) return toast.warning("Giữ lại ít nhất 1 người!");
    const isConfirmed = await confirm({
      title: "Xóa người nói?",
      message: "Lời thoại sẽ được gán cho người đầu tiên.",
      type: "danger"
    });
    if (isConfirmed) {
      const fallback = speakers.find(s => s.id !== idToDelete) || speakers[0];
      const updatedSegments = segments.map(seg => seg.speakerId === idToDelete ? { ...seg, speakerId: fallback.id } : seg);
      setSegments(updatedSegments);
      setSpeakers(speakers.filter(s => s.id !== idToDelete));
      toast.success("Đã xóa người nói.");
    }
  }, [speakers, segments, confirm, toast]);

  const handleUpdateSpeakerName = useCallback((id: string, newName: string) => {
    setSpeakers(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
  }, []);

  // Logic Editor
  const handleUpdateText = useCallback((segId: string, newText: string) => {
    setSegments(prev => prev.map(s =>
      s.id === segId
        ? { ...s, text: newText } // Xóa words: [] để giữ lại karaoke nếu người dùng hoàn tác text
        : s
    ));
  }, []);
  const handleChangeSpeaker = useCallback((segId: string, newId: string) => setSegments(prev => prev.map(s => s.id === segId ? { ...s, speakerId: newId } : s)), []);

  const handleSplitSegment = useCallback((segId: string, cursorIndex: number) => {
    const idx = segments.findIndex(s => s.id === segId);
    if (idx === -1) return;

    const original = segments[idx];

    // 1. Tính toán thời điểm cắt (Split Time)
    // Nếu có mảng words, ta sẽ tìm chính xác điểm cắt dựa vào cursorIndex
    let words1: Word[] = [];
    let words2: Word[] = [];
    let newMidTime = original.start + ((original.end - original.start) * 0.5);
    
    let text1 = original.text.slice(0, cursorIndex).trim();
    let text2 = original.text.slice(cursorIndex).trim();

    if (original.words && original.words.length > 0) {
      let charCount = 0;
      let splitIdx = original.words.length;
      
      for (let i = 0; i < original.words.length; i++) {
        const wordLen = original.words[i].word.length;
        if (charCount + (wordLen / 2) > cursorIndex) {
          splitIdx = i;
          break;
        }
        charCount += wordLen + 1;
      }

      words1 = original.words.slice(0, splitIdx);
      words2 = original.words.slice(splitIdx);

      if (words2.length > 0) {
        newMidTime = words2[0].start;
      } else if (words1.length > 0) {
        newMidTime = words1[words1.length - 1].end;
      }

      text1 = words1.length > 0 ? words1.map((w: Word) => w.word).join(" ") : text1;
      text2 = words2.length > 0 ? words2.map((w: Word) => w.word).join(" ") : text2;
    } else {
      const splitRatio = original.text.length > 0 ? cursorIndex / original.text.length : 0.5;
      newMidTime = original.start + ((original.end - original.start) * splitRatio);
    }

    // 3. Tạo Segment 1
    const newSeg1 = {
      ...original,
      text: text1,
      end: newMidTime,
      words: words1
    };

    // 4. Tạo Segment 2
    const newSeg2 = {
      id: Date.now().toString(),
      speakerId: original.speakerId,
      start: newMidTime,
      end: original.end,
      text: text2,
      words: words2
    };

    const newSegments = [...segments];
    newSegments[idx] = newSeg1;
    newSegments.splice(idx + 1, 0, newSeg2);
    setSegments(newSegments);
  }, [segments]);

  const handleMergeSegment = useCallback((currentId: string) => {
    const index = segments.findIndex(s => s.id === currentId);
    if (index <= 0) return; // Không thể gộp dòng đầu tiên lên trên

    const current = segments[index];
    const prev = segments[index - 1];

    // 1. Chuẩn bị mảng words để gộp (đề phòng null/undefined)
    const prevWords = prev.words || [];
    const currentWords = current.words || [];

    // 2. Tạo segment gộp
    const merged = {
      ...prev,
      text: (prev.text + " " + current.text).trim(),
      end: current.end, // Kéo dài thời gian kết thúc
      words: [...prevWords, ...currentWords] // <--- QUAN TRỌNG: Gộp mảng words nối đuôi nhau
    };

    const newSegments = [...segments];
    newSegments[index - 1] = merged; // Thay thế dòng trên bằng dòng đã gộp
    newSegments.splice(index, 1);    // Xóa dòng hiện tại
    setSegments(newSegments);
  }, [segments]);

  const handleAddRow = useCallback((prevId: string) => {
    const index = segments.findIndex(s => s.id === prevId);
    if (index === -1) return;
    const prev = segments[index];
    const newSeg = { id: Date.now().toString(), speakerId: prev.speakerId, start: prev.end, end: prev.end + 2, text: "" };
    const newSegments = [...segments];
    newSegments.splice(index + 1, 0, newSeg);
    setSegments(newSegments);
  }, [segments]);

  const handleTimeChange = useCallback((id: string, newStart: number) => {
    setSegments(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx === -1) return prev;
      const updated = [...prev];
      const current = { ...updated[idx] };
      current.start = newStart;
      if (current.start >= current.end) current.end = current.start + 2;
      updated[idx] = current;
      
      // Sắp xếp lại mảng theo start time
      updated.sort((a, b) => a.start - b.start);
      
      // Fix các đoạn bị chồng lấn thời gian
      for (let i = 0; i < updated.length - 1; i++) {
        if (updated[i].end > updated[i+1].start) {
          updated[i].end = updated[i+1].start;
        }
      }
      return updated;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      let finalMeeting = {
        ...initialData,
        segments: segments,
        speakers: speakers, // Lưu cả danh sách người nói
        title: title
      };


      if (initialData.status === MEETING_STATUS.DRAFT) {
        toast.info("Đang đồng bộ bản nháp lên cloud...");

        // A. Lấy Blob từ URL tạm
        const response = await fetch(audioSrc);
        const blob = await response.blob();
        // Đặt tên file là .webm vì recorder dùng webm
        const file = new File([blob], `${title}.webm`, { type: 'audio/webm' });

        // B. Upload Firebase
        const { uploadAudioToFirebase } = await import("../lib/api");
        const cloudUrl = await uploadAudioToFirebase(file, initialData.userId);

        // C. Cập nhật meeting finalized
        finalMeeting = {
          ...finalMeeting,
          audioUrl: cloudUrl,
          status: MEETING_STATUS.COMPLETED,
          jobId: undefined // Clear job id nếu có
        };

        // D. Xóa Local Draft
        await import("../lib/indexedDB").then(mod => mod.deleteDraft(initialData.id));
      }

      await saveMeeting(finalMeeting);
      toast.success("Đã lưu thành công!");

      // [TRAINING DATA] Fire-and-forget — không block UX
      if (initialData.status === MEETING_STATUS.COMPLETED && user) {
        (async () => {
          try {
            const { collectAndUploadSamples } = await import("../lib/trainingData");
            await collectAndUploadSamples(
              segments,
              initialData.segments,
              finalMeeting.audioUrl || audioSrc,
              initialData.language ?? "vi",
              initialData.id
            );
          } catch (e) {
            console.error("[Training] Collection failed:", e);
          }
        })();
      }


      // Nếu vừa finalize draft xong -> Back về dashboard để refresh
      if (initialData.status === MEETING_STATUS.DRAFT) {
        setTimeout(onBack, 1000);
      } else {
        setTimeout(() => setIsSaving(false), 500);
      }

    } catch (e) {
      console.error(e);
      toast.error("Lỗi khi lưu! " + (e as Error).message);
      setIsSaving(false);
    }
  }, [initialData, segments, speakers, title, audioSrc, user, toast, onBack]);

  const handleSummarizeRequest = useCallback(() => {
    const fullText = segments.map(s => `[${formatTimestamp(s.start)}] [${speakers.find(sp => sp.id === s.speakerId)?.name}]: ${s.text}`).join("\n");
    // [UPDATE] Truyền structure của template đang chọn
    onSummarize(initialData, fullText, selectedTemplate.structure);
    toast.info(`Đang tóm tắt theo mẫu: ${selectedTemplate.name}...`);
    onBack();
  }, [segments, speakers, selectedTemplate, formatTimestamp, initialData, onSummarize, toast, onBack]);

  const handleViewTranscript = useCallback(() => {
    const txt = segments.map(s => {
      const name = speakers.find(sp => sp.id === s.speakerId)?.name;
      return `[${formatTime(s.start)}] ${name}: ${s.text}`;
    }).join("\n\n");
    setExportContent(txt);
    setShowExportModal(true);
  }, [segments, speakers, formatTime]);

  return (
    <div className="flex flex-col h-full bg-white relative font-sans text-slate-900">

      {/* ------------------- SPEAKER MODAL (MOBILE) ------------------- */}
      {showSpeakerModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full sm:max-w-md h-[70vh] sm:h-auto rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" /> Quản lý người nói
              </h3>
              <button onClick={() => setShowSpeakerModal(false)} className="p-2 hover:bg-slate-200 rounded-full"><X className="w-5 h-5 text-slate-500" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {speakers.map(spk => (
                <div key={spk.id} className="bg-white p-3 rounded-lg border shadow-sm flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${spk.color.split(' ')[0]}`}>
                    {spk.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] text-slate-400 font-mono mb-1">{spk.id}</div>
                    <input
                      value={spk.name}
                      onChange={(e) => handleUpdateSpeakerName(spk.id, e.target.value)}
                      className="w-full text-sm font-medium border-b border-slate-200 focus:border-indigo-500 outline-none bg-transparent pb-1"
                      placeholder="Nhập tên..."
                    />
                  </div>
                  <button onClick={() => handleDeleteSpeaker(spk.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 border-t bg-slate-50">
              <button onClick={handleAddSpeaker} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                <Plus className="w-5 h-5" /> Thêm người mới
              </button>
            </div>
          </div>
        </div>
      )}

      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/" },
          { label: `Sửa: ${title || ""}` },
        ]}
      />

      <EditorHeader
        title={title}
        isEditingTitle={isEditingTitle}
        isSaving={isSaving}
        selectedTemplateName={selectedTemplate.name}
        speakerCount={speakers.length}
        onBack={onBack}
        onStartEditingTitle={() => setIsEditingTitle(true)}
        onSaveTitle={handleSaveTitle}
        onCancelTitle={handleCancelTitle}
        onTitleKeyDown={handleKeyDown}
        onTitleChange={setTitle}
        onOpenTemplateModal={() => setShowTemplateModal(true)}
        onOpenSpeakerModal={() => setShowSpeakerModal(true)}
        onSummarize={handleSummarizeRequest}
        onSave={handleSave}
      />

      {/* ------------------- MOBILE ACTION BAR ------------------- */}
      <div className="md:hidden bg-white border-b border-slate-200 px-3 py-2 flex gap-2 shrink-0">
        <button
          onClick={() => setShowTemplateModal(true)}
          title={`Mẫu: ${selectedTemplate.name}`}
          aria-label="Chọn mẫu biên bản"
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-slate-700 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 rounded-lg text-sm font-medium transition-colors min-w-0"
        >
          <LayoutTemplate className="w-4 h-4 text-primary-600 shrink-0" />
          <span className="truncate">{selectedTemplate.name}</span>
        </button>
        <button
          onClick={handleSummarizeRequest}
          title="Tóm tắt lại"
          aria-label="Tóm tắt lại"
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 text-orange-700 bg-orange-50 hover:bg-orange-100 active:bg-orange-200 border border-orange-200 rounded-lg text-sm font-medium transition-colors min-w-0"
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span className="truncate">Tóm tắt lại</span>
        </button>
      </div>

      {/* ------------------- MOBILE TABS ------------------- */}
      <div className="md:hidden flex bg-white border-b sticky top-0 z-10 shrink-0">
        <button onClick={() => setMobileTab('edit')} className={`flex-1 py-3 text-xs font-bold uppercase flex items-center justify-center gap-2 border-b-2 ${mobileTab === 'edit' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>
          <Type className="w-4 h-4" /> Soạn thảo
        </button>
        <button onClick={() => setMobileTab('preview')} className={`flex-1 py-3 text-xs font-bold uppercase flex items-center justify-center gap-2 border-b-2 ${mobileTab === 'preview' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>
          <Eye className="w-4 h-4" /> Xem trước
        </button>
      </div>

      {/* ------------------- BODY LAYOUT ------------------- */}
      <div className="flex-1 flex overflow-hidden">

        <SpeakerSidebar
          speakers={speakers}
          onAddSpeaker={handleAddSpeaker}
          onUpdateSpeakerName={handleUpdateSpeakerName}
          onDeleteSpeaker={handleDeleteSpeaker}
          onViewTranscript={handleViewTranscript}
        />

        {/* MAIN EDITOR AREA */}
        <div className="flex-1 overflow-y-auto bg-slate-100/50 scroll-smooth relative">
          <div className="max-w-3xl mx-auto min-h-full bg-white border-x shadow-sm pb-32">

            {mobileTab === 'edit' && (
              <SegmentList
                segments={segments}
                speakers={speakers}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onTogglePlay={togglePlay}
                onSeek={seekTo}
                onTextChange={handleUpdateText}
                onSpeakerChange={handleChangeSpeaker}
                onSplit={handleSplitSegment}
                onMerge={handleMergeSegment}
                onAddRow={handleAddRow}
                onTimeChange={handleTimeChange}
              />
            )}

            {/* MODE: PREVIEW (Read Only) */}
            {mobileTab === 'preview' && (
              <div className="p-6 md:p-10 prose prose-indigo max-w-none">
                {segments.map((s, i) => {
                  const name = speakers.find(sp => sp.id === s.speakerId)?.name;
                  return (
                    <p key={i} className="mb-4 text-justify">
                      <strong className="text-slate-800">{name}:</strong> {s.text}
                    </p>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ------------------- FOOTER PLAYER ------------------- */}
      <EditorAudioPlayer
        audioSrc={audioSrc}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        playbackRate={playbackRate}
        onTogglePlay={togglePlay}
        onSkip={skipTime}
        onRateChange={togglePlaybackRate}
        onSeek={seekTo}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        onEnded={() => setIsPlaying(false)}
        formatTime={formatTime}
      />

      {/* ------------------- MODALS CŨ ------------------- */}
      {showIntroModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 m-4">
            <div className="flex items-center gap-3 mb-4 text-green-600">
              <Check className="w-8 h-8 p-1 bg-green-100 rounded-full" />
              <h2 className="text-xl font-bold">Sẵn sàng chỉnh sửa!</h2>
            </div>
            <p className="text-slate-600 mb-6">Sử dụng các phím tắt để thao tác nhanh hơn:</p>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 border rounded-lg bg-slate-50">
                <span className="text-xs font-bold text-slate-500 uppercase">Tách câu</span>
                <div className="font-mono text-indigo-600 font-bold mt-1">Enter</div>
              </div>
              <div className="p-3 border rounded-lg bg-slate-50">
                <span className="text-xs font-bold text-slate-500 uppercase">Gộp câu</span>
                <div className="font-mono text-indigo-600 font-bold mt-1">Backspace</div>
              </div>
            </div>
            <button onClick={() => setShowIntroModal(false)} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition">
              Bắt đầu ngay
            </button>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl h-[80vh] rounded-2xl shadow-xl flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg">Xuất văn bản</h3>
              <button onClick={() => setShowExportModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <textarea className="flex-1 p-4 font-mono text-sm resize-none focus:outline-none" readOnly value={exportContent} />
            <div className="p-4 border-t flex justify-end">
              <button onClick={() => { navigator.clipboard.writeText(exportContent); toast.success("Copied!"); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex gap-2"><Copy className="w-4 h-4" /> Copy</button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------- TEMPLATE MANAGER MODAL ------------------- */}
      <TemplateManagerModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSelectTemplate={(template) => {
          setSelectedTemplate(template);
          setShowTemplateModal(false);
        }}
        actionText="Sử dụng mẫu này"
        actionIcon="check"
      />

    </div>
  );
}