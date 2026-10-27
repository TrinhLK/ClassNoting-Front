import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { getExtSession, patchExtSession } from "@/app/lib/ext-sessions";
import { endStaleSessions } from "@/app/lib/ext-finalize";
import type { ChatMessage, MeetingParticipant } from "@/app/lib/db";
import type { AttendanceObservation } from "@/app/lib/attendance";
import type { ExtLiveSegment } from "@/app/lib/ext-sessions";

export const dynamic = "force-dynamic";

const MAX_BATCH = 100;

type IncomingEvent =
  | {kind: "attendance"; observations: AttendanceObservation[]}
  | { kind: "participants"; participants: MeetingParticipant[] }
  | { kind: "chat"; messages: ChatMessage[] }
  | { kind: "transcript"; segments: ExtLiveSegment[] };

function sanitizeEvents(raw: unknown): {
  attendance?: AttendanceObservation[];
  participants?: MeetingParticipant[];
  chat?: ChatMessage[];
  transcript?: ExtLiveSegment[];
} {
  const out: {
    attendance?: AttendanceObservation[];
  participants?: MeetingParticipant[];
    chat?: ChatMessage[];
    transcript?: ExtLiveSegment[];
  } = {};
  if (!Array.isArray(raw)) return out;
  for (const ev of raw.slice(0, MAX_BATCH) as IncomingEvent[]) {
    if (!ev || typeof ev !== "object" || !("kind" in ev)) continue;
    if (ev.kind === 'attendance' && Array.isArray(ev.observations)) {
      out.attendance = (out.attendance || []).concat(ev.observations.slice(0, MAX_BATCH).filter(o => o && typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 160 && Number.isFinite(o.at) && Array.isArray(o.participants)).map(o => {
        const participants = [...new Map(o.participants.slice(0,2000).filter(p => p && typeof (p.displayName || p.name) === 'string' && (p.displayName || p.name).trim()).map(p => {
          const person:MeetingParticipant={name:String(p.displayName || p.name).trim().slice(0,200)};
          if (typeof p.id === 'string' && p.id) person.id=p.id.slice(0,160);
          return [String(person.id ?? person.name),person] as const;
        })).values()];
        return {id:o.id, at:o.at, participants, complete:o.complete === true && participants.length === o.participants.length && participants.every(p => !!p.id)};
      }));
    } else if (ev.kind === "participants" && Array.isArray(ev.participants)) {
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
            ...(typeof m.participantId === "string" && m.participantId ? {participantId:m.participantId.slice(0,160)} : {}),
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
            if (typeof s.paragraphId === "string" && s.paragraphId.trim()) seg.paragraphId = s.paragraphId.trim().slice(0, 200);
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

    if (Buffer.byteLength(JSON.stringify(body)) > 2_000_000) return NextResponse.json({error:"Batch too large"}, {status:413});
    const clean = sanitizeEvents(body.events);
    if (clean.attendance?.some(o => Buffer.byteLength(JSON.stringify(o)) > 400_000)) return NextResponse.json({error:"Roster too large"}, {status:413});
    const updated = await patchExtSession(body.sessionId, {
      attendanceObservations: clean.attendance?.filter(o => o.at >= session.startedAt - 5000 && o.at <= Date.now() + 10000),
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
