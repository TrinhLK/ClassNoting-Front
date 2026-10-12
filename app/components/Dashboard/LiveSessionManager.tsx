"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, Copy, Trash2, RefreshCw } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useGlobalUI } from "../../context/GlobalUIProvider";

type Session = { id: string; title: string; status: "live" | "ended"; startedAt: number; summarizedAt?: number };
export default function LiveSessionManager({ refreshSignal }: { refreshSignal: number }) {
  const { user } = useAuth();
  const { toast, confirm } = useGlobalUI();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setSessions([]);
    setLoading(true);
    setError("");
    if (!user) { setLoading(false); return; }
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/live", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!response.ok) throw new Error("Không thể tải danh sách phiên live.");
        const data = await response.json();
        if (active) setSessions(data.sessions);
      } catch {
        if (active) setError("Không thể tải danh sách phiên live. Hãy thử làm mới.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [user, revision, refreshSignal]);

  const remove = async (session: Session) => {
    if (!user || deleting) return;
    if (!await confirm({ title: "Xóa phiên live?", message: `Xóa “${session.title}”? Nội dung phiên sẽ bị xóa vĩnh viễn và link chia sẻ sẽ ngừng hoạt động.`, confirmText: "Xóa phiên", type: "danger" })) return;
    setDeleting(session.id);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/live/${encodeURIComponent(session.id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok && response.status !== 404) throw new Error();
      setSessions(items => items.filter(s => s.id !== session.id));
      toast.success("Đã xóa phiên live.");
    } catch { toast.error("Không thể xóa phiên live. Vui lòng thử lại."); }
    finally { setDeleting(null); }
  };
  const filtered = sessions.filter(s => (s.title || "").toLocaleLowerCase("vi").includes(search.trim().toLocaleLowerCase("vi")));
  return (
    <section aria-label="Phiên live của tôi" className="mb-6 bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-4 flex flex-wrap items-center gap-3 border-b border-slate-100">
        <Radio className="w-5 h-5 text-indigo-600" />
        <h2 className="font-bold text-slate-800">Phiên live của tôi {!loading && `(${sessions.length})`}</h2>
        <button onClick={() => setRevision(n => n + 1)} disabled={loading} className="ml-auto text-sm text-indigo-700 flex items-center gap-1 disabled:opacity-50"><RefreshCw className="w-4 h-4" />Làm mới</button>
        <p className="w-full text-sm text-slate-500">Mở lại phiên để xem nội dung và tóm tắt lại. Người có link được xem cho đến khi bạn xóa phiên.</p>
      </div>
      {loading ? <p role="status" className="p-4 text-sm text-slate-500">Đang tải phiên live…</p> : error ? <p role="alert" className="p-4 text-red-600 text-sm">{error}</p> : sessions.length === 0 ? <p className="p-4 text-sm text-slate-500">Bạn chưa có phiên live nào. Chọn “Ghi âm trực tiếp” để tạo phiên mới.</p> : <>
        <div className="p-4"><input aria-label="Tìm phiên live" placeholder="Tìm phiên live theo tên…" value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
        <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
          {filtered.map(s => <li key={s.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <Link href={`/live/${encodeURIComponent(s.id)}`} className="block truncate font-medium text-indigo-700 hover:underline">{s.title || "Phiên live"}</Link>
              <p className="text-xs text-slate-500 mt-1">{new Date(s.startedAt).toLocaleString("vi-VN")} · {s.status === "live" ? "Đang live" : "Đã kết thúc"}{s.summarizedAt ? " · Đã có tóm tắt toàn phiên" : ""}</p>
            </div>
            <Link href={`/live/${encodeURIComponent(s.id)}`} className="text-sm text-indigo-700 px-2 py-1">Mở phiên</Link>
            <button aria-label={`Sao chép link ${s.title}`} title="Sao chép link" onClick={async () => {
              try { await navigator.clipboard.writeText(`${window.location.origin}/live/${encodeURIComponent(s.id)}`); toast.success("Đã sao chép link phiên live."); }
              catch { toast.error("Không thể sao chép link."); }
            }} className="p-2 rounded-lg hover:bg-indigo-50 text-indigo-600"><Copy className="w-4 h-4" /></button>
            <button aria-label={`Xóa phiên ${s.title}`} title="Xóa phiên" onClick={() => remove(s)} disabled={!!deleting} className="p-2 rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
          </li>)}
          {!filtered.length && <li className="p-4 text-sm text-slate-500">Không tìm thấy phiên phù hợp.</li>}
        </ul>
      </>}
    </section>
  );
}
