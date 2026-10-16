"use client";
import { useState } from "react";
import { saveMember, type Member } from "@/app/lib/db";

export default function AddAssignee({ userId, members, onAdd }: { userId: string; members: Member[]; onAdd: (member: Member) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs text-indigo-600 text-left mt-2">+ Nhập người mới</button>;
  return <form className="mt-2 space-y-2" onSubmit={async e => {
    e.preventDefault();
    if (saving || !name.trim() || !email.trim()) return;
    setSaving(true); setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = members.find(m => m.email.toLowerCase() === normalizedEmail);
      const member = existing || { id: crypto.randomUUID(), name: name.trim(), email: normalizedEmail };
      if (!existing) await saveMember(userId, member);
      onAdd(member);
      setOpen(false); setName(""); setEmail("");
    } catch { setError("Không thể lưu người nhận. Vui lòng thử lại."); }
    finally { setSaving(false); }
  }}>
    <input aria-label="Tên người thực hiện" required value={name} onChange={e => setName(e.target.value)} placeholder="Họ tên" disabled={saving} className="w-full border rounded p-2 text-sm" />
    <input aria-label="Email người thực hiện" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" disabled={saving} className="w-full border rounded p-2 text-sm" />
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    <button type="submit" disabled={saving} className="text-sm text-indigo-700 mr-3">{saving ? "Đang lưu…" : "Thêm người nhận"}</button>
    <button type="button" disabled={saving} onClick={() => setOpen(false)} className="text-sm text-slate-500">Hủy</button>
  </form>;
}
