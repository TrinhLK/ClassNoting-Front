"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { Sparkles, AlignLeft, AlertCircle } from "lucide-react";
import { requestSegmentSummary, uploadAudioToFirebase } from "../lib/api";
import { saveMeeting, createLiveSession, updateLiveSession, endLiveSession } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import useLocalTranscription from "../hooks/useLocalTranscription";
import { useGlobalUI } from "../context/GlobalUIProvider";
import LiveControls from "./Live/Controls";
import LiveHeader from "./Live/Header";
import LiveStatusBar from "./Live/StatusBar";
import TranscriptView from "./Live/TranscriptView";
import LVSummaryPanel from "./Live/LVSummaryPanel";
import { MEETING_STATUS } from "../lib/constants";
import { createAiSessionId } from "../lib/ai-session";

type SummaryItem = {
  id: number;
  content: string;
  isLoading: boolean;
  timestamp?: number;
};

interface MobileTabBtnProps {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const MobileTabBtn = ({ active, onClick, icon: Icon, label }: MobileTabBtnProps) => (
  <button
    onClick={onClick}
    className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 rounded-lg transition-all ${active ? "bg-white text-indigo-600 shadow-sm border border-slate-200" : "text-slate-500 hover:bg-slate-100"
      }`}
  >
    <Icon className="w-4 h-4" /> {label}
  </button>
);

export default function LiveRecordingState({
  onFinish, onBack, initialLanguage = "vi", initialTitle, initialObjectives
}: {
  onFinish: () => void,
  onBack: () => void,
  initialLanguage?: "vi" | "en",
  initialTitle?: string,
  initialObjectives?: string
}) {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [timer, setTimer] = useState(0);
  const [volume, setVolume] = useState(0);
  const [mobileTab, setMobileTab] = useState<'transcript' | 'summary'>('transcript');
  const [isUploading, setIsUploading] = useState(false);
  const [language, setLanguage] = useState<"vi" | "en">(initialLanguage);
  const [remainingMinutesWarning, setRemainingMinutesWarning] = useState<number | null>(null);
  const [meetingTitle, setMeetingTitle] = useState(initialTitle || `Cuộc họp trực tiếp ${new Date().toLocaleDateString('vi-VN')}`);
  const [objectives, setObjectives] = useState(initialObjectives || "");

  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const liveSessionIdRef = useRef<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      console.warn(`Wake Lock error: ${err}`);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().then(() => {
        wakeLockRef.current = null;
      });
    }
  }, []);

  const { toast, confirm } = useGlobalUI();
  const isSizeWarningShownRef = useRef(false);


  const [captureSystemAudio, setCaptureSystemAudio] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("captureSystemAudio");
    if (saved === "true") setCaptureSystemAudio(true);
  }, []);

  const toggleCaptureSystemAudio = useCallback(() => {
    setCaptureSystemAudio(prev => {
      const newValue = !prev;
      localStorage.setItem("captureSystemAudio", String(newValue));
      return newValue;
    });
  }, []);

  const summariesEndRef = useRef<HTMLDivElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);

  // Refs for Audio Mixing
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sysStreamRef = useRef<MediaStream | null>(null);

  // --- LOGIC TÓM TẮT THÔNG MINH ---
  const bufferTextRef = useRef("");
  // Independent of the public live-share ID; retained across pause/resume.
  const aiSessionIdRef = useRef<string | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wordCountRef = useRef(0);

  const isInterimActiveRef = useRef(false);

  // 1. Hàm gọi API tóm tắt
  const flushBuffer = useCallback(async (force: boolean = false) => {
    const content = bufferTextRef.current.trim();
    const minWords = force ? 2 : 10; // Giảm ngưỡng tối thiểu xuống 10 từ cho nhạy

    if (wordCountRef.current < minWords) return;

    if (!force && isInterimActiveRef.current) {
      // Hẹn giờ check lại sau 2s
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => flushBuffer(false), 2000);
      return;
    }


    // UI Loading
    const currentId = Date.now();
    const currentTimer = latestStateRef.current.timer; // Dùng ref để tránh stale closure khi setTimeout gọi
    const previewText = content.length > 50 ? content.substring(0, 50) + "..." : content;
    setSummaries(prev => [...prev, {
      id: currentId,
      content: `⏳ Đang xử lý: "${previewText}"`,
      isLoading: true,
      timestamp: currentTimer // Lưu lại mốc thời gian
    }]);

    // Reset Buffer
    const textToProcess = content;
    bufferTextRef.current = "";
    wordCountRef.current = 0;

    try {
      const sessionId = aiSessionIdRef.current ??= createAiSessionId("live");
      const summary = await requestSegmentSummary(textToProcess, sessionId);
      if (aiSessionIdRef.current !== sessionId) return;
      setSummaries(prev => prev.map(item =>
        item.id === currentId
          ? { ...item, content: summary || "Không có nội dung chính.", isLoading: false }
          : item
      ));
    } catch (e) {
      setSummaries(prev => prev.filter(item => item.id !== currentId));
    }
  }, []);

  const handleDeepgramFinal = useCallback(({ speaker, content }: { speaker: number; content: string }) => {
    const formattedLine = `Speaker ${speaker}: ${content}`;
    bufferTextRef.current += (bufferTextRef.current ? "\n" : "") + formattedLine;

    const newWords = content.trim().split(/\s+/).length;
    wordCountRef.current += newWords;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    // RULE 3: Tràn ly (>80 từ) -> Ép tóm tắt ngay
    if (wordCountRef.current > 80) {
      flushBuffer(true);
      return;
    }

    // [TINH CHỈNH TIMEOUT] 
    // - Đủ 30 từ -> Chờ 2s (Siêu nhanh)
    // - Ít từ -> Chờ 3s (Nhanh hơn nhiều so với 10s cũ)
    // Lý do: Nếu người ta đã ngắt lời 3s nghĩa là hết ý rồi, tóm tắt luôn đi.
    const isLongText = wordCountRef.current >= 30;
    const timeoutMs = isLongText ? 2000 : 3000;

    silenceTimerRef.current = setTimeout(() => {
      // Hết giờ chờ -> Gọi hàm flush
      // Lưu ý: Trong flushBuffer đã có logic check isInterimActiveRef để hoãn nếu cần
      flushBuffer();
    }, timeoutMs);
  }, [flushBuffer]);

  const { segments, interimContent, isListening, connectionError, startListening, stopListening, resetTranscript } = useLocalTranscription(handleDeepgramFinal);


  useEffect(() => {
    const hasInterim = interimContent && interimContent.trim().length > 0;
    isInterimActiveRef.current = !!hasInterim;
  }, [interimContent]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isListening) {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isListening]);

  // --- AUTO-SAVE LOGIC (ZIPFORMER BRANCH) ---
  const draftIdRef = useRef<string>(crypto.randomUUID());
  const lastSavedChunkIndexRef = useRef(0);

  // UseRef để access state mới nhất trong setInterval (tránh closure stale)
  const latestStateRef = useRef({ segments, summaries, timer, isListening: false });
  useEffect(() => {
    latestStateRef.current = { segments, summaries, timer, isListening };
  }, [segments, summaries, timer, isListening]);

  // Setup Auto-save Loop
  useEffect(() => {
    const interval = setInterval(async () => {
      // Chỉ save nếu đang nghe HOẶC có dữ liệu
      if (!latestStateRef.current.isListening && latestStateRef.current.timer === 0) return;

      try {
        // A. Save Metadata
        const { segments, summaries, timer } = latestStateRef.current;

        // Map segments sang format chuẩn DB
        let finalSegments = segments.map((s, idx) => ({
          id: `seg_${idx}`,
          start: s.words?.[0]?.start || 0,
          end: s.words?.[s.words.length - 1]?.end || 0,
          text: s.content,
          speakerId: `SPEAKER_${String(s.speaker).padStart(2, '0')}`,
          words: s.words || []
        }));

        const finalSummary = summaries
          .filter(s => !s.isLoading)
          .map(s => `[${formatTime(s.timestamp || 0)}] ${s.content}`)
          .join("\n\n");

        const payloadSize = new Blob([JSON.stringify({ segments: finalSegments, summary: finalSummary })]).size;

        let sizeForCalculation = payloadSize;
        let bytesPerMinute = 15000; // Tốc độ tiêu thụ mặc định (có mảng words)
        let isLightMode = false;

        // Nếu dung lượng thật chạm ngưỡng 850KB, tự động bỏ mảng words (light mode)
        // - Vừa dùng để tính sizeForCalculation/remainingMinutes chuẩn
        // - VỪA dùng để save thực tế (tránh Firestore vượt 1MB)
        if (payloadSize > 850000) {
          isLightMode = true;
          const stripped = finalSegments.map(s => {
            const { words: _words, ...rest } = s;
            return rest;
          });
          finalSegments = stripped as typeof finalSegments;
          sizeForCalculation = new Blob([JSON.stringify({ segments: finalSegments, summary: finalSummary })]).size;
          bytesPerMinute = 3000; // Tốc độ tiêu thụ bộ nhớ siêu thấp khi chỉ chỉ lưu Text
        }

        const remainingBytes = 1048576 - sizeForCalculation; // Giới hạn 1MB
        const remainingMinutes = Math.max(0, Math.floor(remainingBytes / bytesPerMinute));

        setRemainingMinutesWarning(remainingMinutes > 999 ? 999 : remainingMinutes);

        if (isLightMode && !isSizeWarningShownRef.current) {
          isSizeWarningShownRef.current = true;
          toast.warning(`Dung lượng lớn: Hệ thống đã tự động tắt hiệu ứng đổi màu chữ chạy theo giọng nói để tiết kiệm bộ nhớ. Bạn có thể yên tâm thu âm thêm khoảng ${remainingMinutes} phút nữa!`);
        }

        const { saveDraftMeta, appendAudioChunks } = await import("../lib/indexedDB");

        await saveDraftMeta({
          id: draftIdRef.current,
          userId: user?.uid,
          title: meetingTitle.trim() || `Bản nháp ${new Date().toLocaleString('vi-VN')}`,
          createdAt: Date.now(),
          duration: timer,
          segments: finalSegments,
          summary: finalSummary,
          speakers: [{ id: "SPEAKER_00", name: "Người nói (Live)", color: "bg-indigo-50 text-indigo-700" }],
          isDeleted: false,
          objectives: objectives.trim() || undefined
        });

        if (liveSessionIdRef.current) {
          await updateLiveSession(
            liveSessionIdRef.current,
            finalSegments,
            finalSummary
          );
        }

        // B. Save Audio Chunks (Incremental)
        const currentChunks = audioChunksRef.current;
        const newChunks = currentChunks.slice(lastSavedChunkIndexRef.current);

        if (newChunks.length > 0) {
          await appendAudioChunks(draftIdRef.current, newChunks);
          lastSavedChunkIndexRef.current = currentChunks.length;
        }

        if (currentChunks.length > 100) {
          audioChunksRef.current = [];
          lastSavedChunkIndexRef.current = 0;
        }

      } catch (e) {
        console.error("Auto-save failed:", e);
      }
    }, 5000); // 5s

    return () => clearInterval(interval);
  }, [user]);

  // -----------------------------------------------------------
  // 👇👇👇 CHÈN CODE CẢNH BÁO TẮT TAB TẠI ĐÂY 👇👇👇
  // -----------------------------------------------------------
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Logic: Nếu đang ghi âm (isListening) HOẶC đã có nội dung (segments > 0)
      // thì chặn người dùng tắt tab
      if (isListening || segments.length > 0) {
        e.preventDefault();
        e.returnValue = ''; // Dòng này bắt buộc để hiện popup trên Chrome/Edge
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup function: Gỡ sự kiện khi component bị hủy (để tránh lỗi memory leak)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isListening, segments]);
  // -----------------------------------------------------------

  // --- UI Stuff (Giữ nguyên) ---
  useEffect(() => { if (mobileTab === 'summary') summariesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [summaries, mobileTab]);
  useEffect(() => { if (mobileTab === 'transcript') transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [segments, interimContent, mobileTab]);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isListening) interval = setInterval(() => setTimer(t => t + 1), 1000);
    return () => { if (interval !== null) clearInterval(interval); };
  }, [isListening]);
  const setupVisualizer = useCallback((stream: MediaStream) => {
    let audioCtx = audioContextRef.current;
    if (!audioCtx || audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const ctx = audioCtx!;
    const analyzer = ctx.createAnalyser();
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyzer);
    analyzer.fftSize = 32;
    const dataArray = new Uint8Array(analyzer.frequencyBinCount);

    // Cancel old animation
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    const updateVolume = () => {
      analyzer.getByteFrequencyData(dataArray);
      let sum = 0; for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      setVolume(sum / dataArray.length);
      animationRef.current = requestAnimationFrame(updateVolume);
    };
    updateVolume();
  }, []);

  const handeFullStop = useCallback(() => {
    releaseWakeLock();

    if (liveSessionIdRef.current) {
      endLiveSession(liveSessionIdRef.current).catch(e => console.error(e));
    }

    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;

    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(e => console.error(e));
      audioContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (sysStreamRef.current) {
      sysStreamRef.current.getTracks().forEach(track => track.stop());
      sysStreamRef.current = null;
    }
  }, [releaseWakeLock]);

  const startRecordingSession = useCallback(async () => {
    try {
      // [CASE 1] NẾU ĐANG PAUSE -> RESUME LẠI
      const existingRecorder = mediaRecorderRef.current;
      const existingStream = streamRef.current;
      const isPaused = !!(existingStream && existingRecorder && existingRecorder.state === "paused");
      const wasHybrid = !!sysStreamRef.current;
      const modeChanged = isPaused && wasHybrid !== captureSystemAudio;

      if (isPaused && !modeChanged && existingRecorder && existingStream) {
        // Same mode, resume paused recorder với stream cũ
        existingRecorder.resume();
        const tracks = existingStream.getTracks();
        if (tracks.some(t => t.readyState === 'ended')) {
          console.warn("Tracks ended unexpectedly, restarting stream...");
          handeFullStop();
          // Fall through to Case 2
        } else {
          startListening(existingStream, timer, language);
          setupVisualizer(existingStream);
          return;
        }
      } else if (modeChanged) {
        // User đã toggle captureSystemAudio trong lúc pause → cần cấp lại stream với mode mới
        console.log(`Mode changed during pause (was ${wasHybrid ? 'hybrid' : 'mic-only'}, now ${captureSystemAudio ? 'hybrid' : 'mic-only'}). Re-acquiring stream.`);
        handeFullStop();
        // Fall through to Case 2
      }

      // [CASE 2] NẾU LÀ LẦN ĐẦU -> KHỞI TẠO MỚI

      if (!liveSessionIdRef.current && user) {
        const newSessionId = `live-${crypto.randomUUID().substring(0, 8)}`;
        setLiveSessionId(newSessionId);
        liveSessionIdRef.current = newSessionId;

        await createLiveSession({
          id: newSessionId,
          hostId: user.uid,
          title: meetingTitle.trim() || `Live Meeting ${new Date().toLocaleString('vi-VN')}`,
          language: language,
          segments: [],
          summary: "",
          status: "live",
          startedAt: Date.now()
        });
      }

      let finalStream: MediaStream;

      if (!captureSystemAudio) {
        // --- NORMAL MODE (Mic Only) ---
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        finalStream = stream;
      } else {
        // --- HYBRID MODE (Mic + System) ---
        // 1. Get System Audio (Tab/Screen)
        const sysStream = await navigator.mediaDevices.getDisplayMedia({
          video: true, // Required to get audio prompt
          audio: true // Start with system audio request
        });

        // Check if user actually shared audio
        const sysAudioTrack = sysStream.getAudioTracks()[0];
        if (!sysAudioTrack) {
          toast.warning("Bạn chưa tích vào 'Chia sẻ âm thanh' (Share system audio). Chỉ có hình ảnh được chia sẻ.");
          sysStream.getTracks().forEach(t => t.stop());
          return;
        }
        sysStreamRef.current = sysStream;

        // 2. Get Mic Audio
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = micStream;

        // 3. Mix them together
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;

        const micSource = audioCtx.createMediaStreamSource(micStream);
        const sysSource = audioCtx.createMediaStreamSource(sysStream);
        const dest = audioCtx.createMediaStreamDestination();

        micSource.connect(dest);
        sysSource.connect(dest);

        finalStream = dest.stream;
      }

      // Explicitly cleanup old streamRef if exists (should have been cleared, but just in case)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      streamRef.current = finalStream;

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
      }

      const mediaRecorder = new MediaRecorder(finalStream, { mimeType });
      // Đảm bảo không xóa audioChunksRef.current ở đây (bạn đã làm ở bước trước)

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      // Start with 1s timeslices for chunking
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;

      setupVisualizer(finalStream); // Gọi hàm visualizer đã tách
      startListening(finalStream, timer, language);
      requestWakeLock();
    } catch (err) { toast.error("Lỗi Micro/Permission: " + err); }
  }, [captureSystemAudio, language, timer, user, meetingTitle, startListening, setupVisualizer, requestWakeLock, handeFullStop]);

  const stopRecordingSession = useCallback(() => {
    stopListening();
    releaseWakeLock();

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
    }

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setVolume(0);
  }, [stopListening, releaseWakeLock]);

  // --- ACTIONS ---
  const scrollToLiveSegment = useCallback((time: number) => {
    // Tìm segment có start gần nhất với time
    const targetSegment = segments.find(s => {
      const start = s.words?.[0]?.start || 0;
      return time >= start && time < (s.words?.[s.words.length - 1]?.end || start + 5);
    });

    const startTime = targetSegment?.words?.[0]?.start || time;
    const element = document.getElementById(`live-seg-${startTime}`);

    if (element && transcriptEndRef.current?.parentElement) {
      const container = transcriptEndRef.current.parentElement;
      const targetScrollTop = element.offsetTop - (container.clientHeight / 4);
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
    }
  }, [segments]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      handeFullStop();
    }
  }, [handeFullStop])

  const handleToggleRecord = useCallback(() => {
    if (isListening) {
      stopRecordingSession();
    } else {
      startRecordingSession();
    }
  }, [isListening, startRecordingSession, stopRecordingSession]);

  const handleClearTranscript = useCallback(async () => {
    const isConfirmed = await confirm({
      title: "Xóa toàn bộ?",
      message: "Xóa toàn bộ nội dung ghi âm và tóm tắt hiện tại?",
      confirmText: "Xóa",
      type: "danger"
    });
    if (!isConfirmed) return;
    aiSessionIdRef.current = null;
    resetTranscript();
    setSummaries([]);
    bufferTextRef.current = "";
    wordCountRef.current = 0;
  }, [resetTranscript, confirm]);

  const handleSaveAndProcess = useCallback(async () => {
    if (!user) return toast.error("Vui lòng đăng nhập!");

    // 1. Dừng ghi âm
    stopRecordingSession();
    handeFullStop();

    setIsUploading(true);

    try {
      // Chờ 1 chút để chunks được đẩy hết vào mảng
      await new Promise(r => setTimeout(r, 500));

      // 2. Tạo File MP3 từ Blob
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
      const fileName = `Live Meeting ${new Date().toLocaleString('vi-VN').replace(/[:/]/g, '-')}.mp3`;
      const file = new File([audioBlob], fileName, { type: 'audio/mp3' });

      // 3. Upload lên Firebase Storage (Vẫn cần để nghe lại)
      const audioUrl = await uploadAudioToFirebase(file, user.uid);

      // --- [KHÁC BIỆT Ở ĐÂY] ---
      // KHÔNG GỌI RUNPOD NỮA. 
      // Lấy luôn dữ liệu từ biến 'segments' và 'summaries' có sẵn trên màn hình.

      // Chuẩn hóa segments từ Google STT sang format của DB
      const finalSegments = segments.map((s, idx) => ({
        id: `seg_${idx}_${Date.now()}`,
        start: s.words?.[0]?.start || 0,
        end: s.words?.[s.words.length - 1]?.end || 0,
        text: s.content,
        speakerId: `SPEAKER_${String(s.speaker).padStart(2, '0')}`,
        words: s.words || []
      }));

      // Ghép tóm tắt lại thành 1 chuỗi, kèm mốc thời gian [mm:ss] để MeetingDetail có thể parse
      const finalSummary = summaries
        .filter(s => !s.isLoading)
        .map(s => `[${formatTime(s.timestamp || 0)}] ${s.content}`)
        .join("\n\n");

      // 4. Lưu vào Firestore với trạng thái COMPLETED (Xong luôn)
      await saveMeeting({
        id: crypto.randomUUID(),
        userId: user.uid,
        title: meetingTitle.trim() || fileName.replace(".mp3", ""),
        createdAt: Date.now(),
        duration: timer,
        audioUrl: audioUrl,

        jobId: undefined,
        status: MEETING_STATUS.COMPLETED,
        language: language,

        segments: finalSegments, // Lưu text live
        summary: finalSummary,   // Lưu summary live
        speakers: [{ id: "SPEAKER_00", name: "Người nói (Live)", color: "bg-indigo-50 text-indigo-700" }],
        isDeleted: false,
        objectives: objectives.trim() || undefined
      });

      try {
        const { deleteDraft } = await import("../lib/indexedDB");
        await deleteDraft(draftIdRef.current);
      } catch (err) {
        console.error("Failed to delete draft:", err);
      }

      // 5. Xong -> Quay về Dashboard
      onFinish();

    } catch (e) {
      console.error(e);
      toast.error("Lỗi khi lưu: " + (e as Error).message);
    } finally {
      setIsUploading(false);
    }
  }, [user, stopRecordingSession, handeFullStop, segments, summaries, timer, language, meetingTitle, objectives, onFinish, toast]);

  const formatTime = useCallback((s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }, []);

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <LiveHeader
        isUploading={isUploading}
        liveSessionId={liveSessionId}
        isCopied={isCopied}
        onBack={() => { handeFullStop(); onBack(); }}
        onSave={handleSaveAndProcess}
        onCopyShareLink={() => {
          const url = `${window.location.origin}/live/${liveSessionId}`;
          navigator.clipboard.writeText(url);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        }}
      />
      <LiveStatusBar
        timer={timer}
        remainingMinutesWarning={remainingMinutesWarning}
        formatTime={formatTime}
      />

      {/* BODY */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row p-4 gap-4 md:gap-6">
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {connectionError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium p-3 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {connectionError}
            </div>
          )}

          <LiveControls
            isListening={isListening}
            volume={volume}
            captureSystemAudio={captureSystemAudio}
            onToggleRecord={handleToggleRecord}
            onToggleCaptureSystemAudio={toggleCaptureSystemAudio}
            canToggleSystemAudio={!isListening}
          />

          <div className="flex md:hidden bg-slate-200 p-1 rounded-xl shrink-0">
            <MobileTabBtn active={mobileTab === 'transcript'} onClick={() => setMobileTab('transcript')} icon={AlignLeft} label="Hội thoại" />
            <MobileTabBtn active={mobileTab === 'summary'} onClick={() => setMobileTab('summary')} icon={Sparkles} label="Live Tóm tắt" />
          </div>

          <TranscriptView
            segments={segments}
            interimContent={interimContent}
            onClear={handleClearTranscript}
          />
        </div>

        <LVSummaryPanel
          summaries={summaries}
          mobileTab={mobileTab}
          onScrollToSegment={scrollToLiveSegment}
          formatTime={formatTime}
        />
      </div>
    </div>
  );
}
