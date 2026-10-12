import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/app/lib/firebase-admin";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";

type Context = { params: Promise<{ id: string }> };
async function handle(req: Request, ctx: Context, remove: boolean) {
  const auth = remove ? await verifyExtensionAuth(req) : null;
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const ref = getAdminDb().collection("live_sessions").doc(id);
  try {
    const result = await getAdminDb().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { status: 404, body: { error: "Phiên live đã bị xóa hoặc không tồn tại." } };
      const data = snap.data()!;
      if (remove && data.hostId !== auth?.uid) return { status: 403, body: { error: "Tài khoản này không sở hữu phiên live." } };
      if (remove) {
        tx.delete(ref);
        return { status: 200, body: { ok: true } };
      }
      // Migrate surviving legacy sessions on public access; never recreate deleted ones.
      if (data.expireAt !== undefined) tx.update(ref, { expireAt: FieldValue.delete() });
      return { status: 200, body: {
        id: snap.id, hostId: data.hostId, title: data.title,
        language: data.language, segments: data.segments || [],
        summary: data.summary || "", status: data.status, startedAt: data.startedAt,
      } };
    });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Live session access failed", error);
    return NextResponse.json({ error: "Không thể tải phiên live. Vui lòng thử lại." }, { status: 500 });
  }
}
export const GET = (req: Request, ctx: Context) => handle(req, ctx, false);
export const DELETE = (req: Request, ctx: Context) => handle(req, ctx, true);
