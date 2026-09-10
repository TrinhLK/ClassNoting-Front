"use client";
import { useCallback } from "react";
import { Meeting, updateMeetingProcess } from "../lib/db";
import { MEETING_STATUS } from "../lib/constants";
import { uploadAudioToFirebase, requestSummary } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { meetingAiSessionId } from "../lib/ai-session";

export function useSummarize(onRefresh?: () => void) {
  const { user } = useAuth();
  const { toast } = useGlobalUI();

  return useCallback(async (
    meeting: Meeting,
    transcriptText: string,
    templateStructure?: string
  ) => {
    const isDraft = meeting.status === MEETING_STATUS.DRAFT;
    const meetingId = meeting.id;

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
      await updateMeetingProcess(meetingId, { status: MEETING_STATUS.SUMMARIZING });
    }

    onRefresh?.();

    try {
      const summary = await requestSummary(
        transcriptText,
        meetingAiSessionId("summary", meetingId),
        templateStructure,
        meeting.objectives,
        meeting.createdAt,
        meeting.duration
      );

      await updateMeetingProcess(meetingId, {
        status: MEETING_STATUS.COMPLETED,
        summary: summary,
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
      console.error("[summarize] failed:", {
        meetingId,
        status: error.status,
        message: error.message,
        name: error.name,
        stack: error.stack,
      });

      await updateMeetingProcess(meetingId, {
        status: MEETING_STATUS.FAILED,
        errorMessage: error.message,
      });

      let userMessage: string;
      if (error.status === 429) {
        userMessage = "Đang quá tải (429). Đợi 30 giây rồi thử lại.";
      } else if (error.status === 400) {
        userMessage = "Transcript trống hoặc không hợp lệ. Không thể tóm tắt.";
      } else if (error.status === 503 || error.status === 502 || error.status === 504) {
        userMessage = "Server AI tạm thời không khả dụng. Thử lại sau ít phút.";
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
  }, [user, toast, onRefresh]);
}
