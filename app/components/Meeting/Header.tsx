"use client";
import { useState, useRef, useEffect } from "react";
import { Share2, Download, Music, FileText, FileType, Sparkles, Edit3, FileText as FileIcon } from "lucide-react";
import type { Meeting } from "@/app/lib/db";
import PageHeader from "../ui/PageHeader";
import Button from "../ui/Button";

interface MeetingHeaderProps {
  meeting: Meeting;
  isReadOnly: boolean;
  showTemplateBtn: boolean;
  onBack: () => void;
  onEdit: () => void;
  onOpenTemplateModal: () => void;
  onOpenDocsFill: () => void;
  onShare: () => Promise<void>;
  onDownloadAudio: () => void;
  onExportTxt: () => void;
  onExportDocx: () => void;
  onExportPdf: () => void;
  formatDate: (ts: number) => string;
  formatDuration: (sec: number) => string;
}

export default function MeetingHeader({
  meeting, isReadOnly, showTemplateBtn,
  onBack, onEdit, onOpenTemplateModal, onOpenDocsFill,
  onShare, onDownloadAudio, onExportTxt, onExportDocx, onExportPdf,
  formatDate, formatDuration
}: MeetingHeaderProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

  return (
    <PageHeader
      variant="default"
      sticky
      onBack={onBack}
      title={meeting.title}
      subtitle={`${formatDate(meeting.createdAt)} · ${formatDuration(meeting.duration)}`}
      actions={
        <>
          {!isReadOnly && (
            <Button variant="outline" size="sm" onClick={onShare} leftIcon={<Share2 className="w-4 h-4" />}
              className="hidden sm:flex text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100">
              Chia sẻ
            </Button>
          )}

          <div ref={menuRef} className="relative">
            <Button variant="outline" size="sm" onClick={() => setShowExportMenu(!showExportMenu)} leftIcon={<Download className="w-4 h-4" />}>
              <span className="hidden md:inline">Tải xuống</span>
            </Button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                <button onClick={() => { onDownloadAudio(); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 flex items-center gap-3 text-slate-700">
                  <Music className="w-4 h-4 text-pink-500" /> Audio
                </button>
                <button onClick={() => { onExportTxt(); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 flex items-center gap-3 text-slate-700 border-t border-slate-100">
                  <FileText className="w-4 h-4 text-slate-400" /> Nội dung (.txt)
                </button>
                <button onClick={() => { onExportDocx(); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-primary-50 flex items-center gap-3 text-primary-700 border-t border-slate-100">
                  <FileType className="w-4 h-4" /> Tóm tắt (.docx)
                </button>
                <button onClick={() => { onExportPdf(); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-orange-50 flex items-center gap-3 text-orange-700 border-t border-slate-100">
                  <FileType className="w-4 h-4" /> Tóm tắt (.pdf)
                </button>
              </div>
            )}
          </div>

          {!isReadOnly && showTemplateBtn && (
            <Button variant="outline" size="sm" onClick={onOpenTemplateModal} leftIcon={<Sparkles className="w-4 h-4" />}
              title="Tóm tắt lại"
              aria-label="Tóm tắt lại"
              className="hidden md:flex text-orange-700 border-orange-200 bg-orange-50 hover:bg-orange-100">
              Tóm tắt lại
            </Button>
          )}

          {!isReadOnly && (
            <Button variant="outline" size="sm" onClick={onOpenDocsFill} leftIcon={<FileIcon className="w-4 h-4" />}
              title="Tạo từ template"
              aria-label="Tạo từ template"
              className="hidden md:flex text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 whitespace-nowrap">
              Tạo từ template
            </Button>
          )}

          {!isReadOnly && (
            <Button variant="primary" size="sm" onClick={onEdit} leftIcon={<Edit3 className="w-4 h-4" />}>
              <span className="hidden md:inline">Sửa</span>
            </Button>
          )}
        </>
      }
    />
  );
}
