"use client";
import { ChevronLeft, Save, Loader2, Link as LinkIcon, CheckCircle2 } from "lucide-react";

interface LiveHeaderProps {
  isUploading: boolean;
  liveSessionId: string | null;
  isCopied: boolean;
  onBack: () => void;
  onSave: () => void;
  onCopyShareLink: () => void;
}

export default function LiveHeader({
  isUploading, liveSessionId, isCopied,
  onBack, onSave, onCopyShareLink
}: LiveHeaderProps) {
  return (
    <div className="h-14 md:h-16 bg-white border-b flex items-center justify-between px-4 md:px-6 shadow-sm z-20 shrink-0">
      <button
        onClick={onBack}
        className="p-2 hover:bg-slate-100 rounded-full text-slate-500"
        disabled={isUploading}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 md:gap-3">
        {liveSessionId && (
          <button
            onClick={onCopyShareLink}
            className="px-3 py-1.5 md:px-4 md:py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-medium text-sm flex items-center gap-2 shadow-sm transition-all"
          >
            {isCopied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <LinkIcon className="w-4 h-4" />}
            <span className="hidden md:inline">{isCopied ? "Đã copy link" : "Share Live"}</span>
          </button>
        )}

        <button
          onClick={onSave}
          disabled={isUploading}
          className={`px-3 py-1.5 md:px-4 md:py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm flex items-center gap-2 shadow-lg transition-all ${isUploading ? 'opacity-70 cursor-wait' : ''}`}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang lưu...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span className="hidden md:inline">Dừng & Lưu</span>
              <span className="md:hidden">Lưu</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
