"use client";
import { useState, useRef, type ChangeEvent } from "react";
import {
  Upload, FileText, Loader2, Sparkles, Check, AlertTriangle, FileType, Wand2
} from "lucide-react";
import Modal from "@/app/components/ui/Modal";
import Button from "@/app/components/ui/Button";
import Input from "@/app/components/ui/Input";
import { useGlobalUI } from "@/app/context/GlobalUIProvider";
import {
  extractPlaceholders, fillDocx, fillDocxMarkers, extractPlainText, type PlaceholderInfo, type DocxMarker
} from "@/app/lib/docx/filler";
import { requestFillPlaceholders, requestDetectFill, type FillContext, type DetectFillItem } from "@/app/lib/api";
import { cn } from "@/app/lib/cn";
import { createAiSessionId } from "@/app/lib/ai-session";

type Step = "upload" | "ai-filling" | "review" | "generating";

interface DocsFillModalProps {
  isOpen: boolean;
  onClose: () => void;
  context?: FillContext;
}

export default function DocsFillModal({ isOpen, onClose, context }: DocsFillModalProps) {
  const { toast } = useGlobalUI();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [placeholders, setPlaceholders] = useState<PlaceholderInfo[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [markers, setMarkers] = useState<DetectFillItem[]>([]);
  const [markerValues, setMarkerValues] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [aiError, setAiError] = useState(false);

  const reset = () => {
    sessionIdRef.current = null;
    setStep("upload");
    setFile(null);
    setPlaceholders([]);
    setValues({});
    setMarkers([]);
    setMarkerValues({});
    setFileError(null);
    setAiError(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;
    reset();
    const sessionId = createAiSessionId("docs");
    sessionIdRef.current = sessionId;

    setFileError(null);
    try {
      const found = await extractPlaceholders(selected);
      if (sessionIdRef.current !== sessionId) return;
      setFile(selected);
      setPlaceholders(found);
      setMarkers([]);
      setMarkerValues({});
      const initial: Record<string, string> = {};
      found.forEach((p) => { initial[p.name] = ""; });
      setValues(initial);
      setStep("upload");
    } catch (err) {
      if (sessionIdRef.current !== sessionId) return;
      setFileError((err as Error).message);
    }
  };

  const handleContinue = async () => {
    if (!file) return;
    const sessionId = sessionIdRef.current ??= createAiSessionId("docs");
    setStep("ai-filling");
    setAiError(false);
    try {
      if (placeholders.length > 0) {
        const names = placeholders.map((p) => p.name);
        const result = await requestFillPlaceholders(names, sessionId, context);
        if (sessionIdRef.current !== sessionId) return;
        setValues((prev) => {
          const next = { ...prev };
          names.forEach((n) => {
            const v = result[n];
            if (v !== undefined && v !== null && String(v).trim() !== "") {
              next[n] = String(v);
            }
          });
          return next;
        });
      } else {
        const plainText = await extractPlainText(file);
        if (sessionIdRef.current !== sessionId) return;
        if (!plainText.trim()) {
          throw new Error("Không thể đọc nội dung file.");
        }
        const detected = await requestDetectFill(plainText, sessionId, context);
        if (sessionIdRef.current !== sessionId) return;
        setMarkers(detected);
        const init: Record<string, string> = {};
        detected.forEach((d) => { init[d.marker] = d.value || ""; });
        setMarkerValues(init);
      }
      setStep("review");
    } catch (err) {
      console.error("AI fill error:", err);
      if (sessionIdRef.current !== sessionId) return;
      setAiError(true);
      setStep("review");
    }
  };

  const handleGenerate = async () => {
    if (!file) return;
    const sessionId = sessionIdRef.current;
    setStep("generating");
    try {
      let blob: Blob;
      if (markers.length > 0) {
        const docxMarkers: DocxMarker[] = markers.map((m) => ({ marker: m.marker, value: markerValues[m.marker] || "" }));
        blob = await fillDocxMarkers(file, docxMarkers);
      } else {
        blob = await fillDocx(file, values);
      }
      if (sessionIdRef.current !== sessionId) return;
      const cleanName = file.name.replace(/\.docx$/i, "");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${cleanName}-filled.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      toast.success("Đã tạo file đã điền!");
      reset();
      onClose();
    } catch (err) {
      if (sessionIdRef.current !== sessionId) return;
      console.error("Fill docx error:", err);
      toast.error("Lỗi khi tạo file: " + (err as Error).message);
      setStep("review");
    }
  };

  const allFilled = placeholders.length > 0
    ? placeholders.every((p) => (values[p.name] || "").trim() !== "")
    : markers.every((m) => (markerValues[m.marker] || "").trim() !== "");

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Tạo tài liệu từ template"
      titleExtra={<span className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-amber-100 text-amber-700 border border-amber-200">Beta</span>}
      description="Điền placeholder {{...}} vào file .docx, giữ nguyên định dạng gốc"
      icon={<FileType className="w-5 h-5" />}
      size="lg"
      closeOnEsc={step !== "generating"}
      closeOnBackdrop={step !== "generating"}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFileChange}
      />

      {step === "upload" && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handlePickFile}
            className="w-full border-2 border-dashed border-slate-300 hover:border-primary-400 rounded-2xl p-8 text-center transition-colors group"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-primary-50 text-primary-600 rounded-xl group-hover:bg-primary-100 transition-colors">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">Chọn file .docx template</p>
              <p className="text-xs text-slate-400">
                AI sẽ tự tìm chỗ trống (gạch chân, dấu chấm...) hoặc placeholder {`{{TEN_FIELD}}`} để điền (tối đa 5MB)
              </p>
            </div>
          </button>

          {fileError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          {file && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500">Tệp đã chọn:</p>
              <p className="text-sm font-bold text-slate-800 truncate flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary-600 shrink-0" /> {file.name}
              </p>
              <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          )}

          {placeholders.length > 0 && (
            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl">
              <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">
                Phát hiện {placeholders.length} placeholder:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {placeholders.map((p) => (
                  <span
                    key={p.name}
                    className="px-2 py-1 bg-white border border-indigo-200 rounded-lg text-xs font-mono text-indigo-700"
                  >
                    {`{{${p.name}}}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={handleClose}>Hủy</Button>
            <Button
              variant="primary"
              disabled={!file}
              onClick={handleContinue}
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              AI tự động điền
            </Button>
          </div>
        </div>
      )}

      {step === "ai-filling" && (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Loader2 className="w-10 h-10 text-primary-600 animate-spin mb-4" />
          <p className="text-sm font-bold text-slate-700">
            {placeholders.length > 0
              ? `AI đang phân tích ${placeholders.length} placeholder...`
              : "AI đang tìm các chỗ trống cần điền..."}
          </p>
          <p className="text-xs text-slate-400 mt-1">Dựa trên ngữ cảnh cuộc họp</p>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          {aiError && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>AI không thể tự điền. Vui lòng nhập tay các giá trị bên dưới.</span>
            </div>
          )}

          {placeholders.length === 0 && markers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400">
              <FileText className="w-12 h-12 mb-2 opacity-30" />
              <p className="text-sm">Không tìm thấy placeholder {`{{...}}`} hoặc chỗ trống nào trong file.</p>
              <p className="text-xs mt-1">Hãy thử file khác, hoặc thêm placeholder {`{{TEN_FIELD}}`} vào file.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
                Chọn file khác
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Review giá trị trước khi tạo file:
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {placeholders.length > 0
                  ? placeholders.map((p) => (
                      <div key={p.name}>
                        <Input
                          label={p.name}
                          value={values[p.name] || ""}
                          onChange={(e) => setValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
                          placeholder={`Giá trị cho {{${p.name}}}`}
                        />
                      </div>
                    ))
                  : markers.map((m, idx) => (
                      <div key={`${m.marker}-${idx}`}>
                        <Input
                          label={m.marker.length > 40 ? `${m.marker.slice(0, 40)}...` : m.marker}
                          value={markerValues[m.marker] || ""}
                          onChange={(e) => setMarkerValues((prev) => ({ ...prev, [m.marker]: e.target.value }))}
                          placeholder="Giá trị điền vào chỗ trống này"
                        />
                      </div>
                    ))}
              </div>
            </div>
          )}

          <div className="flex justify-between gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!file}
              onClick={handleContinue}
              leftIcon={<Wand2 className="w-4 h-4" />}
            >
              AI điền lại
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>Hủy</Button>
              <Button
                variant="success"
                disabled={!allFilled}
                onClick={handleGenerate}
                leftIcon={<Check className="w-4 h-4" />}
              >
                Tạo file
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === "generating" && (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
          <p className="text-sm font-bold text-slate-700">Đang tạo file...</p>
          <p className="text-xs text-slate-400 mt-1">Giữ nguyên định dạng gốc</p>
        </div>
      )}

      <div className={cn("mt-2 text-xs text-slate-400", step !== "upload" && "hidden")}>
        Tip: Nếu file không có placeholder {`{{TÊN_FIELD}}`}, AI sẽ tự tìm các chỗ trống (gạch chân, dấu chấm...) để điền.
      </div>
    </Modal>
  );
}
