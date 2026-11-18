import { NextResponse } from "next/server";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { getExtSession, loadExtHistory } from "@/app/lib/ext-sessions";

/** Owner-only metadata for the web tab recorder linked to an extension session. */
export async function GET(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;
  const id = new URL(req.url).searchParams.get("sessionId") || "";
  if (!/^[\w-]{1,160}$/.test(id)) return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  const session = await getExtSession(id);
  if (!session || session.ownerUid !== auth.uid) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const history = await loadExtHistory(session);
  return NextResponse.json({
    title: history.title, meetingUrl: history.meetingUrl, provider: history.provider,
    participants: history.participants, chatMessages: history.chatMessages,
    attendanceObservations: history.attendanceObservations || [],
  }, { headers: { "Cache-Control": "no-store" } });
}
