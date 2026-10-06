import { NextResponse } from "next/server";
import { integrationOwner } from "@/app/lib/integrations/auth";
import { createExtSession, getExtSession } from "@/app/lib/ext-sessions";
import { finalizeExtSession } from "@/app/lib/ext-finalize";
import { detectProvider } from "@/app/lib/meeting-links";
export async function POST(req: Request) {
  const ownerUid = integrationOwner(req);
  if (!ownerUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "end") {
    const session = await getExtSession(String(body.sessionId));
    if (!session || session.ownerUid !== ownerUid) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.status === "ended") return NextResponse.json({ meetingId: session.meetingId || null });
    return NextResponse.json(await finalizeExtSession(session, ownerUid));
  }
  const provider = detectProvider(String(body.meetingUrl || ""));
  if (!provider || provider === "meet") return NextResponse.json({ error: "Expected Zoom or Teams meeting URL" }, { status: 400 });
  const startedAt = body.startedAt === undefined ? Date.now() : Number(body.startedAt);
  if (!Number.isFinite(startedAt) || startedAt < Date.now() - 8 * 3600000 || startedAt > Date.now() + 60000) return NextResponse.json({ error: "Invalid meeting start time" }, { status: 400 });
  const session = await createExtSession({ ownerUid, provider, startedAt, meetingUrl: body.meetingUrl,
    title: String(body.title || `Họp ${provider}`).slice(0, 200) });
  return NextResponse.json({ sessionId: session.id, startedAt: session.startedAt });
}
