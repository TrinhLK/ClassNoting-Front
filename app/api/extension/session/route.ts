import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { getOrCreateLiveSession } from "@/app/lib/ext-sessions";
import { endStaleSessions } from "@/app/lib/ext-finalize";
import { detectProvider, PROVIDER_LABELS } from "@/app/lib/meeting-links";

export const dynamic = "force-dynamic";

/** Extension tự tạo phiên khi phát hiện tab họp (auto-start). */
export async function POST(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkRateLimit(`ext:session:${auth.uid}:${ip}`, 20, 5 * 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { meetingUrl?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const meetingUrl = (body.meetingUrl || "").trim();
  if (!meetingUrl) return NextResponse.json({ error: "Missing meetingUrl" }, { status: 400 });

  const provider = detectProvider(meetingUrl);
  if (!provider) {
    return NextResponse.json(
      { error: "Link không thuộc Google Meet được hỗ trợ." },
      { status: 400 }
    );
  }

  // Dọn phiên thiu (>10 phút không heartbeat) mỗi khi có request mới —
  // banner treo tự biến mất ở lần poll tiếp theo mà không cần cron.
  endStaleSessions(auth.uid).catch(() => {});

  const title =
    (body.title || "").trim() ||
    `Ghi chú họp (${PROVIDER_LABELS[provider]}) ${new Date().toLocaleDateString("vi-VN")}`;

  try {
    // ID xác định theo (user, link, ngày) + create-if-absent: hai request đua
    // nhau (nháy đúp nút) thì một thắng, một nhận lại session cũ — hết trùng.
    const { session, reused } = await getOrCreateLiveSession({
      ownerUid: auth.uid,
      meetingUrl,
      provider,
      title,
    });
    return NextResponse.json({ sessionId: session.id, provider, reused });
  } catch (e) {
    console.error("[ext/session] create failed:", e);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
