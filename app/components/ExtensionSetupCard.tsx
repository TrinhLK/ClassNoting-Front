"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Puzzle, RefreshCw } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { EXTENSION_IDS, EXTENSION_STORE_PUBLISHED, EXTENSION_STORE_URL, messageExtension } from "../lib/extension-config";

type Status = "checking" | "connected" | "installed" | "unavailable";

export default function ExtensionSetupCard({ detailed = false }: { detailed?: boolean }) {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<Status>("checking");
  const [storePublished, setStorePublished] = useState(EXTENSION_STORE_PUBLISHED);
  useEffect(() => {
    const controller = new AbortController();
    const refreshStore = () => {
      void fetch("/api/extension/store", { signal: controller.signal })
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (!controller.signal.aborted && data?.published === true) setStorePublished(true); })
        .catch(() => {});
    };
    refreshStore();
    window.addEventListener("focus", refreshStore);
    return () => { controller.abort(); window.removeEventListener("focus", refreshStore); };
  }, []);
  const check = useCallback(async () => {
    if (loading) return;
    setStatus("checking");
    const token = user ? await user.getIdToken().catch(() => null) : null;
    const replies = await Promise.all(EXTENSION_IDS.map(async id => {
      const ping = await messageExtension(id, { type: "CLASSNOTING_PING" }) as { ok?: boolean } | null;
      if (!token || !user) return ping?.ok ? "installed" : "unavailable";
      const auth = await messageExtension(id, {
        type: "CLASSNOTING_AUTH", idToken: token, uid: user.uid,
        email: user.email, displayName: user.displayName,
      }) as { ok?: boolean } | null;
      return auth?.ok ? "connected" : ping?.ok ? "installed" : "unavailable";
    }));
    setStatus(replies.includes("connected") ? "connected" : replies.includes("installed") ? "installed" : "unavailable");
  }, [user, loading]);

  useEffect(() => {
    void check();
    const onFocus = () => { void check(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [check]);

  const label = status === "connected" ? "Đã kết nối tài khoản" : status === "installed" ? "Đã cài · cần đăng nhập" : status === "checking" ? "Đang kiểm tra…" : "Chưa kết nối";
  return (
    <section aria-label="EzNoting cho Google Meet" className="mb-6 rounded-2xl border border-primary-100 bg-white p-4 md:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Puzzle className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="font-bold text-slate-800">Ghi chú Google Meet</h2>
              <span role="status" className={`inline-flex items-center gap-1 text-xs ${status === "connected" ? "text-emerald-700" : "text-slate-500"}`}>
                {status === "connected" && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}{label}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">Dùng extension EzNoting để xem lời nói, người nói và chat trực tiếp trên web.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void check()} disabled={status === "checking" || loading} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${status === "checking" ? "animate-spin" : ""}`} aria-hidden="true" />Kiểm tra kết nối</button>
          {!detailed && <Link href="/extension" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Xem hướng dẫn<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
          {storePublished ? <a href={EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700">Cài từ Chrome Web Store</a> : <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">Chrome Store · đang chờ duyệt</span>}
        </div>
      </div>
      {detailed && <div className="mt-4 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600">
        {!storePublished && <p>Extension đã được gửi tới Google để xét duyệt. Web kiểm tra trang Chrome Web Store khi bạn mở hoặc quay lại trang; nút cài đặt chỉ mở khi xác minh được trang công khai.</p>}
        {status === "unavailable" && <p>Không liên lạc được với extension trong profile này. Nếu đã cài, hãy tải lại trang EzNoting, kiểm tra extension đang bật rồi bấm “Kiểm tra kết nối”.</p>}
        {!user && <p className="mt-2"><Link href="/login" className="font-semibold text-primary-600 underline">Đăng nhập EzNoting</Link> trong cùng profile Chrome để kết nối tài khoản.</p>}
        {status === "connected" && <p>Web đã gửi đăng nhập sang extension. Để ghi cuộc họp, mở tab Meet rồi bấm biểu tượng EzNoting → “Bắt đầu tab này”.</p>}
      </div>}
    </section>
  );
}
