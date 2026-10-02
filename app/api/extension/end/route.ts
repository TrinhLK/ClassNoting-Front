import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { getExtSession } from "@/app/lib/ext-sessions";
import { finalizeExtSession } from "@/app/lib/ext-finalize";

export const dynamic = "force-dynamic";

/** Kết thúc phiên extension → kết xuất Meeting (segments + speakers + chat + stats). */
export async function POST(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkRateLimit(`ext:end:${auth.uid}:${ip}`, 20, 5 * 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  try {
    const session = await getExtSession(body.sessionId);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (session.ownerUid !== auth.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Idempotent: đã end trước đó → trả meetingId cũ.
    if (session.status === "ended" && session.meetingId) {
      return NextResponse.json({ ok: true, meetingId: session.meetingId, reused: true });
    }
    if (session.status === "ended") {
      return NextResponse.json({ ok: true, meetingId: null, reused: true, empty: true });
    }

    const result = await finalizeExtSession(session, auth.uid);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[ext/end] failed:", e);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
