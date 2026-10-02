import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { listLiveSessions, normalizeMeetingUrl } from "@/app/lib/ext-sessions";

export const dynamic = "force-dynamic";

/**
 * Web app hỏi: user này có phiên extension nào đang live cho link Meet này không?
 * Dùng sau khi bấm "Tham gia" (bot) để tự mở tab live song song (/ext/[id]).
 * Auth bằng Firebase ID Token (web client lấy qua user.getIdToken()).
 */
export async function GET(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkRateLimit(`ext:live:${auth.uid}:${ip}`, 60, 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { searchParams } = new URL(req.url);
  const meetingUrl = (searchParams.get("meetingUrl") || "").trim();
  if (!meetingUrl) return NextResponse.json({ error: "Missing meetingUrl" }, { status: 400 });

  try {
    const live = await listLiveSessions(auth.uid);
    const canonical = normalizeMeetingUrl(meetingUrl);
    const match = live.find((s) => normalizeMeetingUrl(s.meetingUrl) === canonical);
    if (!match) return NextResponse.json({ ok: false }, { status: 404 });
    return NextResponse.json({
      ok: true,
      sessionId: match.id,
      title: match.title,
      provider: match.provider,
      startedAt: match.startedAt,
      participantCount: match.participants.length,
    });
  } catch (e) {
    console.error("[ext/live] failed:", e);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
