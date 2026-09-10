"use client";
import { X, UploadCloud } from "lucide-react";
import ProgressBar from "@/app/components/ui/ProgressBar";

interface UploadProgressToastProps {
  progress: number;
  onClose: () => void;
  fileName?: string;
}

export default function UploadProgressToast({ progress, onClose, fileName }: UploadProgressToastProps) {
  return (
    <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-[var(--z-toast)] animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-72 md:w-80 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center shrink-0">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-slate-800 font-bold text-sm">Đang tải file lên</h3>
            {fileName && <p className="text-slate-500 text-xs truncate">{fileName}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <ProgressBar value={progress} variant="primary" showLabel />
      </div>
    </div>
  );
}
