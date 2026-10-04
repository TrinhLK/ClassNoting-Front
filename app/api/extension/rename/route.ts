import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { getExtSession, patchExtSession } from "@/app/lib/ext-sessions";

export const dynamic = "force-dynamic";

/** Đổi tên phiên ghi (popup extension) — meeting kết xuất sau mang tên đã sửa. */
export async function POST(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkRateLimit(`ext:rename:${auth.uid}:${ip}`, 30, 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { sessionId?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = (body.title || "").trim().slice(0, 120);
  if (!body.sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

  try {
    const session = await getExtSession(body.sessionId);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (session.ownerUid !== auth.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const updated = await patchExtSession(body.sessionId, { title });
    return NextResponse.json({ ok: true, title: updated?.title ?? title });
  } catch (e) {
    console.error("[ext/rename] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
