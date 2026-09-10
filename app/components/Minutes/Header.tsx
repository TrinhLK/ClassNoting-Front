"use client";
import { useRef } from "react";
import { Plus, RefreshCw, FolderPlus, Search, FileText } from "lucide-react";
import PageHeader from "../ui/PageHeader";
import Input from "../ui/Input";
import Button from "../ui/Button";

interface MinutesHeaderProps {
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  onImport: (file: File) => void;
  onNewFolder: () => void;
}

export default function MinutesHeader({
  loading, searchQuery, onSearchChange,
  onRefresh, onImport, onNewFolder
}: MinutesHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <PageHeader
        variant="default"
        sticky
        title="Biên bản cuộc họp"
        subtitle="Quản lý và chỉnh sửa biên bản các cuộc họp"
        icon={<FileText className="w-5 h-5" />}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} aria-label="Làm mới">
              <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={onNewFolder} leftIcon={<FolderPlus className="w-4 h-4" />} className="hidden sm:flex">
              Tạo thư mục
            </Button>
            <Button variant="primary" size="sm" onClick={() => fileInputRef.current?.click()} leftIcon={<Plus className="w-4 h-4" />}>
              Import biên bản
            </Button>
          </>
        }
      />
      <input ref={fileInputRef} type="file" accept=".txt,.doc,.docx" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-3">
        <Input placeholder="Tìm kiếm theo tên cuộc họp hoặc nội dung..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} leftIcon={<Search className="w-4 h-4" />} />
      </div>
    </>
  );
}
