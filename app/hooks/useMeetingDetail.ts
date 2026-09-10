"use client";
import { useState, useCallback } from "react";
import { Meeting, generateMeetingShareToken } from "../lib/db";
import type { MeetingTemplate } from "../lib/templates";
import type { Segment, Speaker } from "../lib/db";
import { formatTime } from "../lib/format";

export function useMeetingDetail(
  initialMeeting: Meeting,
  onSummarize?: (m: Meeting, text: string, structure?: string) => void,
  onBack?: () => void,
  toast?: { success: (m: string) => void; info: (m: string) => void; error: (m: string) => void }
) {
  const [meeting, setMeeting] = useState(initialMeeting);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"transcript" | "summary">("transcript");
  const [filteredSpeakerId, setFilteredSpeakerId] = useState<string | null>(null);

  const handleShare = useCallback(async () => {
    let shareId = meeting.shareToken;
    if (!shareId) {
      try {
        shareId = await generateMeetingShareToken(meeting.id);
        setMeeting({ ...meeting, shareToken: shareId });
      } catch (e) {
        console.error("Lỗi sinh share token", e);
        shareId = meeting.id;
      }
    }
    const shareUrl = `${window.location.origin}/share/${shareId}`;
    await navigator.clipboard.writeText(shareUrl);
    toast?.success("Đã copy link chia sẻ: " + shareUrl);
  }, [meeting, toast]);

  const handleSummarizeRequest = useCallback((template: MeetingTemplate) => {
    if (!onSummarize) return;
    const fullText = meeting.segments.map((s: Segment) => {
      const name = meeting.speakers.find((sp: Speaker) => sp.id === s.speakerId)?.name || `Speaker ${s.speakerId.split("_")[1] || "00"}`;
      return `[${formatTime(s.start)}] [${name}]: ${s.text}`;
    }).join("\n");
    onSummarize(meeting, fullText, template.structure);
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
