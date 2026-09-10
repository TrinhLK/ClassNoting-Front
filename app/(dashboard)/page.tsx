"use client";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardState from "../components/DashboardState";
import DriveImportModal from "../components/DriveImportModal";
import BotJoinModal from "../components/BotJoinModal";
import {
  seedInitialData,
  Meeting,
  updateMeetingProcess,
  saveMeeting,
} from "../lib/db";
import { MEETING_STATUS } from "../lib/constants";
import { uploadAudioToFirebase, startTranscriptionJob } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { deleteFieldValue } from "../lib/utils/firestore";

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useGlobalUI();
  const router = useRouter();
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isBotModalOpen, setIsBotModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const triggerRefresh = useCallback(() => {
    setRefreshSignal((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const handler = () => triggerRefresh();
    window.addEventListener('dashboard-refresh', handler);
    return () => window.removeEventListener('dashboard-refresh', handler);
  }, [triggerRefresh]);

  const handleFileUpload = useCallback(
    async (file: File, language: "vi" | "en" = "vi", title?: string, objectives?: string) => {
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
          jobId: jobId,
          jobStartedAt: Date.now(),
          title: title?.trim() || file.name.replace(/\.[^/.]+$/, ""),
          createdAt: Date.now(),
          duration: 0,
          audioUrl: url,
          segments: [],
          speakers: [],
          status: MEETING_STATUS.TRANSCRIBING,
          isDeleted: false,
          language: language,
          objectives: objectives?.trim() || undefined,
        };

        await saveMeeting(newMeeting);
        toast.success("Đã gửi yêu cầu xử lý! Hệ thống sẽ tự động cập nhật.");
        triggerRefresh();
      } catch (error) {
        console.error("Lỗi upload:", error);
        toast.error("Có lỗi xảy ra: " + (error as Error).message);
        setUploadProgress(null);
      }
    },
    [user, toast, triggerRefresh]
  );

  const handleStartDemo = useCallback(async () => {
    if (!user) return;
    await seedInitialData(user.uid);
    triggerRefresh();
    toast.success("Đã tạo dữ liệu mẫu!");
  }, [user, triggerRefresh, toast]);

  const handleReprocess = useCallback(
    async (meeting: Meeting) => {
      if (!user) return toast.error("Vui lòng đăng nhập!");
      if (!meeting.audioUrl) {
        toast.error("Không có file âm thanh để xử lý lại!");
        return;
      }
      try {
        toast.info("Đang gửi lệnh xử lý lại...");
        const newJobId = await startTranscriptionJob(
          meeting.audioUrl,
          meeting.language ?? "vi"
        );
        await updateMeetingProcess(meeting.id, {
          status: MEETING_STATUS.TRANSCRIBING,
          jobId: newJobId,
          jobStartedAt: Date.now(),
          segments: [],
          summary: deleteFieldValue(),
          errorMessage: deleteFieldValue(),
        });
        triggerRefresh();
        toast.success("Đã bắt đầu xử lý lại!");
      } catch (e) {
        console.error(e);
        toast.error("Lỗi khi xử lý lại: " + (e as Error).message);
      }
    },
    [user, toast, triggerRefresh]
  );

  return (
    <>
      <DashboardState
        refreshSignal={refreshSignal}
        onImport={handleFileUpload}
        onUseSample={handleStartDemo}
        onLive={(lang, title, objectives) => {
          const params = new URLSearchParams();
          if (lang) params.set("lang", lang);
          if (title) params.set("title", title);
          if (objectives) params.set("objectives", objectives);
          router.push(`/live?${params.toString()}`);
        }}
        onOpenMeeting={(m) => router.push(`/meeting/${m.id}`)}
        onReprocess={handleReprocess}
        onOpenDrive={() => setIsDriveModalOpen(true)}
        onOpenBot={() => setIsBotModalOpen(true)}
      />

      <DriveImportModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onImportSuccess={triggerRefresh}
      />
      <BotJoinModal
        isOpen={isBotModalOpen}
        onClose={() => setIsBotModalOpen(false)}
        onUpdate={triggerRefresh}
      />

      {uploadProgress !== null && (
        <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-72 md:w-80 p-5">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-8 h-8 flex-shrink-0 border-2 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
              <div className="flex-1">
                <h3 className="text-slate-800 font-bold text-sm">Đang tải file lên...</h3>
                <p className="text-slate-500 text-xs">Vui lòng không tắt trang</p>
              </div>
              <div className="text-sm font-bold text-indigo-600">{uploadProgress}%</div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
              <div
                className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full transition-all duration-300 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
