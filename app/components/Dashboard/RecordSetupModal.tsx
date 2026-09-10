"use client";
import { AlertTriangle, UploadCloud, Mic } from "lucide-react";
import Modal from "@/app/components/ui/Modal";
import Input from "@/app/components/ui/Input";
import Select from "@/app/components/ui/Select";
import Button from "@/app/components/ui/Button";

export type RecordMode = "upload" | "live";

interface RecordSetupModalProps {
  mode: RecordMode;
  isOpen: boolean;
  selectedFile?: File | null;
  defaultTitle: string;
  defaultObjectives?: string;
  defaultLanguage: "vi" | "en";
  loading?: boolean;
  onTitleChange: (v: string) => void;
  onObjectivesChange: (v: string) => void;
  onLanguageChange: (v: "vi" | "en") => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function RecordSetupModal({
  mode, isOpen, selectedFile, defaultTitle, defaultObjectives = "",
  defaultLanguage, loading = false, onTitleChange, onObjectivesChange,
  onLanguageChange, onConfirm, onCancel
}: RecordSetupModalProps) {
  const isUpload = mode === "upload";
  const Icon = isUpload ? UploadCloud : Mic;
  const title = isUpload ? "Cấu hình tải file lên" : "Cấu hình ghi âm trực tiếp";
  const description = isUpload
    ? "Tệp sẽ được tải lên và AI sẽ tự động phiên âm."
    : "Thiết lập thông tin trước khi bắt đầu thu âm.";
  const confirmLabel = isUpload ? "Bắt đầu tải lên" : "Bắt đầu ghi âm";
  const intent = isUpload ? "primary" as const : "danger" as const;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      description={description}
      icon={<Icon className="w-5 h-5" />}
      size="md"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onCancel} className="flex-1">Hủy bỏ</Button>
          <Button variant={intent} loading={loading} disabled={!defaultTitle.trim()} onClick={onConfirm} className="flex-1">
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {isUpload && selectedFile && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-xs text-slate-500">Tệp đã chọn:</p>
            <p className="text-sm font-bold text-slate-800 truncate">{selectedFile.name}</p>
            <p className="text-xs text-slate-500 mt-1">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
          </div>
        )}

        {isUpload && selectedFile && selectedFile.size > 100 * 1024 * 1024 && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            File lớn (&gt;100MB) có thể mất nhiều thời gian để xử lý.
          </div>
        )}

        <Input
          label="Tiêu đề cuộc họp"
          placeholder="Nhập tên cuộc họp..."
          value={defaultTitle}
          onChange={(e) => onTitleChange(e.target.value)}
        />

        <Select
          label="Ngôn ngữ phiên âm"
          value={defaultLanguage}
          onChange={(e) => onLanguageChange(e.target.value as "vi" | "en")}
          options={[
            { value: "vi", label: "🇻🇳 Tiếng Việt" },
            { value: "en", label: "🇬🇧 English" },
          ]}
        />

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
            Mục tiêu cuộc họp
          </label>
          <textarea
            placeholder="Nhập mục tiêu để AI bám sát và tóm tắt chuẩn hơn..."
            value={defaultObjectives}
            onChange={(e) => onObjectivesChange(e.target.value)}
            rows={4}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm font-medium text-slate-700 resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}
