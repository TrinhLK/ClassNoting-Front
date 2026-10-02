import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { getExtSession, patchExtSession } from "@/app/lib/ext-sessions";
import { endStaleSessions } from "@/app/lib/ext-finalize";
import type { ChatMessage, MeetingParticipant } from "@/app/lib/db";
import type { ExtLiveSegment } from "@/app/lib/ext-sessions";

export const dynamic = "force-dynamic";

const MAX_BATCH = 100;

type IncomingEvent =
  | { kind: "participants"; participants: MeetingParticipant[] }
  | { kind: "chat"; messages: ChatMessage[] }
  | { kind: "transcript"; segments: ExtLiveSegment[] };

function sanitizeEvents(raw: unknown): {
  participants?: MeetingParticipant[];
  chat?: ChatMessage[];
  transcript?: ExtLiveSegment[];
} {
  const out: {
    participants?: MeetingParticipant[];
    chat?: ChatMessage[];
    transcript?: ExtLiveSegment[];
  } = {};
  if (!Array.isArray(raw)) return out;
  for (const ev of raw.slice(0, MAX_BATCH) as IncomingEvent[]) {
    if (!ev || typeof ev !== "object" || !("kind" in ev)) continue;
    if (ev.kind === "participants" && Array.isArray(ev.participants)) {
      out.participants = ev.participants
        .filter((p) => p && String(p.displayName ?? p.name ?? "").trim() !== "")
        .slice(0, 200)
        .map((p) => ({
          id: p.id,
          name: String(p.displayName ?? p.name ?? "").trim(),
          displayName: p.displayName ? String(p.displayName) : undefined,
        }));
    } else if (ev.kind === "chat" && Array.isArray(ev.messages)) {
      out.chat = (out.chat ?? []).concat(
        ev.messages
          .filter((m) => m && String(m.text ?? "").trim() !== "")
          .slice(0, MAX_BATCH)
          .map((m) => ({
            id: String(m.id ?? `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
            sender: String(m.sender ?? "Khách").trim() || "Khách",
            text: String(m.text).slice(0, 2000),
            timestamp: Number(m.timestamp) || Date.now(),
          }))
      );
    } else if (ev.kind === "transcript" && Array.isArray(ev.segments)) {
      out.transcript = (out.transcript ?? []).concat(
        ev.segments
          .filter((s) => s && String(s.text ?? "").trim() !== "")
          .slice(0, MAX_BATCH)
          .map((s) => ({
            id: String(s.id ?? `seg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
            speaker: String(s.speaker ?? "SPEAKER_00").trim() || "SPEAKER_00",
            text: String(s.text).slice(0, 2000),
            start: Number(s.start) || 0,
            end: Math.max(Number(s.end) || 0, Number(s.start) || 0),
            uncertain: s.uncertain === true ? true : undefined,
          }))
      );
    }
  }
  return out;
}

/** Extension đẩy batch roster/chat/transcript live. */
export async function POST(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;
  endStaleSessions(auth.uid).catch(() => {});

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkRateLimit(`ext:events:${auth.uid}:${ip}`, 120, 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { sessionId?: string; events?: unknown };
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
    if (session.status !== "live") {
      return NextResponse.json({ error: "Session ended", sessionStatus: session.status }, { status: 409 });
    }

    const clean = sanitizeEvents(body.events);
    const updated = await patchExtSession(body.sessionId, {
      participants: clean.participants,
      chatMessages: clean.chat,
      liveSegments: clean.transcript,
    });
    return NextResponse.json({
      ok: true,
      chatCount: updated?.chatMessages.length ?? 0,
      segmentCount: updated?.liveSegments.length ?? 0,
      participantCount: updated?.participants.length ?? 0,
    });
  } catch (e) {
    console.error("[ext/events] failed:", e);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
