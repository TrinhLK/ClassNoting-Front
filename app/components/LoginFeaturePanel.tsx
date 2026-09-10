"use client";
import { Mic, Users, Sparkles, FileText } from "lucide-react";

const FEATURES = [
  { icon: <Mic className="w-5 h-5" />, title: "Ghi âm & phiên âm", desc: "AI chuyển giọng nói thành văn bản tiếng Việt tự động" },
  { icon: <Users className="w-5 h-5" />, title: "Phân biệt người nói", desc: "Tự động nhận diện và đặt tên từng người trong cuộc họp" },
  { icon: <Sparkles className="w-5 h-5" />, title: "Tóm tắt thông minh", desc: "AI tạo biên bản tóm tắt với action items rõ ràng" },
  { icon: <FileText className="w-5 h-5" />, title: "Xuất đa định dạng", desc: "PDF, DOCX, TXT - chia sẻ dễ dàng với đồng nghiệp" },
];

export default function LoginFeaturePanel() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-slate-800 mb-2">
          Trợ lý cuộc họp <span className="text-primary-600">thông minh</span>
        </h2>
        <p className="text-slate-600 text-lg">Tiết kiệm thời gian, tăng năng suất với AI xử lý cuộc họp tự động.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="bg-white/60 backdrop-blur-md border border-white/60 rounded-2xl p-4">
            <div className="text-primary-600 mb-2">{f.icon}</div>
            <h3 className="font-bold text-slate-800 text-sm mb-1">{f.title}</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
