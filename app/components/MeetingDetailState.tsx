"use client";

import React, { useCallback, useRef, useState } from "react";
import { Sparkles, FileText as FileIcon, Share2 } from "lucide-react";
import { Meeting } from "../lib/db";
import type { Segment, Speaker } from "../lib/db";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { useMeetingDetail } from "../hooks/useMeetingDetail";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useExport } from "../hooks/useExport";
import TemplateManagerModal from "./TemplateManagerModal";
import DocsFillModal from "./DocsFillModal";
import TranscriptRow from "./TranscriptRow";
import SummaryPanel from "./Meeting/SummaryPanel";
import TabSwitcher from "./Meeting/TabSwitcher";
import SpeakerFilter from "./Meeting/SpeakerFilter";
import MeetingHeader from "./Meeting/Header";
import MeetingAudioPlayer from "./Meeting/AudioPlayer";
import type { MeetingTemplate } from "../lib/templates";

export default function MeetingDetailState({
  meeting: initialMeeting,
  audioSrc,
  onBack,
  onEdit,
  onSummarize,
  isReadOnly = false
}: {
  meeting: Meeting,
  audioSrc: string,
  onBack: () => void,
  onEdit: () => void,
  onSummarize?: (meeting: Meeting, text: string, templateStructure?: string) => void,
  isReadOnly?: boolean;
}) {
  const { toast } = useGlobalUI();
  const [showDocsFill, setShowDocsFill] = useState(false);

  const {
    meeting, setMeeting,
    showTemplateModal, setShowTemplateModal,
    activeTab, setActiveTab,
    filteredSpeakerId, setFilteredSpeakerId,
    handleShare,
    handleSummarizeRequest,
  } = useMeetingDetail(initialMeeting, onSummarize, onBack, toast);

  const {
    audioRef, isPlaying, currentTime, duration, playbackRate,
    setCurrentTime, setDuration,
    togglePlay, seekTo, skipTime, togglePlaybackRate, formatTime,
  } = useAudioPlayer(meeting.duration || 0);

  const { exportTxt, exportDocx, exportPdf, downloadAudio } = useExport(meeting, toast, audioSrc);

  const formatDate = useCallback((ts: number) => new Date(ts).toLocaleDateString("vi-VN"), []);
  const formatDuration = useCallback((sec: number) => formatTime(sec), [formatTime]);

  const segments = meeting.segments || [];
  const speakers = meeting.speakers || [];

  const filteredSegments = filteredSpeakerId
    ? segments.filter((s: Segment) => s.speakerId === filteredSpeakerId)
    : segments;

  const getActiveSpeakerId = (seg: Segment) => {
    const currentSpeaker = speakers.find((s: Speaker) => s.id === seg.speakerId) || speakers[0];
    return currentSpeaker;
  };

  const getActiveWordIndex = (seg: Segment) => {
    if (!isPlaying || !seg.words) return -1;
    return seg.words.findIndex((w: any) => currentTime >= w.start && currentTime <= (w.end + 0.15));
  };

  const handleScrollToSegment = useCallback((time: number) => {
    seekTo(time);
  }, [seekTo]);

  return (
    <div className="flex flex-col h-full bg-slate-50 font-sans text-slate-900">
      <MeetingHeader
        meeting={meeting}
        isReadOnly={isReadOnly}
        showTemplateBtn={!!onSummarize}
        onBack={onBack}
        onEdit={onEdit}
        onOpenTemplateModal={() => setShowTemplateModal(true)}
        onOpenDocsFill={() => setShowDocsFill(true)}
        onShare={handleShare}
        onDownloadAudio={downloadAudio}
        onExportTxt={exportTxt}
        onExportDocx={exportDocx}
        onExportPdf={exportPdf}
        formatDate={formatDate}
        formatDuration={formatDuration}
      />

      {!isReadOnly && (
        <div className="md:hidden bg-white border-b border-slate-200 p-3 grid grid-cols-2 gap-2 shrink-0">
          {!!onSummarize && (
            <button
              onClick={() => setShowTemplateModal(true)}
              title="Tóm tắt lại"
              aria-label="Tóm tắt lại"
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 text-orange-700 bg-orange-50 hover:bg-orange-100 active:bg-orange-200 border border-orange-200 rounded-lg text-sm font-medium transition-colors min-w-0"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="truncate">Tóm tắt lại</span>
            </button>
          )}
          <button
            onClick={() => setShowDocsFill(true)}
            title="Tạo từ template"
            aria-label="Tạo từ template"
            className="flex items-center justify-center gap-1.5 px-2.5 py-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 rounded-lg text-sm font-medium transition-colors min-w-0"
          >
            <FileIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">Tạo từ template</span>
          </button>
          <button
            onClick={handleShare}
            title="Chia sẻ"
            aria-label="Chia sẻ"
            className="col-span-2 flex items-center justify-center gap-1.5 px-2.5 py-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 rounded-lg text-sm font-medium transition-colors"
          >
            <Share2 className="w-4 h-4 shrink-0" />
            <span>Chia sẻ</span>
          </button>
        </div>
      )}

      <TabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 flex overflow-hidden">
        {/* Transcript Panel */}
        <div className={`flex-1 flex flex-col overflow-hidden ${activeTab === "summary" ? "hidden md:flex" : ""}`}>
          {speakers.length > 0 && (
            <SpeakerFilter
              speakers={speakers}
              filteredSpeakerId={filteredSpeakerId}
              onFilterChange={setFilteredSpeakerId}
            />
          )}

          <div className="flex-1 overflow-y-auto pb-24">
            <div className="p-4 md:p-8 space-y-2">
              {filteredSegments.length === 0 && (
                <p className="text-slate-400 text-center py-10">Chưa có nội dung transcript.</p>
              )}
              {filteredSegments.map((seg: Segment) => {
                const currentSpeaker = getActiveSpeakerId(seg);
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
                    onTogglePlay={togglePlay}
                    onSeek={seekTo}
                    onTextChange={() => {}}
                    onSpeakerChange={() => {}}
                    onSplit={() => {}}
                    onMerge={() => {}}
                    onAddRow={() => {}}
                    onTimeChange={() => {}}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary Panel */}
        <SummaryPanel
          meeting={meeting}
          isReadOnly={isReadOnly}
          activeTab={activeTab}
          onEdit={onEdit}
          onScrollToSegment={handleScrollToSegment}
        />
      </div>

      {/* Audio Player Footer */}
      <MeetingAudioPlayer
        audioRef={audioRef}
        audioSrc={audioSrc}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        playbackRate={playbackRate}
        onTogglePlay={togglePlay}
        onSkip={skipTime}
        onRateChange={togglePlaybackRate}
        onSeek={seekTo}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => togglePlay()}
        formatTimeCode={formatTime}
      />

      <TemplateManagerModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSelectTemplate={(template: MeetingTemplate) => {
          handleSummarizeRequest(template);
          setShowTemplateModal(false);
        }}
        actionText="Sử dụng mẫu này"
        actionIcon="sparkles"
      />

      <DocsFillModal
        isOpen={showDocsFill}
        onClose={() => setShowDocsFill(false)}
        context={{
          summary: meeting.summary || undefined,
          speakers: (meeting.speakers || []).map((s) => s.name),
          objectives: meeting.objectives || undefined,
        }}
      />
    </div>
  );
}
