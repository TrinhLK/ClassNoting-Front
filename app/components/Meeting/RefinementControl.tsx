"use client";
import { useEffect, useState } from "react";
import { auth } from "@/app/lib/firebase";
import { getMeetingById, type Meeting } from "@/app/lib/db";

export default function RefinementControl({ meeting, onUpdate }: { meeting: Meeting; onUpdate: (m: Meeting) => void }) {
  const [status, setStatus] = useState(meeting.refinement?.status || "");
  const [error, setError] = useState(meeting.refinement?.error || "");
  async function request(method: "POST" | "GET") {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/meetings/${encodeURIComponent(meeting.id)}/refine`, { method, headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Hậu xử lý thất bại");
    setStatus(data.refinement?.status || ""); setError(data.refinement?.error || "");
    if (data.refinement?.status === "completed") {
      const updated = await getMeetingById(meeting.id); if (updated) onUpdate(updated);
    }
  }
  useEffect(() => {
    if (!["queued", "running"].includes(status)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await request("GET"); } catch (e) { if (!cancelled) setError(String(e instanceof Error ? e.message : e)); }
      if (!cancelled) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
    // request reads the current meeting; restart polling when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, meeting.id]);
  if (!meeting.audioUrl && !meeting.extensionSessionId) return null;
  const busy = ["starting", "queued", "running"].includes(status);
  return <div className="px-4 py-2 text-sm border-b flex flex-wrap items-center gap-3">
    <button type="button" disabled={busy} className="text-indigo-700 disabled:opacity-50" onClick={async () => {
      setError(""); setStatus("starting");
      try { await request("POST"); } catch (e) { setStatus("failed"); setError(e instanceof Error ? e.message : String(e)); }
    }}>{busy ? "Đang phân tích lại người nói…" : "Phân tích lại người nói từ audio"}</button>
    <span className="text-slate-500">{status === "completed" ? "Đã cập nhật transcript. Có thể tạo lại tóm tắt." : "Giữ các đoạn đã chỉnh sửa thủ công."}</span>
    {error && <span role="alert" className="text-amber-700">{error}</span>}
  </div>;
}
