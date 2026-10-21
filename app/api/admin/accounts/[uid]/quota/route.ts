import { NextResponse } from "next/server";
import { verifySystemAdmin } from "@/app/lib/admin-auth";
import { changeAccountQuota } from "@/app/lib/admin-accounts";
import { AiAccountError } from "@/app/lib/ai-account";
import { checkRateLimit } from "@/app/lib/rate-limit";

export async function PATCH(req: Request, ctx: { params: Promise<{ uid: string }> }) {
  const admin = await verifySystemAdmin(req);
  if (admin instanceof NextResponse) return admin;
  if (!checkRateLimit(`admin-quota:${admin.uid}`, 30, 60_000).allowed) return NextResponse.json({ error: "Vui lòng đợi trước khi thay đổi tiếp." }, { status: 429 });
  try {
    const { uid } = await ctx.params;
    const result = await changeAccountQuota(admin.uid, uid, await req.json());
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const status = error instanceof AiAccountError ? error.status : error instanceof SyntaxError ? 400 : error.code === "auth/user-not-found" ? 404 : 503;
    return NextResponse.json({ error: error instanceof AiAccountError ? error.message : status === 404 ? "Tài khoản không tồn tại." : status === 400 ? "Yêu cầu không hợp lệ." : "Không cập nhật được hạn mức." }, { status });
  }
}
