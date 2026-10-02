import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { listLiveSessions } from "@/app/lib/ext-sessions";
import { endStaleSessions } from "@/app/lib/ext-finalize";

export const dynamic = "force-dynamic";

/**
 * Liệt kê phiên extension đang live của user (popup dùng để "kết thúc tất cả",
 * kể cả phiên mồ côi mà RAM service worker đã quên).
 */
export async function GET(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkRateLimit(`ext:sessions:${auth.uid}:${ip}`, 60, 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    await endStaleSessions(auth.uid).catch(() => {});
    const live = await listLiveSessions(auth.uid);
    return NextResponse.json({
      ok: true,
      sessions: live.map((s) => ({
        sessionId: s.id,
        title: s.title,
        provider: s.provider,
        meetingUrl: s.meetingUrl,
        startedAt: s.startedAt,
        updatedAt: s.updatedAt,
        participantCount: s.participants.length,
        chatCount: s.chatMessages.length,
        segmentCount: s.liveSegments.length,
      })),
    });
  } catch (e) {
    console.error("[ext/sessions] failed:", e);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
