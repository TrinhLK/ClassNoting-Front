"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Database, Play, Pause, DownloadCloud, Clock,
  ChevronRight, Calendar, Rocket, Info, User, History,
  Activity
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { getAllTrainingSamples, TrainingDataSample } from "../lib/trainingData";
import AppShell from "../components/AppShell";
import Spinner from "../components/ui/Spinner";

export default function TrainingDataPage() {
  const { user, loading } = useAuth();
  const { toast } = useGlobalUI();
  const router = useRouter();

  const [samples, setSamples] = useState<TrainingDataSample[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [showDocs, setShowDocs] = useState(false);

  // Audio playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
      return;
    }
    if (user) {
      fetchData();
    }
  }, [user, loading]);

  const fetchData = async () => {
    setIsLoadingData(true);
    const data = await getAllTrainingSamples();
    setSamples(data);
    setIsLoadingData(false);
  };

  const togglePlay = (sample: TrainingDataSample) => {
    if (playingId === sample.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const newAudio = new Audio(sample.audio_url);
      newAudio.onended = () => setPlayingId(null);
      newAudio.play();
      audioRef.current = newAudio;
      setPlayingId(sample.id);
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Helper tính toán thống kê
  const getStats = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneWeekAgo = today - (7 * 24 * 60 * 60 * 1000);

    return {
      total: samples.length,
      today: samples.filter(s => s.created_at >= today).length,
      thisWeek: samples.filter(s => s.created_at >= oneWeekAgo).length,
    };
  };

  // Helper nhóm dữ liệu theo ngày
  const getGroupedSamples = () => {
    const groups: Record<string, TrainingDataSample[]> = {};
    samples.forEach(s => {
      const date = new Date(s.created_at).toLocaleDateString('vi-VN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(s);
    });
    return groups;
  };

  // Giả lập dữ liệu cho Heatmap (52 tuần)
  const renderHeatmap = () => {
    const days = 7 * 20; // Hiển thị 20 tuần gần đây cho gọn
    const heatmapData = [];
    const now = new Date();

    for (let i = days; i >= 0; i--) {
      const d = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
      const dateStr = d.toDateString();
      const count = samples.filter(s => new Date(s.created_at).toDateString() === dateStr).length;
      heatmapData.push({ count, date: d });
    }

    return (
      <div className="flex flex-wrap gap-[3px] md:gap-[4px]">
        {heatmapData.map((day, idx) => {
          let bgColor = "bg-slate-100";
          if (day.count > 0) bgColor = "bg-emerald-200";
          if (day.count > 5) bgColor = "bg-emerald-400";
          if (day.count > 10) bgColor = "bg-emerald-600";

          return (
            <div
              key={idx}
              title={`${day.date.toLocaleDateString('vi-VN')}: ${day.count} mẫu`}
              className={`w-[10px] h-[10px] md:w-[12px] md:h-[12px] rounded-[2px] cursor-help transition-all hover:ring-2 hover:ring-indigo-300 ${bgColor}`}
            />
          );
        })}
      </div>
    );
  };

  const stats = getStats();
  const groupedSamples = getGroupedSamples();

  const toggleGroup = (date: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [date]: !prev[date]
    }));
  };

  const handleTrainModel = async () => {
    setIsTraining(true);
    try {
      const res = await fetch('/api/finetune', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success("Đã gửi lệnh Finetune lên Runpod thành công! Job ID: " + data.jobId);
      } else {
        toast.error("Lỗi: " + data.error);
      }
    } catch (e) {
      console.error(e);
      toast.error("Đã có lỗi xảy ra khi gọi Finetune API");
    } finally {
      setIsTraining(false);
    }
  };

  if (loading) return <div className="p-8 text-center"><Spinner /></div>;

  return (
    <AppShell hideTopbar>
    <div className="h-full bg-slate-50 font-sans text-slate-800 flex flex-col overflow-y-auto">
      {/* HEADER */}
      <header className="bg-white border-b px-4 py-3 md:px-6 md:py-4 flex items-center justify-between sticky top-0 z-10 gap-2 shadow-sm">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold flex items-center gap-1.5 md:gap-2 truncate">
              <Database className="w-5 h-5 md:w-6 md:h-6 text-indigo-600 shrink-0" />
              <span className="truncate">Training Data</span>
            </h1>
            <p className="text-[10px] md:text-xs text-slate-500 truncate hidden sm:block">
              Quản lý dữ liệu thu thập (Audio - Text) để huấn luyện mô hình ASR
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-100">
            Tổng cộng: {samples.length} mẫu
          </div>
          {/* Button export JSONL nếu sau này cần */}
          <button
            onClick={() => {
              const dataStr = samples.map(s => JSON.stringify(s)).join("\n");
              const blob = new Blob([dataStr], { type: "application/jsonl" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `training_data_${Date.now()}.jsonl`;
              a.click();
            }}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 md:px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 md:gap-2 text-sm shadow-sm transition"
          >
            <DownloadCloud className="w-4 h-4" /> <span className="hidden sm:inline">Export JSONL</span>
          </button>
          <button
            onClick={handleTrainModel}
            disabled={isTraining || samples.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 md:px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 md:gap-2 text-sm shadow-sm transition"
          >
            <Rocket className="w-4 h-4" />
            <span className="hidden sm:inline">
              {isTraining ? "Đang gửi..." : "Gửi Train (Runpod)"}
            </span>
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-6 overflow-x-hidden flex flex-col gap-6">

        <div className="space-y-3 flex-1 text-sm text-slate-700">
          <h2 className="font-bold text-base text-slate-800">Hướng dẫn sử dụng Dữ liệu Huấn luyện</h2>
          <p>
            Hệ thống tự động thu thập các đoạn âm thanh và văn bản (đã được bạn chỉnh sửa chính xác)
            mỗi khi bạn nhấn <span className="font-semibold text-slate-800">Lưu biên bản</span>. Dữ liệu này được dùng để Fine-tune các mô hình ASR (Speech-to-Text).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="bg-white p-4 rounded-xl border border-blue-100/50 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-2">Định dạng Export (chuẩn Mozilla Common Voice )</h3>
              <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 ml-1">
                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">audio_url</code>:
                  Link tải file âm thanh định dạng WAV (16-bit PCM), dùng để huấn luyện hoặc kiểm tra mô hình ASR
                </li>

                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">transcript</code>:
                  Nhãn văn bản chính xác (Ground Truth) tương ứng với nội dung audio
                </li>

                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">duration_seconds</code>:
                  Thời lượng đoạn âm thanh (tính bằng giây), hữu ích để lọc hoặc phân tích dataset
                </li>

                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">start_time</code>:
                  Thời điểm bắt đầu của segment trong file audio gốc (đơn vị: giây)
                </li>

                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">end_time</code>:
                  Thời điểm kết thúc của segment trong file audio gốc
                </li>

                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">original_asr</code>:
                  Kết quả nhận dạng ban đầu từ hệ thống ASR (trước khi được người dùng chỉnh sửa)
                </li>

                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">language</code>:
                  Ngôn ngữ của đoạn audio (ví dụ: "vi" cho tiếng Việt)
                </li>

                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">source</code>:
                  Nguồn dữ liệu, ví dụ <span className="italic">user_correction</span> nghĩa là transcript đã được người dùng chỉnh sửa
                </li>

                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">segment_id</code>:
                  ID của đoạn audio (segment) trong một meeting
                </li>

                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">meeting_id</code>:
                  ID của toàn bộ cuộc họp chứa segment này
                </li>

                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">created_at</code>:
                  Timestamp (milliseconds) thời điểm segment được tạo
                </li>

                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">audio_format</code>:
                  Định dạng file audio (ví dụ: wav)
                </li>

                <li>
                  <code className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded">id</code>:
                  ID duy nhất của segment (thường là kết hợp giữa meeting_id và segment_id)
                </li>
              </ul>
            </div>
            <div className="bg-white p-4 rounded-xl border border-blue-100/50 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-2">Cách thức Pipeline</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Dữ liệu có thể dùng cho nhiều mục đích. Bạn có thể tải thẳng file JSONL về, tải các file audio từ URL, sau đó chuẩn bị manifest để train các mô hình, có thể dùng để huấn luyện bất cứ mô hình ngôn ngữ nào.
              </p>
            </div>
          </div>
        </div>

        {
          isLoadingData ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <History className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="font-medium">Đang truy xuất dữ liệu...</p>
            </div>
          ) : samples.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200 shadow-sm mt-4">
              <Database className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 mb-2 font-medium">Chưa có dữ liệu huấn luyện nào được thu thập.</p>
              <p className="text-slate-400 text-sm">Chỉnh sửa và lưu transcript trong cuộc họp để đóng góp dữ liệu.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-10 relative ml-4 md:ml-6 mb-20">
              {/* Đường line dọc xuyên suốt */}
              <div className="absolute left-[11px] top-0 bottom-0 w-[2px] bg-slate-200 z-0"></div>

              {Object.entries(groupedSamples).map(([date, dateSamples]) => {
                const isExpanded = !!expandedGroups[date];

                return (
                  <div key={date} className="relative">
                    {/* Tiêu đề nhóm ngày */}
                    <div
                      onClick={() => toggleGroup(date)}
                      className="sticky top-[80px] z-20 bg-slate-50/95 backdrop-blur-sm py-2 mb-4 flex items-center justify-between cursor-pointer group/header hover:bg-slate-100 transition-colors pr-4 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full border-4 border-slate-50 flex items-center justify-center z-10 shadow-sm transition-colors ${isExpanded ? "bg-indigo-600" : "bg-slate-800"}`}>
                          <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
                          <h2 className="text-sm md:text-base font-black text-slate-800 capitalize">{date}</h2>
                          <span className="text-[10px] md:text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            Đã thêm {dateSamples.length} mẫu
                          </span>
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>

                    {/* Danh sách mẫu trong ngày - Ẩn hiện */}
                    {isExpanded && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-200">
                        {dateSamples.map((sample) => {
                          const isPlaying = playingId === sample.id;
                          const shortId = sample.id.includes('__') ? sample.id.split('__')[1].substring(0, 7) : sample.id.substring(0, 7);

                          return (
                            <div key={sample.id} className="relative pl-10 group">
                              {/* Dot phụ cho từng sample */}
                              <div className="absolute left-[7px] top-4 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-300 z-10 group-hover:border-indigo-400 transition-colors"></div>

                              <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all overflow-hidden">
                                <div className="bg-slate-50/50 px-4 py-2 border-b border-slate-100 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    <div className="font-mono text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                      #{shortId}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                      <Clock className="w-3 h-3" />
                                      {new Date(sample.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      togglePlay(sample);
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-0.5 rounded-full border transition-all text-[10px] font-bold ${isPlaying
                                      ? "bg-indigo-600 text-white border-indigo-600"
                                      : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                      }`}
                                  >
                                    {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                                    {sample.duration_seconds}s
                                  </button>
                                </div>

                                <div className="p-4">
                                  <p className="text-slate-800 text-sm leading-relaxed font-medium">{sample.transcript}</p>
                                  {sample.original_asr && sample.original_asr !== sample.transcript && (
                                    <div className="mt-2 text-[11px] text-slate-400 italic line-through decoration-slate-300">
                                      {sample.original_asr}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        }
      </main>
    </div>
    </AppShell>
  );
}
