import { NextResponse } from "next/server";
import { verifySystemAdmin } from "@/app/lib/admin-auth";
import { listAdminAccounts } from "@/app/lib/admin-accounts";
import { checkRateLimit } from "@/app/lib/rate-limit";

export async function GET(req: Request) {
  const admin = await verifySystemAdmin(req);
  if (admin instanceof NextResponse) return admin;
  if (!checkRateLimit(`admin-list:${admin.uid}`, 30, 60_000).allowed) return NextResponse.json({ error: "Vui lòng đợi trước khi tải lại." }, { status: 429 });
  const params = new URL(req.url).searchParams;
  const cursor = params.get("cursor") || undefined;
  const email = params.get("email")?.trim().toLowerCase() || undefined;
  if ((cursor && cursor.length > 4096) || (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) {
    return NextResponse.json({ error: "Bộ lọc không hợp lệ." }, { status: 400 });
  }
  try { return NextResponse.json(await listAdminAccounts(cursor, email), { headers: { "Cache-Control": "no-store" } }); }
  catch (error: any) {
    if (error.code === "auth/user-not-found") return NextResponse.json({ accounts: [], nextCursor: null, generatedAt: Date.now() }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "Không tải được danh sách tài khoản." }, { status: 503 });
  }
}
