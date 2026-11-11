"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, LayoutTemplate, Plus, Trash2, Check, Sparkles, Loader2, Upload } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { MeetingTemplate, DEFAULT_TEMPLATES, MAX_TEMPLATE_CHARACTERS } from "../lib/templates";
import { getCustomTemplates, saveCustomTemplate, deleteCustomTemplate } from "../lib/db";

export default function TemplateManagerModal({
  isOpen,
  onClose,
  onSelectTemplate,
  actionText = "Sử dụng mẫu này",
  actionIcon = "check"
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: MeetingTemplate) => void;
  actionText?: string;
  actionIcon?: "check" | "sparkles";
}) {
  const { user } = useAuth();
  const { toast, confirm } = useGlobalUI();

  const [templates, setTemplates] = useState<MeetingTemplate[]>(DEFAULT_TEMPLATES);
  const [selectedTemplate, setSelectedTemplate] = useState<MeetingTemplate>(DEFAULT_TEMPLATES[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create Template Form
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [newTemplateStructure, setNewTemplateStructure] = useState("");
  const [sourceFileName, setSourceFileName] = useState("");
  const [sourceMode, setSourceMode] = useState<NonNullable<MeetingTemplate["sourceMode"]>>("auto");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importVersion = useRef(0);
  const templateStructRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && user) {
      loadTemplates();
      setIsCreatingTemplate(false);
      setIsSubmitting(false);
      setIsImporting(false);
      setImportError("");
    }
    return () => { importVersion.current++; };
  }, [isOpen, user]);

  const resetDraft = () => {
    importVersion.current++;
    setIsImporting(false);
    setNewTemplateName(""); setNewTemplateDesc(""); setNewTemplateStructure("");
    setSourceFileName(""); setSourceMode("auto"); setImportError("");
  };

  const handleImportWord = async (file: File) => {
    const version = ++importVersion.current;
    setIsImporting(true); setImportError("");
    try {
      const { readWordTemplate } = await import("../lib/docx/templateReader");
      const structure = await readWordTemplate(file);
      if (version !== importVersion.current) return;
      setNewTemplateStructure(structure);
      setNewTemplateName(file.name.replace(/\.(docx|dotx)$/i, ""));
      setNewTemplateDesc(""); setSourceMode("auto"); setSourceFileName(file.name);
      setIsCreatingTemplate(true);
    } catch (error) {
      if (version === importVersion.current) setImportError(error instanceof Error ? error.message : "Không đọc được mẫu Word.");
    } finally { if (version === importVersion.current) setIsImporting(false); }
  };

  const loadTemplates = async () => {
    if (!user) return;
    const customs = await getCustomTemplates(user.uid);
    setTemplates([...DEFAULT_TEMPLATES, ...customs]);
  };

  const insertTemplateSnippet = (snippet: string) => {
    const textarea = templateStructRef.current;
    if (!textarea) {
      setNewTemplateStructure((prev) => prev + snippet);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = newTemplateStructure;
    const newVal = current.substring(0, start) + snippet + current.substring(end);
    setNewTemplateStructure(newVal);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + snippet.length, start + snippet.length);
    }, 0);
  };

  const handleCreateTemplate = async () => {
    if (!user) return;
    if (!newTemplateName.trim() || !newTemplateStructure.trim()) return toast.warning("Nhập tên và cấu trúc!");
    if (newTemplateStructure.length > MAX_TEMPLATE_CHARACTERS) return toast.warning("Mẫu tối đa 40.000 ký tự.");
    if (isSubmitting || isImporting) return;
    setIsSubmitting(true);
    try {
      const draft = {
        name: newTemplateName.trim(),
        description: newTemplateDesc,
        structure: newTemplateStructure,
        sourceMode,
        ...(sourceFileName ? { sourceFileName } : {}),
      };
      const id = await saveCustomTemplate(user.uid, draft);
      if (id) setSelectedTemplate({ ...draft, id, isCustom: true, userId: user.uid });
      toast.success("Đã tạo mẫu mới!");
      setIsCreatingTemplate(false);
      setNewTemplateName("");
      setNewTemplateDesc("");
      setNewTemplateStructure("");
      resetDraft();
      await loadTemplates();
    } catch (e) {
      toast.error("Lỗi tạo mẫu");
    } finally { setIsSubmitting(false); }
  };

  const handleDeleteTemplate = async (tmplId: string) => {
    if (!user) return;
    if (
      await confirm({
        title: "Xóa mẫu này?",
        message: "Không thể hoàn tác.",
        type: "danger",
      })
    ) {
      await deleteCustomTemplate(user.uid, tmplId);
      toast.success("Đã xóa mẫu");
      loadTemplates();
      if (selectedTemplate.id === tmplId) setSelectedTemplate(DEFAULT_TEMPLATES[0]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <input ref={fileInputRef} type="file" accept=".docx,.dotx" aria-label="Chọn file Word làm mẫu biên bản" className="hidden"
          onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void handleImportWord(file); }} />
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-indigo-600" />
            {isCreatingTemplate ? "Tạo mẫu mới" : "Chọn mẫu biên bản"}
          </h3>
          <button
            onClick={() => {
              onClose();
            }}
            className="p-2 hover:bg-slate-200 rounded-full"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {importError && <p role="alert" className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b">{importError}</p>}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
          {/* SIDEBAR LIST */}
          {!isCreatingTemplate && (
            <div className="w-full md:w-1/3 md:max-h-full max-h-[35vh] border-r bg-slate-50 overflow-y-auto p-3 space-y-2 shrink-0">
              <div className="text-xs font-bold text-slate-400 uppercase px-2 py-1">Hệ thống</div>
              {templates
                .filter((t) => !t.isCustom)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t)}
                    className={`w-full text-left p-3 rounded-lg border transition-all text-sm ${selectedTemplate.id === t.id
                      ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200"
                      : "bg-white border-slate-200 hover:border-indigo-300"
                      }`}
                  >
                    <div className="font-bold text-slate-700">{t.name}</div>
                    <div className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</div>
                  </button>
                ))}

              <div className="text-xs font-bold text-slate-400 uppercase px-2 py-1 mt-4">Của bạn</div>
              {templates.filter((t) => t.isCustom).length === 0 && (
                <p className="text-xs text-slate-400 px-2 italic">Chưa có mẫu nào.</p>
              )}
              {templates
                .filter((t) => t.isCustom)
                .map((t) => (
                  <div key={t.id} className="group relative">
                    <button
                      onClick={() => setSelectedTemplate(t)}
                      className={`w-full text-left p-3 rounded-lg border transition-all text-sm ${selectedTemplate.id === t.id
                        ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200"
                        : "bg-white border-slate-200 hover:border-indigo-300"
                        }`}
                    >
                      <div className="font-bold text-indigo-700">{t.name}</div>
                      <div className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTemplate(t.id);
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-white border shadow-sm rounded-md text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}

              <button type="button" disabled={isImporting} onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 mt-4 border border-indigo-200 bg-indigo-50 rounded-lg text-indigo-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isImporting ? "Đang đọc mẫu Word..." : "Tải mẫu Word lên"}
              </button>
              <p className="text-xs text-slate-500 px-2 mt-2">.docx, .dotx · tối đa 5 MB. Hỗ trợ khung tiêu đề và báo cáo có nội dung mẫu.</p>
              <button
                onClick={() => { resetDraft(); setIsCreatingTemplate(true); }}
                className="w-full py-3 mt-4 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 font-medium hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Tạo mẫu mới
              </button>
            </div>
          )}

          {/* PREVIEW / CREATE AREA */}
          <div className="flex-1 bg-white overflow-y-auto flex flex-col p-4 md:p-8 min-h-0">
            {isCreatingTemplate ? (
              <div className="flex flex-col h-full space-y-4 animate-in slide-in-from-right duration-200">
                <div className="rounded-lg border bg-indigo-50 p-3 text-sm text-indigo-900">
                  <button type="button" disabled={isImporting || isSubmitting} onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 font-medium disabled:opacity-50">
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {isImporting ? "Đang đọc mẫu Word..." : sourceFileName ? "Thay file Word" : "Tải mẫu Word lên"}
                  </button>
                  {sourceFileName && <p className="mt-1 break-all">{sourceFileName}</p>}
                  <p className="text-xs mt-1">Kiểm tra nội dung đã đọc bên dưới trước khi lưu. Mẫu hướng dẫn bố cục và cách viết; dữ kiện báo cáo lấy từ cuộc họp mới.</p>
                </div>
                <div>
                  <label htmlFor="template-name" className="block text-sm font-bold text-slate-700 mb-1">Tên mẫu</label>
                  <input
                    id="template-name"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="VD: Họp giao ban tuần..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Mô tả ngắn</label>
                  <input
                    value={newTemplateDesc}
                    onChange={(e) => setNewTemplateDesc(e.target.value)}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Mô tả mục đích sử dụng..."
                  />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="template-mode" className="block text-sm font-bold text-slate-700 mb-1">Cách sử dụng mẫu</label>
                  <select id="template-mode" value={sourceMode} onChange={e => setSourceMode(e.target.value as typeof sourceMode)} className="p-2 border rounded-lg mb-2">
                    <option value="auto">Tự nhận diện khung tiêu đề hoặc bản có ví dụ</option>
                    <option value="outline">Chỉ dùng khung tiêu đề</option>
                    <option value="example">Tham khảo bố cục và văn phong của bản có ví dụ</option>
                  </select>
                  <label htmlFor="template-content" className="block text-sm font-bold text-slate-700 mb-1">
                    Nội dung mẫu
                  </label>

                  <div className="flex flex-wrap gap-2 mb-2">
                    <button
                      onClick={() => insertTemplateSnippet("## TÊN MỤC\n")}
                      className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 text-indigo-700 text-xs font-bold rounded border border-slate-200"
                    >
                      + Mục lớn
                    </button>
                    <button
                      onClick={() => insertTemplateSnippet("- Nội dung chi tiết...\n")}
                      className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 text-xs font-medium rounded border border-slate-200"
                    >
                      + Ý chính
                    </button>
                    <button
                      onClick={() => insertTemplateSnippet("  - [ ] Action Item\n")}
                      className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 text-xs font-medium rounded border border-slate-200"
                    >
                      + Việc cần làm
                    </button>
                    <button
                      onClick={() => insertTemplateSnippet("**In đậm** ")}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded border border-slate-200"
                    >
                      In Đậm
                    </button>
                  </div>

                  <textarea
                    id="template-content"
                    ref={templateStructRef}
                    value={newTemplateStructure}
                    maxLength={MAX_TEMPLATE_CHARACTERS}
                    onChange={(e) => setNewTemplateStructure(e.target.value)}
                    className="w-full min-h-[160px] p-3 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none bg-slate-50"
                    placeholder={`# MẪU BIÊN BẢN \n\n## 1. PHẦN 1...\n## 2. PHẦN 2...`}
                  />
                  <p className="text-xs text-slate-500 mt-1">Có thể sửa hoặc nhập Markdown trực tiếp. {newTemplateStructure.length.toLocaleString("vi-VN")} / 40.000 ký tự. Bố cục trang, hình ảnh và chữ ký Word không được sao chép.</p>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    onClick={() => { resetDraft(); setIsCreatingTemplate(false); }}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleCreateTemplate}
                    disabled={isSubmitting || isImporting}
                    className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md disabled:opacity-50"
                  >
                    {isSubmitting ? "Đang lưu..." : "Lưu mẫu mới"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-800">{selectedTemplate.name}</h2>
                  <p className="text-slate-500">{selectedTemplate.description}</p>
                  {selectedTemplate.sourceFileName && <p className="text-xs text-indigo-600 mt-2 break-all">File mẫu: {selectedTemplate.sourceFileName}</p>}
                  {selectedTemplate.sourceMode && <p className="text-xs text-slate-500 mt-1">{selectedTemplate.sourceMode === "outline" ? "Dùng các tiêu đề làm khung tóm tắt." : selectedTemplate.sourceMode === "example" ? "Viết báo cáo mới theo bố cục và văn phong mẫu; không dùng lại dữ kiện ví dụ." : "Tự nhận diện khung tiêu đề hoặc báo cáo có ví dụ để áp dụng cho cuộc họp mới."}</p>}
                </div>
                <div className="flex-1 overflow-y-auto bg-slate-50 rounded-xl border p-6">
                  <pre className="whitespace-pre-wrap font-mono text-sm text-slate-600 leading-relaxed">
                    {selectedTemplate.structure}
                  </pre>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={async () => {
                      if (isSubmitting) return;
                      setIsSubmitting(true);
                      try {
                        await onSelectTemplate(selectedTemplate);
                      } catch (e) {
                        console.error("[template] select error:", e);
                        setIsSubmitting(false);
                      }
                    }}
                    disabled={isSubmitting}
                    className={`px-6 py-3 text-white font-bold rounded-xl shadow-lg flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${actionIcon === "sparkles" ? "bg-orange-600 hover:bg-orange-700" : "bg-indigo-600 hover:bg-indigo-700"
                      }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Đang tóm tắt...
                      </>
                    ) : (
                      <>
                        {actionIcon === "sparkles" ? <Sparkles className="w-5 h-5" /> : <Check className="w-5 h-5" />}
                        {actionText}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
