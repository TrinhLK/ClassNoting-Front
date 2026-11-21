"use client";
import { useCallback } from "react";
import type { MeetingTemplate } from "../lib/templates";
import { Meeting, updateMeetingProcess } from "../lib/db";
import { MEETING_STATUS } from "../lib/constants";
import { uploadAudioToFirebase, requestSummary } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { meetingAiSessionId } from "../lib/ai-session";
import { deleteFieldValue } from "../lib/utils/firestore";

// Shared across hook instances/remounts in this tab while a report is in flight.
const activeSummaries = new Set<string>();

export function useSummarize(onRefresh?: () => void) {
  const { user } = useAuth();
  const { toast } = useGlobalUI();

  return useCallback(async (
    meeting: Meeting,
    transcriptText: string,
    templateStructure?: string,
    wordTemplate?: MeetingTemplate
  ) => {
    const operationKey = `${user?.uid}:${meeting.id}`;
    if (activeSummaries.has(operationKey)) {
      toast.info("Đang tóm tắt cuộc họp này. Vui lòng đợi kết quả.");
      return;
    }
    activeSummaries.add(operationKey);
    try {
    const isDraft = meeting.status === MEETING_STATUS.DRAFT;
    const meetingId = meeting.id;
    const operationId = crypto.randomUUID();
    const startedAt = Date.now();
    const progress = (stage: import('../lib/summary-progress').SummaryStage) => ({
      operationId, stage, startedAt, updatedAt: Date.now(), templateName: wordTemplate?.name || 'Họp Tổng Quát (Mặc định)',
    });

    if (isDraft) {
      toast.info("Đang đồng bộ bản nháp lên Cloud trước khi tóm tắt...");
      try {
        const { getDraftFull } = await import("../lib/indexedDB");
        const draftFull = await getDraftFull(meetingId);
        if (draftFull) {
          const file = new File(
            [draftFull.audioBlob],
            `${draftFull.meta.title}.webm`,
            { type: "audio/webm" }
          );
          const url = await uploadAudioToFirebase(file, user?.uid || "");

          const finalMeeting = {
            ...draftFull.meta,
            audioUrl: url,
            status: MEETING_STATUS.SUMMARIZING,
            summaryProgress: progress('preparing'),
            jobId: undefined,
          };
          const { saveMeeting } = await import("../lib/db");
          await saveMeeting(finalMeeting);
        }
      } catch (err) {
        toast.error("Lỗi đồng bộ bản nháp: " + (err as Error).message);
        return;
      }
    } else {
      await updateMeetingProcess(meetingId, { status: MEETING_STATUS.SUMMARIZING, summaryProgress: progress('preparing') });
    }

    onRefresh?.();

    try {
      const summary = await requestSummary(
        transcriptText,
        meetingAiSessionId("summary", meetingId),
        templateStructure,
        meeting.objectives,
        meeting.createdAt,
        meeting.duration,
        operationId
      );

      await updateMeetingProcess(meetingId, { summaryProgress: progress('saving') });
      await updateMeetingProcess(meetingId, {
        status: MEETING_STATUS.COMPLETED,
        summaryProgress: progress('completed'),
        summary: summary,
        summaryWordTemplate: wordTemplate?.wordSource || deleteFieldValue(),
        summaryDocx: deleteFieldValue(),
        summaryNeedsReview: false,
        errorMessage: deleteFieldValue<string>(),
      });

      if (isDraft) {
        try {
          const { deleteDraft } = await import("../lib/indexedDB");
          await deleteDraft(meetingId);
        } catch (cleanupErr) {
          console.warn("Không thể xóa draft local:", cleanupErr);
        }
      }

      toast.success(`Đã tóm tắt xong cuộc họp!`);
    } catch (error: any) {
      if (error.code === "AI_MEETING_BUSY" || error.status === 409) {
        toast.info(error.message || "Cuộc họp đang được xử lý. Vui lòng đợi kết quả.");
        return;
      }
      console.error("[summarize] failed:", {
        meetingId,
        status: error.status,
        message: error.message,
        name: error.name,
        stack: error.stack,
      });

      await updateMeetingProcess(meetingId, {
        status: !isDraft && meeting.summary?.trim() ? MEETING_STATUS.COMPLETED
          : [402, 409].includes(error.status) && !isDraft ? meeting.status : MEETING_STATUS.FAILED,
        errorMessage: error.message,
        summaryProgress: progress('failed'),
      });

      let userMessage: string;
      if (error.status === 429) {
        userMessage = "Đang quá tải (429). Đợi 30 giây rồi thử lại.";
      } else if (error.status === 400) {
        userMessage = "Transcript trống hoặc không hợp lệ. Không thể tóm tắt.";
      } else if (error.status === 503 || error.status === 502 || error.status === 504) {
        userMessage = error.message || "Server AI tạm thời không khả dụng. Thử lại sau ít phút.";
      } else if (error.name === "AbortError") {
        userMessage = "Quá thời gian chờ (7 phút). Mạng chậm hoặc model bận. Thử lại sau.";
      } else if (typeof navigator !== "undefined" && !navigator.onLine) {
        userMessage = "Mất kết nối mạng. Kiểm tra và thử lại.";
      } else {
        userMessage = `Lỗi tóm tắt: ${error.message}`;
      }
      toast.error(userMessage);
    } finally {
      onRefresh?.();
    }
    } finally {
      activeSummaries.delete(operationKey);
    }
  }, [user, toast, onRefresh]);
}
