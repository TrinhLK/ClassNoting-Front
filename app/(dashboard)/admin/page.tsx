"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, KeyRound, RefreshCw, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { isSystemAdminIdentity } from "@/app/lib/admin-identity";
import Button from "@/app/components/ui/Button";
import Card from "@/app/components/ui/Card";

type Account = {
  uid: string; email: string; displayName: string; disabled: boolean; emailVerified: boolean; isAdmin: boolean;
  createdAt: number | null; lastSignInAt: number | null; lastSeenAt: number | null; hasPersonalKey: boolean;
  freeUsed: number; freePending: number; freeLimit: number | null; freeRemaining: number | null;
  unlimited: boolean; finiteLimit: number;
};
type AccountsResult = { accounts: Account[]; nextCursor: string | null; generatedAt: number };
const count = (n: number) => n.toLocaleString("vi-VN");
const date = (value: number | null) => value ? new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
}).format(value) : "Chưa ghi nhận";

export default function AdminAccountsPage() {
  const { user } = useAuth();
  const isAdmin = isSystemAdminIdentity(user);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [amount, setAmount] = useState("10");
  const [unlimited, setUnlimited] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const identityRef = useRef(user?.uid);
  identityRef.current = user?.uid;
  const requestVersion = useRef(0);
  const mutationBusy = useRef(false);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    if (!user || !isSystemAdminIdentity(user)) throw new Error("Không có quyền quản trị.");
    const token = await user.getIdToken();
    const response = await fetch(path, { ...init, cache: "no-store", headers: {
      "Content-Type": "application/json", Authorization: `Bearer ${token}`,
    } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Không xử lý được yêu cầu quản trị.");
    return body;
  }, [user]);

  const load = useCallback(async (cursor?: string, email?: string) => {
    if (!isSystemAdminIdentity(user)) return;
    const uid = user!.uid;
    const version = ++requestVersion.current;
    setLoading(true); setError(""); setMessage("");
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (email) params.set("email", email);
      const data: AccountsResult = await request(`/api/admin/accounts${params.size ? `?${params}` : ""}`);
      if (identityRef.current !== uid || version !== requestVersion.current) return;
      setAccounts(current => cursor || email
        ? [...new Map([...current, ...data.accounts].map(account => [account.uid, account])).values()]
        : data.accounts);
      if (!email) setNextCursor(data.nextCursor);
      if (!cursor && !email) { setPage(0); setSelectedUid(null); }
      if (email && !data.accounts.length) setMessage("Không tìm thấy tài khoản có email này.");
      setLoaded(true);
    } catch (e) {
      if (identityRef.current === uid && version === requestVersion.current) setError(e instanceof Error ? e.message : "Không tải được tài khoản.");
    } finally {
      if (identityRef.current === uid && version === requestVersion.current) setLoading(false);
    }
  }, [request, user]);

  useEffect(() => {
    setAccounts([]); setNextCursor(null); setLoaded(false); setSelectedUid(null); setError(""); setMessage("");
    if (isAdmin) void load();
    return () => { requestVersion.current += 1; };
  }, [isAdmin, load]);
  useEffect(() => setPage(0), [query, filter]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("vi");
    return accounts.filter(account => (!search || `${account.email} ${account.displayName}`.toLocaleLowerCase("vi").includes(search))
      && (filter === "all" || (filter === "enabled" ? !account.disabled : account.disabled)))
      .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
  }, [accounts, query, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pages - 1);
  const selected = accounts.find(account => account.uid === selectedUid);
  const validAmount = /^\d+$/.test(amount) && Number(amount) >= 1 && Number(amount) <= 1_000_000;
  const stats = [
    { label: nextCursor ? "Tài khoản đã tải" : "Tổng tài khoản", value: accounts.length, Icon: Users },
    { label: "Hoạt động 7 ngày", value: accounts.filter(account => !account.disabled && (account.lastSeenAt || 0) >= Date.now() - 7 * 86400_000).length, Icon: Activity },
    { label: "Dùng AI hệ thống", value: accounts.filter(account => account.freeUsed > 0).length, Icon: Sparkles },
    { label: "Có key riêng", value: accounts.filter(account => account.hasPersonalKey).length, Icon: KeyRound },
  ];

  async function change(action: "add" | "unlimited") {
    if (!selected || selected.disabled || selected.isAdmin || mutationBusy.current || !user) return;
    const target = selected;
    const uid = user.uid;
    mutationBusy.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result: { uid: string; limit: number; unlimited: boolean } = await request(`/api/admin/accounts/${encodeURIComponent(target.uid)}/quota`, {
        method: "PATCH", body: JSON.stringify(action === "add" ? { action, amount: Number(amount) } : { action, unlimited }),
      });
      if (identityRef.current !== uid) return;
      setAccounts(current => current.map(account => account.uid !== result.uid ? account : {
        ...account, finiteLimit: result.limit, unlimited: result.unlimited, freeLimit: result.unlimited ? null : result.limit,
        freeRemaining: result.unlimited ? null : Math.max(0, result.limit - account.freeUsed - account.freePending),
      }));
      setUnlimited(result.unlimited);
      setMessage(action === "add" ? `Đã cộng ${count(Number(amount))} lượt cho ${target.email || target.displayName}. Tổng hạn mức hữu hạn: ${count(result.limit)} cuộc họp.`
        : `Đã ${result.unlimited ? "bật không giới hạn" : `khôi phục hạn mức ${count(result.limit)} cuộc họp`} cho ${target.email || target.displayName}.`);
    } catch (e) { if (identityRef.current === uid) setError(e instanceof Error ? e.message : "Không cập nhật được hạn mức."); }
    finally { mutationBusy.current = false; if (identityRef.current === uid) setSaving(false); }
  }

  if (!isAdmin) return <div className="p-8"><h1 className="text-xl font-bold text-slate-900">Không có quyền quản trị</h1><p className="mt-2 text-sm text-slate-500">Trang này chỉ dành cho tài khoản quản trị hệ thống được chỉ định.</p></div>;

  return <div className="h-full overflow-y-auto px-4 py-6 md:px-8 md:py-8">
    <div className="mx-auto max-w-[1440px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-slate-900">Quản trị hệ thống</h1><span className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700"><ShieldCheck className="h-3.5 w-3.5" />Quản trị viên</span></div><p className="mt-2 text-sm text-slate-500">Tài khoản &amp; hạn mức AI · {user?.email}</p></div>
        <Button variant="outline" disabled={loading || saving} onClick={() => void load()} leftIcon={<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />}>Làm mới</Button>
      </header>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{stats.map(({ label, value, Icon }) => <Card key={label} className="!p-4 md:!p-5"><Icon className="mb-3 h-5 w-5 text-primary-600" /><p className="text-2xl font-bold text-slate-900">{loaded ? count(value) : "—"}</p><h2 className="mt-1 text-xs text-slate-500">{label}</h2></Card>)}</div>
      <p className="text-xs leading-relaxed text-slate-500">Hoạt động gần đây dựa trên mốc truy cập, đăng nhập hoặc sử dụng AI; không khẳng định tài khoản đang online. {nextCursor && "Thống kê tính trên các tài khoản đã tải; chọn Tải thêm để xem tiếp."}</p>
      {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      <div className={`grid items-start gap-5 ${selected ? "2xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
        <Card padding={false} className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <form className="flex min-w-0 flex-1 flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if (query.trim().includes("@")) void load(undefined, query.trim()); }}>
              <label htmlFor="account-search" className="sr-only">Tìm tên hoặc email tài khoản</label><input id="account-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm tên hoặc email…" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <Button size="sm" variant="secondary" type="submit" disabled={loading || saving || !query.trim().includes("@")}>Tìm email</Button>
            </form>
            <label className="sr-only" htmlFor="account-state">Trạng thái tài khoản</label><select id="account-state" value={filter} onChange={e => setFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">Tất cả trạng thái</option><option value="enabled">Đang kích hoạt</option><option value="disabled">Vô hiệu hóa</option></select>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Tài khoản", "Hoạt động gần nhất", "Đã dùng AI hệ thống", "Hạn mức", "Key riêng", "Thao tác"].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{filtered.slice(currentPage * 25, currentPage * 25 + 25).map(account => <tr key={account.uid} className={selectedUid === account.uid ? "bg-primary-50/50" : "hover:bg-slate-50/50"}>
              <td className="max-w-[260px] px-4 py-4"><p className="truncate font-semibold text-slate-800">{account.displayName || "Chưa có tên"}</p><p className="mt-0.5 truncate text-xs text-slate-500">{account.email || "Chưa có email"}</p>{account.isAdmin && <span className="mt-1 inline-block text-xs font-medium text-primary-700">Quản trị hệ thống</span>}{account.disabled && <span className="mt-1 inline-block text-xs font-medium text-red-600">Vô hiệu hóa</span>}</td>
              <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">{date(account.lastSeenAt)}</td>
              <td className="px-4 py-4"><span className="font-semibold text-slate-800">{count(account.freeUsed)}</span>{account.freePending > 0 && <p className="mt-1 text-xs text-slate-500">{account.freePending} đang xử lý</p>}</td>
              <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold text-primary-700">{account.unlimited ? "Không giới hạn" : `${count(account.freeLimit ?? 10)} cuộc họp`}</td>
              <td className="px-4 py-4 text-xs text-slate-500">{account.hasPersonalKey ? "Đã gắn" : "Chưa gắn"}</td>
              <td className="px-4 py-4"><Button size="sm" variant="outline" disabled={account.disabled || account.isAdmin || saving} onClick={() => { setSelectedUid(account.uid); setAmount("10"); setUnlimited(account.unlimited); setError(""); setMessage(""); }}>Điều chỉnh</Button></td>
            </tr>)}</tbody>
          </table></div>
          {!filtered.length && <p className="p-8 text-center text-sm text-slate-500">{loading ? "Đang tải tài khoản…" : loaded ? "Không có tài khoản phù hợp." : "Chưa tải được dữ liệu. Bấm Làm mới để thử lại."}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 text-xs text-slate-500"><span>{filtered.length} tài khoản phù hợp · Trang {currentPage + 1}/{pages}</span><div className="flex gap-2"><Button size="sm" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Trước</Button><Button size="sm" variant="ghost" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Sau</Button>{nextCursor && <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void load(nextCursor)}>Tải thêm tài khoản</Button>}</div></div>
        </Card>
        {selected && <Card className="space-y-5">
          <div className="flex items-center justify-between gap-2"><h2 className="font-bold text-slate-900">Điều chỉnh hạn mức</h2><button type="button" aria-label="Đóng điều chỉnh hạn mức" disabled={saving} onClick={() => setSelectedUid(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
          <div><p className="font-semibold text-slate-800">{selected.displayName || "Chưa có tên"}</p><p className="mt-1 break-all text-xs text-slate-500">{selected.email}</p><p className="mt-2 text-xs text-slate-500">Tạo lúc: {date(selected.createdAt)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><p>Đã dùng: <strong>{count(selected.freeUsed)}</strong> cuộc họp</p><p className="mt-1">Hạn mức hữu hạn: <strong>{count(selected.finiteLimit)}</strong></p>{selected.unlimited && <p className="mt-1 font-semibold text-primary-700">Đang không giới hạn</p>}</div>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (validAmount) void change("add"); }}><label htmlFor="quota-increment" className="block text-sm font-medium text-slate-700">Tăng thêm số lượt</label><input id="quota-increment" inputMode="numeric" type="number" min={1} max={1000000} step={1} value={amount} onChange={e => setAmount(e.target.value)} disabled={saving} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><Button type="submit" disabled={!validAmount || saving} loading={saving}>Cộng lượt</Button></form>
          <div className="space-y-3 border-t border-slate-100 pt-4"><label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700" htmlFor="quota-unlimited">Không giới hạn AI<input id="quota-unlimited" type="checkbox" role="switch" checked={unlimited} onChange={e => setUnlimited(e.target.checked)} disabled={saving} className="h-4 w-4 accent-indigo-600" /></label><Button variant="secondary" disabled={saving || unlimited === selected.unlimited} onClick={() => void change("unlimited")}>Lưu chế độ</Button></div>
          <p className="text-xs leading-relaxed text-slate-500">Cấp thêm lượt không xóa lịch sử đã dùng. Cùng một cuộc họp được tóm tắt lại không tính thêm lượt. Khi tắt không giới hạn, hạn mức hữu hạn bên trên được áp dụng lại; số đã dùng được giữ nguyên. Thay đổi được lưu nhật ký.</p>
        </Card>}
      </div>
    </div>
  </div>;
}
