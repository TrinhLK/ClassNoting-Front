"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, LayoutTemplate, Plus, Trash2, Check, Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { MeetingTemplate, DEFAULT_TEMPLATES } from "../lib/templates";
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
  const templateStructRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && user) {
      loadTemplates();
      setIsCreatingTemplate(false);
    }
  }, [isOpen, user]);

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
    try {
      await saveCustomTemplate(user.uid, {
        name: newTemplateName,
        description: newTemplateDesc,
        structure: newTemplateStructure,
      });
      toast.success("Đã tạo mẫu mới!");
      setIsCreatingTemplate(false);
      setNewTemplateName("");
      setNewTemplateDesc("");
      setNewTemplateStructure("");
      loadTemplates();
    } catch (e) {
      toast.error("Lỗi tạo mẫu");
    }
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

              <button
                onClick={() => setIsCreatingTemplate(true)}
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
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Tên mẫu</label>
                  <input
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
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Cấu trúc Prompt (AI Instruction)
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
                    ref={templateStructRef}
                    value={newTemplateStructure}
                    onChange={(e) => setNewTemplateStructure(e.target.value)}
                    className="w-full min-h-[160px] p-3 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none bg-slate-50"
                    placeholder={`# MẪU BIÊN BẢN \n\n## 1. PHẦN 1...\n## 2. PHẦN 2...`}
                  />
                  <p className="text-xs text-slate-500 mt-1">Hoặc nhập trực tiếp bằng Markdown.</p>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    onClick={() => setIsCreatingTemplate(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleCreateTemplate}
                    className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md"
                  >
                    Lưu mẫu mới
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-800">{selectedTemplate.name}</h2>
                  <p className="text-slate-500">{selectedTemplate.description}</p>
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
