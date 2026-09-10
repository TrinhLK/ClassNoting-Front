"use client";
import { useState, useCallback } from "react";
import { uploadAudioToFirebase, startTranscriptionJob } from "../lib/api";
import { saveMeeting, type Meeting } from "../lib/db";
import { MEETING_STATUS } from "../lib/constants";
import type { User } from "firebase/auth";

export function useUpload(
  user: User | null,
  toast: { success: (msg: string) => void; error: (msg: string) => void }
) {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const uploadFile = useCallback(
    async (
      file: File,
      language: "vi" | "en",
      title?: string,
      objectives?: string,
      onSuccess?: () => void
    ) => {
      if (!user) {
        toast.error("Vui lòng đăng nhập!");
        return;
      }
      const tempId = crypto.randomUUID();
      setUploadProgress(0);
      try {
        const url = await uploadAudioToFirebase(file, user.uid, (progress) => {
          setUploadProgress(progress);
        });
        setUploadProgress(null);
        const jobId = await startTranscriptionJob(url, language);

        const newMeeting: Meeting = {
          id: tempId,
          userId: user.uid,
          jobId,
          jobStartedAt: Date.now(),
          title: title?.trim() || file.name.replace(/\.[^/.]+$/, ""),
          createdAt: Date.now(),
          duration: 0,
          audioUrl: url,
          segments: [],
          speakers: [],
          status: MEETING_STATUS.TRANSCRIBING,
          isDeleted: false,
          language,
          objectives: objectives?.trim() || undefined,
        };

        await saveMeeting(newMeeting);
        toast.success("Đã gửi yêu cầu xử lý! Hệ thống sẽ tự động cập nhật.");
        onSuccess?.();
      } catch (error) {
        console.error("Lỗi upload:", error);
        toast.error("Có lỗi xảy ra: " + (error as Error).message);
        setUploadProgress(null);
      }
    },
    [user, toast]
  );

  const resetProgress = useCallback(() => setUploadProgress(null), []);

  return { uploadProgress, uploadFile, resetProgress };
}
