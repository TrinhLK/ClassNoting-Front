"use client";

import { useEffect, useRef, useState } from "react";
import { Info, KeyRound, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import Button from "@/app/components/ui/Button";
import Card from "@/app/components/ui/Card";

type AiStatus = { hasKey: boolean; keySuffix: string | null; freeLimit: number; freeUsed: number; freePending: number; freeRemaining: number };

export default function AccountSettings() {
  const { user } = useAuth();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [paidServiceConfirmed, setPaidServiceConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const identityRef = useRef(user?.uid);
  identityRef.current = user?.uid;

  async function request(method = "GET") {
    if (!user) return;
    const uid = user.uid;
    setBusy(true); setError(""); setMessage("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/account/ai", {
        method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(method === "PUT" ? { body: JSON.stringify({ apiKey, paidServiceConfirmed }) } : {}),
        cache: "no-store",
      });
      const data = await response.json();
      if (identityRef.current !== uid) return;
      if (!response.ok) throw new Error(data.error || "Không xử lý được thiết lập AI.");
      setStatus(data);
      if (method !== "GET") { setApiKey(""); setPaidServiceConfirmed(false); setMessage(method === "PUT" ? "Đã kiểm tra và lưu key riêng. Các yêu cầu AI tiếp theo sẽ dùng key này." : "Đã xóa key riêng. Hạn mức miễn phí đã dùng được giữ nguyên."); }
    } catch (e) {
      if (identityRef.current === uid) setError(e instanceof Error ? e.message : "Không kết nối được máy chủ.");
    } finally { if (identityRef.current === uid) setBusy(false); }
  }
  useEffect(() => {
    setStatus(null); setApiKey(""); setPaidServiceConfirmed(false); setBusy(false); setError(""); setMessage("");
    void request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  return <div className="h-full overflow-y-auto px-4 py-6 md:px-8 md:py-10">
    <div className="mx-auto max-w-[760px] space-y-6">
      <header><h1 className="text-2xl font-bold text-slate-900">Thiết lập tài khoản</h1><p className="mt-1 text-sm text-slate-500 break-all">{user?.email}</p></header>
      <div className="border-b border-slate-200"><span className="inline-flex border-b-2 border-primary-600 px-4 py-2 text-sm font-semibold text-primary-600">AI &amp; Gemini</span></div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">Miễn phí 10 cuộc họp</h2><span className="text-sm text-slate-500">{status ? `Đã dùng ${status.freeUsed}/${status.freeLimit}` : "Đang tải hạn mức…"}</span></div>
        {status && <><div className="my-4 h-2 overflow-hidden rounded-full bg-primary-100" role="progressbar" aria-label="Cuộc họp miễn phí đã dùng" aria-valuenow={status.freeUsed} aria-valuemin={0} aria-valuemax={status.freeLimit}><div className="h-full rounded-full bg-primary-600" style={{ width: `${Math.min(100, status.freeUsed / status.freeLimit * 100)}%` }} /></div><p className="mb-3 text-sm text-slate-600">Còn {status.freeRemaining} cuộc họp miễn phí{status.freePending ? ` · ${status.freePending} cuộc họp đang xử lý` : ""}. {status.hasKey && "Bạn đang dùng key riêng, không trừ lượt miễn phí."}</p></>}
        <div className="flex gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500"><Info className="mt-0.5 h-4 w-4 shrink-0" /><p>Mỗi cuộc họp chỉ tính một lượt khi AI xử lý thành công lần đầu, kể cả Live insight. Tóm tắt lại cùng cuộc họp không tính thêm lượt. Lượt không đặt lại theo tháng; yêu cầu thất bại không tính lượt.</p></div>
        <button type="button" onClick={() => void request()} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />Cập nhật hạn mức</button>
      </Card>
      <Card>
        <section id="gemini" aria-labelledby="gemini-heading" className="scroll-mt-6 space-y-4">
          <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary-600" /><h2 id="gemini-heading" className="font-semibold text-slate-900">Gemini API key riêng</h2></div>
          {status?.hasKey && <p className="flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="h-4 w-4" />Đang dùng key riêng · kết thúc bằng ••••{status.keySuffix}</p>}
          <form onSubmit={e => { e.preventDefault(); void request("PUT"); }} className="space-y-3">
            <label htmlFor="gemini-api-key" className="block text-sm font-medium text-slate-700">{status?.hasKey ? "Thay API key" : "Gemini API key"}</label>
            <input ref={inputRef} id="gemini-api-key" type="password" autoComplete="off" spellCheck={false} maxLength={104} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Nhập API key từ Google AI Studio" disabled={busy || !status} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-primary-500" />
            <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600"><input type="checkbox" checked={paidServiceConfirmed} onChange={e => setPaidServiceConfirmed(e.target.checked)} disabled={busy} className="mt-0.5" /><span>Tôi xác nhận project cấp key đã bật Cloud Billing. Gemini miễn phí có thể dùng dữ liệu để cải thiện sản phẩm; Smart Noting yêu cầu Paid Services cho nội dung cuộc họp. Có API key chưa đồng nghĩa đã bật billing.</span></label>
            <div className="flex flex-wrap gap-2"><Button type="submit" loading={busy} disabled={!status || !apiKey.trim() || !paidServiceConfirmed} leftIcon={<KeyRound className="h-4 w-4" />}>Kiểm tra &amp; lưu</Button>{status?.hasKey && <Button type="button" variant="secondary" disabled={busy} onClick={() => void request("DELETE")}>Xóa key</Button>}</div>
          </form>
          <div className="space-y-2 text-xs leading-relaxed text-slate-500">
            <p>Key được gửi qua kết nối HTTPS tới Smart Noting, mã hóa trên máy chủ và chỉ dùng để gọi Google Gemini cho tài khoản của bạn. Key không nằm trong extension và không hiển thị lại toàn bộ.</p>
            <p>“Kiểm tra &amp; lưu” gửi một câu kiểm tra ngắn tới Google, có thể dùng một lượng nhỏ hạn mức API. Khi có key riêng, các tính năng AI dùng hạn mức và chi phí của project của bạn; key lỗi sẽ được báo và không tự chuyển sang key hệ thống.</p>
            <p>Tạo key tại <a className="font-medium text-primary-600 underline" href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer">Google AI Studio</a>. API có billing/hạn mức riêng với gói ứng dụng Gemini. Hãy kiểm tra billing và <a className="text-primary-600 underline" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">chính sách dữ liệu của Google</a> trước khi gửi nội dung cuộc họp.</p>
          </div>
        </section>
      </Card>
      {status && !status.hasKey && status.freeRemaining === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">{status.freeUsed >= status.freeLimit ? "Bạn đã dùng hết 10 cuộc họp miễn phí." : "Các lượt miễn phí còn lại đang được xử lý."}</p><p className="mt-1 text-sm text-amber-800">Thêm Gemini API key riêng để tóm tắt cuộc họp mới. Các cuộc họp đã tính lượt vẫn được thử lại.</p><button onClick={() => inputRef.current?.focus()} className="mt-3 text-sm font-semibold text-primary-700">Thiết lập Gemini</button></div>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    </div>
  </div>;
}
