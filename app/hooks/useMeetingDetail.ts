"use client";
import { meetingEvidence } from "../lib/meeting-evidence";
import { useState, useCallback, useEffect } from "react";
import { Meeting, generateMeetingShareToken } from "../lib/db";
import type { MeetingTemplate } from "../lib/templates";
import { meetingTemplateInstruction } from "../lib/templates";

export type MeetingTab = "transcript" | "summary" | "chat";

export function useMeetingDetail(
  initialMeeting: Meeting,
  onSummarize?: (m: Meeting, text: string, structure?: string, wordTemplate?: MeetingTemplate) => void,
  onBack?: () => void,
  toast?: { success: (m: string) => void; info: (m: string) => void; error: (m: string) => void }
) {
  const [meeting, setMeeting] = useState(initialMeeting);
  useEffect(() => {
    setMeeting(current => ({ ...current, status: initialMeeting.status,
      summaryProgress: initialMeeting.summaryProgress, summary: initialMeeting.summary,
      errorMessage: initialMeeting.errorMessage }));
  }, [initialMeeting.status, initialMeeting.summaryProgress, initialMeeting.summary, initialMeeting.errorMessage]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<MeetingTab>("transcript");
  const [filteredSpeakerId, setFilteredSpeakerId] = useState<string | null>(null);

  const handleShare = useCallback(async () => {
    let shareId = meeting.shareToken;
    if (!shareId) {
      try {
        shareId = await generateMeetingShareToken(meeting.id);
        setMeeting({ ...meeting, shareToken: shareId });
      } catch (e) {
        console.error("Lỗi sinh share token", e);
        toast?.error("Không thể tạo link chia sẻ. Vui lòng thử lại.");
        return;
      }
    }
    const shareUrl = `${window.location.origin}/share/${shareId}`;
    await navigator.clipboard.writeText(shareUrl);
    toast?.success("Đã copy link chia sẻ: " + shareUrl);
  }, [meeting, toast]);

  const handleSummarizeRequest = useCallback((template: MeetingTemplate) => {
    if (!onSummarize) return;
    const fullText = meetingEvidence(meeting, { includeEvidenceIds: false });
    onSummarize(meeting, fullText, meetingTemplateInstruction(template), template);
    toast?.info(`Đang tóm tắt theo mẫu: ${template.name}...`);
    setShowTemplateModal(false);
    onBack?.();
  }, [meeting, onSummarize, toast, onBack]);

  return {
    meeting,
    setMeeting,
    showTemplateModal,
    setShowTemplateModal,
    activeTab,
    setActiveTab,
    filteredSpeakerId,
    setFilteredSpeakerId,
    handleShare,
    handleSummarizeRequest,
  };
}
