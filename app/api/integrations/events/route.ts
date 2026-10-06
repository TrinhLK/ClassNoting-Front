import { NextResponse } from "next/server";
import { integrationOwner } from "@/app/lib/integrations/auth";
import { zoomPacket, teamsEvent } from "@/app/lib/integrations/adapters";
import { getExtSession, patchExtSession, type ExtSessionPatch } from "@/app/lib/ext-sessions";
export async function POST(req: Request) {
  const owner = integrationOwner(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!Array.isArray(body.events) || body.events.length > 100) return NextResponse.json({ error: "Batch limit: 100" }, { status: 400 });
    const session = await getExtSession(String(body.sessionId));
    if (!session || session.ownerUid !== owner) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.status !== "live") return NextResponse.json({ error: "Session ended" }, { status: 409 });
    if (session.provider === "meet") return NextResponse.json({ error: "Wrong adapter" }, { status: 400 });
    const adapter = session.provider === "zoom" ? zoomPacket : teamsEvent;
    const patch: ExtSessionPatch = { participants: [], liveSegments: [], chatMessages: [] };
    for (const event of body.events) {
      const p = adapter(event, session.startedAt);
      patch.participants!.push(...p.participants || []);
      patch.liveSegments!.push(...p.liveSegments || []);
      patch.chatMessages!.push(...p.chatMessages || []);
    }
    await patchExtSession(session.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid event" }, { status: 400 }); }
}
