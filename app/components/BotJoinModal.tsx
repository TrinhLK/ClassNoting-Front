"use client";

import { useState, useEffect } from 'react';
import { Bot, Link as LinkIcon, Loader2, CheckCircle, Video } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGlobalUI } from '../context/GlobalUIProvider';
import { storage } from "@/app/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { saveMeeting, Meeting } from "@/app/lib/db";
import { MEETING_STATUS } from "../lib/constants";
import Modal from "./ui/Modal";
import Input from "./ui/Input";
import Select from "./ui/Select";
import Button from "./ui/Button";
import Spinner from "./ui/Spinner";

export default function BotJoinModal({ isOpen, onClose, onUpdate }: { isOpen: boolean; onClose: () => void; onUpdate?: () => void }) {
    const { user } = useAuth();
    const { toast } = useGlobalUI();
    const [meetingUrl, setMeetingUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [botId, setBotId] = useState<string | null>(null);
    const [status, setStatus] = useState<string>("idle"); // idle, joining, waiting, recording, processing, completed
    const [statusDetails, setStatusDetails] = useState<string>("Đang đợi kết nối...");
    const [language, setLanguage] = useState<"vi" | "en">("vi");
    const [objectives, setObjectives] = useState("");

    const validateMeetingUrl = (url: string): boolean => {
        const googleMeetRegex = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;
        const zoomRegex = /^https:\/\/(?:[\w-]+\.)?zoom\.(?:us|com|gov)\/j\/[\w-]+/i;
        return googleMeetRegex.test(url) || zoomRegex.test(url);
    };

    const handleJoin = async () => {
        if (!meetingUrl) return toast.error("Vui lòng nhập link cuộc họp!");
        if (!user) return toast.error("Vui lòng đăng nhập!");
        if (!validateMeetingUrl(meetingUrl)) return toast.error("Link không hợp lệ. Chỉ hỗ trợ Google Meet hoặc Zoom.");

        setLoading(true);
        setStatus("joining");
        try {
            const res = await fetch("/api/bots/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    meetingUrl,
                    userId: user.uid,
                    botName: "Thư Ký AI (Demo)"
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setBotId(data.botId);
                setStatus("waiting");
                toast.success("Bot đã nhận lệnh! Đang theo dõi trạng thái...");
            } else {
                toast.error(`Lỗi: ${data.error || "Không thể mời bot"}`);
                setLoading(false);
                setStatus("idle");
            }
        } catch (e) {
            console.error(e);
            toast.error("Lỗi kết nối server.");
            setLoading(false);
            setStatus("idle");
        }
    };

    // Polling Effect
    useEffect(() => {
        if (!botId || status === 'completed') return;

        const checkStatus = async () => {
            try {
                if (!user) {
                    return;
                }

                const res = await fetch(`/api/bots/status?botId=${botId}&userId=${user.uid}`);

                if (!res.ok) {
                    const text = await res.text();
                    try {
                        const err = JSON.parse(text);
                        console.error("[Polling] Failed JSON:", res.status, err);
                    } catch (e) {
                        console.error("[Polling] Failed Raw:", res.status, text);
                    }
                    return;
                }

                const data = await res.json();

                if (data.status === 'failed' || data.error) {
                    setStatus("idle");
                    // Hiển thị lỗi từ server nếu có
                    toast.error(data.error || "Bot không thể tham gia cuộc họp.");
                    setBotId(null);
                    return;
                }

                if (data.status) {
                    // Update Status Text
                    if (data.status === 'call_ended' || data.status === 'completed') {
                        setStatus("completed");

                        // [HYBRID FIX] Server sends data, Client saves it to Firestore
                        if (data.shouldSave && data.meetingData) {
                            try {
                                let finalMeetingData = { ...data.meetingData };
                                if (objectives.trim()) {
                                    finalMeetingData.objectives = objectives.trim();
                                }

                                // [NEW] Upload Audio lên Firebase Storage (nếu có URL từ S3)
                                if (finalMeetingData.audioUrl && finalMeetingData.audioUrl.startsWith("http")) {
                                    setStatusDetails("Đang tải file ghi âm lên Cloud...");

                                    // [CORS FIX] Dùng Proxy để tải file (tránh lỗi Failed to fetch)
                                    const proxyUrl = `/api/proxy-file?url=${encodeURIComponent(finalMeetingData.audioUrl)}`;
                                    const response = await fetch(proxyUrl);

                                    if (!response.ok) throw new Error(`Proxy Fetch Error: ${response.status}`);

                                    const blob = await response.blob();

                                    // File path: users/{userId}/uploads/{filename} (Match existing convention)
                                    const storageRef = ref(storage, `users/${user.uid}/uploads/meetingbaas_${finalMeetingData.id}.mp3`);
                                    const uploadTask = await uploadBytesResumable(storageRef, blob);
                                    const downloadURL = await getDownloadURL(uploadTask.ref);

                                    finalMeetingData.audioUrl = downloadURL; // Replace S3 URL with Firebase URL

                                    // [HYBRID PIPELINE] Gọi Server Python để Transcribe + Diarize
                                    // Input: URL file + Bot Diarization
                                    // [HYBRID PIPELINE] Gọi Server Python để Transcribe + Diarize (ASYNC)
                                    try {
                                        setStatusDetails("Đang gửi lệnh xử lý sang Server Local...");

                                        let diarizationPayload = finalMeetingData.diarization;
                                        if (typeof diarizationPayload === 'string' && diarizationPayload.startsWith('http')) {
                                            try {
                                                // Dùng Proxy để bypass CORS
                                                const proxyUrl = `/api/proxy-file?url=${encodeURIComponent(diarizationPayload)}`;
                                                const dRes = await fetch(proxyUrl);

                                                if (dRes.ok) {
                                                    const text = await dRes.text();

                                                    try {
                                                        // 1. Try parsing as standard JSON Array
                                                        diarizationPayload = JSON.parse(text);
                                                    } catch (jsonErr) {
                                                        // 2. If valid JSON fails, try NDJSON (Newline Delimited JSON)
                                                        // Example: {"a":1}\n{"b":2}
                                                        diarizationPayload = text.trim().split('\n')
                                                            .map(line => {
                                                                try { return JSON.parse(line); } catch (e) { return null; }
                                                            })
                                                            .filter(item => item !== null);
                                                    }

                                                } else {
                                                    console.warn("❌ Failed to fetch Diarization JSON via Proxy:", dRes.status);
                                                    diarizationPayload = [];
                                                }
                                            } catch (err) {
                                                console.warn("❌ Diarization Fetch Error:", err);
                                                diarizationPayload = [];
                                            }
                                        }

                                        // Dynamic Import để tránh lỗi SSR
                                        const { startHybridTranscriptionJob } = await import("../lib/api");
                                        const jobId = await startHybridTranscriptionJob(downloadURL, diarizationPayload, language);

                                        if (jobId) {
                                            finalMeetingData.jobId = jobId;
                                            finalMeetingData.status = MEETING_STATUS.TRANSCRIBING;
                                            finalMeetingData.segments = []; // Chưa có segment

                                            toast.success("Đã gửi xử lý AI! Hệ thống sẽ tự cập nhật khi xong.");
                                        }

                                    } catch (pyErr) {
                                        console.error("Hybrid Job Failed:", pyErr);
                                        toast.warning("Server Local lỗi/tắt. Không thể xử lý transcript.");
                                        finalMeetingData.status = MEETING_STATUS.FAILED;
                                        finalMeetingData.errorMessage = "Server Local (transcribe+diarize) không khả dụng.";
                                    }
                                }

                                setStatusDetails("Đang lưu biên bản...");
                                await saveMeeting(finalMeetingData);
                                toast.success("Đã kết xuất biên bản thành công!");
                                setTimeout(() => {
                                    onClose();
                                    if (onUpdate) onUpdate();
                                }, 1500);
                            } catch (error) {
                                console.error("Save Error:", error);
                                toast.error("Lỗi khi lưu dữ liệu!");
                            }
                        } else if (data.saved) {
                            toast.success("Đã xong!");
                            setTimeout(() => {
                                onClose();
                                if (onUpdate) onUpdate();
                            }, 1500);
                        }
                    } else if (data.status === 'in_call_recording') {
                        setStatus("recording");
                        setStatusDetails("Bot đang ghi âm...");
                    } else if (data.status === 'joining') {
                        setStatus("joining");
                        setStatusDetails("Bot đang vào phòng...");
                    } else if (data.status === 'transcribing') {
                        setStatus("waiting");
                        setStatusDetails("Đang chuyển đổi giọng nói thành văn bản...");
                    } else if (data.status === 'processing') {
                        setStatus("waiting");
                        setStatusDetails("Đang xử lý dữ liệu...");
                    } else {
                        setStatusDetails(`Trạng thái: ${data.status}`);
                    }
                }
            } catch (err) {
                console.error("[Polling] Error:", err);
            }
        };

        // Call immediately
        checkStatus();

        // Then interval
        const interval = setInterval(checkStatus, 5000);

        return () => clearInterval(interval);
    }, [botId, status, user, onClose, toast]);


    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Mời Bot Tham Gia"
            description="Bot sẽ tự động ghi âm và phiên âm cuộc họp trên Google Meet / Zoom."
            icon={<Bot className="w-5 h-5" />}
            size="md"
        >
            {botId ? (
                <div className="text-center space-y-6 py-4">
                    {status === 'completed' ? (
                        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle className="w-10 h-10" />
                        </div>
                    ) : (
                        <div className="flex items-center justify-center">
                            <Spinner size="xl" intent="primary" />
                        </div>
                    )}

                    <div>
                        <h3 className="text-xl font-bold text-slate-800">
                            {status === 'completed' ? "Hoàn tất!" : "Bot đang làm việc"}
                        </h3>
                        <p className="text-slate-500 font-medium mt-2 animate-pulse">
                            {statusDetails}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 font-mono">ID: {botId.split('-')[0]}</p>
                    </div>

                    {status === 'recording' && (
                        <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                            <div className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
                            Đang Ghi Âm
                        </div>
                    )}

                    {status !== 'completed' && (
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-600 text-sm hover:underline"
                        >
                            Ẩn xuống nền (Bot vẫn chạy)
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    <Input
                        label="Link cuộc họp (Google Meet / Zoom)"
                        placeholder="https://meet.google.com/..."
                        value={meetingUrl}
                        onChange={(e) => setMeetingUrl(e.target.value)}
                        leftIcon={<LinkIcon className="w-4 h-4" />}
                    />

                    <Select
                        label="Ngôn ngữ ghi âm"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as "vi" | "en")}
                        options={[
                            { value: "vi", label: "🇻🇳 Tiếng Việt" },
                            { value: "en", label: "🇬🇧 English" },
                        ]}
                    />

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Mục tiêu cuộc họp (Objectives)</label>
                        <textarea
                            value={objectives}
                            onChange={(e) => setObjectives(e.target.value)}
                            placeholder="Ví dụ: Chốt ngân sách marketing Q3, phân công phát triển tính năng mới..."
                            rows={3}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-medium text-slate-700 text-sm resize-none"
                        />
                    </div>

                    <p className="text-xs text-slate-500 italic">
                        * Bot sẽ tự động rời phòng khi kết thúc.
                    </p>
                    <div className="text-[11px] sm:text-xs text-slate-600 bg-blue-50 p-3 rounded-xl border border-blue-100 leading-relaxed mt-2">
                        <span className="font-semibold text-blue-700">Lưu ý cho Google Workspace/Edu:</span> Nếu bot không thể tham gia, quản trị viên có thể cần cấp quyền. <a href="https://guide.fireflies.ai/articles/7581948912-how-to-invite-fireflies-to-google-meet-meetings" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline font-medium">Xem hướng dẫn</a>
                    </div>

                    <Button variant="primary" onClick={handleJoin} loading={loading} className="w-full" leftIcon={loading ? undefined : <Video className="w-4 h-4" />}>
                        {loading ? "Đang kết nối..." : "Mời Bot vào ngay"}
                    </Button>
                </div>
            )}
        </Modal>
    );
}
