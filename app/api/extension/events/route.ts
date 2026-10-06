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
      // KHÔNG để key undefined: Firestore Admin SDK set() ném lỗi với
      // undefined (đã gây HTTP 500 toàn bộ batch có roster — thấy thực tế).
      out.participants = ev.participants
        .filter((p) => p && String(p.displayName ?? p.name ?? "").trim() !== "")
        .slice(0, 200)
        .map((p) => {
          const clean: MeetingParticipant = {
            name: String(p.displayName ?? p.name ?? "").trim(),
          };
          if (p.id !== undefined && p.id !== null) clean.id = p.id;
          if (p.displayName) clean.displayName = String(p.displayName);
          return clean;
        });
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
          .map((s) => {
            const seg: ExtLiveSegment = {
              id: String(s.id ?? `seg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
              speaker: String(s.speaker ?? "SPEAKER_00").trim() || "SPEAKER_00",
              text: String(s.text).slice(0, 2000),
              start: Number.isFinite(s.start) ? Math.max(0, s.start) : 0,
              end: Number.isFinite(s.end) ? Math.max(s.end, Number.isFinite(s.start) ? s.start : 0, 0) : 0,
            };
            seg.uncertain = s.uncertain !== false;
            if (typeof s.voiceId === "string") seg.voiceId = s.voiceId.slice(0, 160);
            if (typeof s.participantId === "string") seg.participantId = s.participantId.slice(0, 160);
            if (["diarization", "caption", "active-speaker", "platform", "unknown"].includes(s.speakerSource || "")) seg.speakerSource = s.speakerSource;
            seg.revision = Number.isSafeInteger(s.revision) && s.revision! > 0 ? s.revision : 1;
            if (Array.isArray(s.words)) seg.words = s.words.slice(0, 500).filter(w => Number.isFinite(w.start) && Number.isFinite(w.end)).map(w => ({ word: String(w.word).slice(0, 200), start: w.start, end: Math.max(w.start, w.end) }));
            return seg;
          })
      );
    }
  }
  if (out.chat) out.chat = out.chat.slice(0, MAX_BATCH);
  if (out.transcript) out.transcript = out.transcript.slice(0, MAX_BATCH);
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
    // Log message cụ thể để tra Vercel Logs trong 1 phút (trước đây chỉ log object).
    console.error("[ext/events] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
