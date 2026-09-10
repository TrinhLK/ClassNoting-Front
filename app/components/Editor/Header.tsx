"use client";
import { useRef, useEffect } from "react";
import { Pencil, Check, X, LayoutTemplate, Sparkles, Save, Users } from "lucide-react";
import Button from "@/app/components/ui/Button";
import Tooltip from "@/app/components/ui/Tooltip";
import PageHeader from "@/app/components/ui/PageHeader";

interface EditorHeaderProps {
  title: string;
  isEditingTitle: boolean;
  isSaving: boolean;
  selectedTemplateName: string;
  speakerCount: number;
  onBack: () => void;
  onStartEditingTitle: () => void;
  onSaveTitle: () => void;
  onCancelTitle: () => void;
  onTitleKeyDown: (e: React.KeyboardEvent) => void;
  onTitleChange: (v: string) => void;
  onOpenTemplateModal: () => void;
  onOpenSpeakerModal: () => void;
  onSummarize: () => void;
  onSave: () => void;
}

export default function EditorHeader({
  title, isEditingTitle, isSaving, selectedTemplateName, speakerCount,
  onBack, onStartEditingTitle, onSaveTitle, onCancelTitle, onTitleKeyDown,
  onTitleChange, onOpenTemplateModal, onOpenSpeakerModal, onSummarize, onSave
}: EditorHeaderProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  return (
    <PageHeader
      id="editor-header"
      variant="compact"
      sticky
      onBack={onBack}
      title={isEditingTitle ? "" : title}
      actions={
        <>
          <Tooltip content={`Quản lý ${speakerCount} người nói`}>
            <button
              onClick={onOpenSpeakerModal}
              className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-bold transition-colors border border-slate-200"
              aria-label="Quản lý người nói"
            >
              <Users className="w-4 h-4 text-primary-600" />
              <span>{speakerCount}</span>
            </button>
          </Tooltip>

          <button
            onClick={onOpenTemplateModal}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors border border-slate-200 max-w-[160px]"
            title={selectedTemplateName}
          >
            <LayoutTemplate className="w-4 h-4 text-primary-600 shrink-0" />
            <span className="truncate">{selectedTemplateName}</span>
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={onSummarize}
            leftIcon={<Sparkles className="w-4 h-4" />}
            title="Tóm tắt lại"
            aria-label="Tóm tắt lại"
            className="hidden md:flex text-orange-700 border-orange-200 bg-orange-50 hover:bg-orange-100 whitespace-nowrap"
          >
            Tóm tắt lại
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
            loading={isSaving}
            leftIcon={isSaving ? undefined : <Save className="w-4 h-4" />}
          >
            {isSaving ? "Đã lưu" : "Lưu"}
          </Button>
        </>
      }
    >
      {isEditingTitle ? (
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={onTitleKeyDown}
            maxLength={200}
            className="flex-1 min-w-0 px-2.5 py-1 text-base md:text-lg font-bold text-slate-800 bg-white border border-primary-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-all"
            placeholder="Nhập tên cuộc họp..."
            aria-label="Tên cuộc họp"
          />
          <Tooltip content="Lưu (Enter)">
            <button
              onClick={onSaveTitle}
              className="shrink-0 p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              aria-label="Lưu tên"
              type="button"
            >
              <Check className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content="Hủy (Esc)">
            <button
              onClick={onCancelTitle}
              className="shrink-0 p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-colors"
              aria-label="Hủy"
              type="button"
            >
              <X className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      ) : (
        <div className="group flex items-center gap-2 min-w-0">
          <h1 className="font-bold text-slate-800 truncate text-base md:text-lg">
            {title}
          </h1>
          <Tooltip content="Đổi tên cuộc họp">
            <button
              onClick={onStartEditingTitle}
              className="shrink-0 p-1 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Đổi tên cuộc họp"
              type="button"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      )}
    </PageHeader>
  );
}
