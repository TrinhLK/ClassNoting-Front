import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import {
  createExtSession,
  listLiveSessions,
  normalizeMeetingUrl,
} from "@/app/lib/ext-sessions";
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

  // Chống tạo trùng khi tab reload / nhiều content script cùng bắn.
  // So khớp URL chuẩn hóa (tab Meet thường kèm ?authuser=... còn link dán thì không).
  const canonical = normalizeMeetingUrl(meetingUrl);
  const live = await listLiveSessions(auth.uid).catch(() => []);
  const existing = live.find((s) => normalizeMeetingUrl(s.meetingUrl) === canonical);
  if (existing) {
    return NextResponse.json({
      sessionId: existing.id,
      provider: existing.provider,
      reused: true,
    });
  }

  const title =
    (body.title || "").trim() ||
    `Ghi chú họp (${PROVIDER_LABELS[provider]}) ${new Date().toLocaleDateString("vi-VN")}`;

  try {
    const session = await createExtSession({
      ownerUid: auth.uid,
      meetingUrl,
      provider,
      title,
    });
    return NextResponse.json({ sessionId: session.id, provider, reused: false });
  } catch (e) {
    console.error("[ext/session] create failed:", e);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
