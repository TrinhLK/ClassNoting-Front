"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RefinementControl from "./Meeting/RefinementControl";
import { Sparkles, FileText as FileIcon, Share2, AlignLeft, MessageSquare, AlertTriangle, History } from "lucide-react";
import { Meeting, updateMeetingProcess } from "../lib/db";
import type { Segment, Speaker, ChatMessage } from "../lib/db";
import { MEETING_STATUS } from "../lib/constants";
import { getReprocessBackup, clearReprocessBackup } from "../lib/reprocessBackup";
import { deleteFieldValue } from "../lib/utils/firestore";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { useMeetingDetail } from "../hooks/useMeetingDetail";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useExport } from "../hooks/useExport";
import TemplateManagerModal from "./TemplateManagerModal";
import DocsFillModal from "./DocsFillModal";
import TranscriptRow from "./TranscriptRow";
import SummaryPanel from "./Meeting/SummaryPanel";
import TabSwitcher from "./Meeting/TabSwitcher";
import ChatPanel, { formatChatTime } from "./Meeting/ChatPanel";
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
  const [hasReprocessBackup, setHasReprocessBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const {
    meeting, setMeeting,
    showTemplateModal, setShowTemplateModal,
    activeTab, setActiveTab,
    filteredSpeakerId, setFilteredSpeakerId,
    handleShare,
    handleSummarizeRequest,
  } = useMeetingDetail(initialMeeting, onSummarize, onBack, toast);

  useEffect(() => {
    setHasReprocessBackup(getReprocessBackup(initialMeeting.id) !== null);
  }, [initialMeeting.id, meeting.status]);

  const handleRestoreBackup = useCallback(async () => {
    const backup = getReprocessBackup(initialMeeting.id);
    if (!backup) {
      toast.error("Không tìm thấy bản sao lưu trên trình duyệt này.");
      return;
    }
    setIsRestoring(true);
    try {
      const restored: Meeting = {
        ...meeting,
        segments: backup.segments,
        speakers: backup.speakers,
        summary: backup.summary,
        status: backup.status,
      };
      await updateMeetingProcess(meeting.id, {
        segments: backup.segments,
        speakers: backup.speakers,
        summary: backup.summary ?? deleteFieldValue<string | undefined>(),
        errorMessage: deleteFieldValue<string | undefined>(),
        jobId: deleteFieldValue<string | undefined>(),
        status: backup.status,
      });
      clearReprocessBackup(meeting.id);
      setMeeting(restored);
      setHasReprocessBackup(false);
      toast.success("Đã khôi phục bản trước khi xử lý lại.");
    } catch (err) {
      toast.error("Khôi phục thất bại: " + (err as Error).message);
    } finally {
      setIsRestoring(false);
    }
  }, [initialMeeting.id, meeting, setMeeting, toast]);

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
  const chatMessages = useMemo(() => meeting.chatMessages || [], [meeting.chatMessages]);
  const hasChat = chatMessages.length > 0;

  const filteredSegments = filteredSpeakerId
    ? segments.filter((s: Segment) => s.speakerId === filteredSpeakerId)
    : segments;

  // Timeline gộp: transcript + mốc chat theo thời gian (chat timestamp ms → giây)
  type TimelineItem =
    | { kind: "segment"; seg: Segment }
    | { kind: "chat"; msg: ChatMessage };
  const timeline: TimelineItem[] = useMemo(() => {
    if (!hasChat) return filteredSegments.map((seg) => ({ kind: "segment" as const, seg }));
    const items: TimelineItem[] = [
      ...filteredSegments.map((seg) => ({ kind: "segment" as const, seg })),
      ...chatMessages.map((msg) => ({ kind: "chat" as const, msg })),
    ];
    const timeOf = (it: TimelineItem) =>
      it.kind === "segment" ? it.seg.start : (it.msg.timestamp - meeting.createdAt) / 1000;
    return items.sort((a, b) => timeOf(a) - timeOf(b));
  }, [filteredSegments, chatMessages, hasChat]);

  const showChatPanel = activeTab === "chat";

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
      {!isReadOnly && <RefinementControl meeting={meeting} onUpdate={setMeeting} />}
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

      {meeting.status === MEETING_STATUS.FAILED && (
        <div className="mx-4 md:mx-8 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 shrink-0" role="alert">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-800">Xử lý thất bại</p>
            {meeting.errorMessage && (
              <p className="text-sm text-red-700 mt-1 break-words">{meeting.errorMessage}</p>
            )}
            {hasReprocessBackup && !isReadOnly && (
              <button
                onClick={handleRestoreBackup}
                disabled={isRestoring}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-white hover:bg-red-100 border border-red-300 rounded-lg transition-colors disabled:opacity-50"
              >
                <History className="w-4 h-4" />
                {isRestoring ? "Đang khôi phục..." : "Khôi phục bản trước khi xử lý lại"}
              </button>
            )}
          </div>
        </div>
      )}

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

      <TabSwitcher activeTab={activeTab} onTabChange={setActiveTab} showChat={hasChat} />

      <div className="flex-1 flex overflow-hidden">
        {/* Transcript / Chat Panel */}
        <div className={`flex-1 flex-col overflow-hidden ${activeTab === "summary" ? "hidden md:flex" : "flex"}`}>
          {hasChat && (
            <div className="hidden md:flex items-center gap-1 p-2 px-4 bg-white border-b border-slate-200 shrink-0">
              <button
                onClick={() => setActiveTab("transcript")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!showChatPanel ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
              >
                <AlignLeft className="w-3.5 h-3.5" /> Nội dung
              </button>
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${showChatPanel ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> Chat ({chatMessages.length})
              </button>
            </div>
          )}
          {speakers.length > 0 && !showChatPanel && (
            <SpeakerFilter
              speakers={speakers}
              filteredSpeakerId={filteredSpeakerId}
              onFilterChange={setFilteredSpeakerId}
            />
          )}

          <div className="flex-1 overflow-y-auto pb-24">
            {showChatPanel ? (
              <ChatPanel messages={chatMessages} stats={meeting.chatStats} />
            ) : (
              <div className="p-4 md:p-8 space-y-2">
                {timeline.length === 0 && (
                  <p className="text-slate-400 text-center py-10">Chưa có nội dung transcript.</p>
                )}
                {timeline.map((item) => {
                  if (item.kind === "chat") {
                    const m = item.msg;
                    return (
                      <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100 text-xs">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-bold text-emerald-800 shrink-0">💬 {formatChatTime(m.timestamp)} · {m.sender}:</span>
                        <span className="text-slate-700 break-words min-w-0">{m.text}</span>
                      </div>
                    );
                  }
                  const seg = item.seg;
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
            )}
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
