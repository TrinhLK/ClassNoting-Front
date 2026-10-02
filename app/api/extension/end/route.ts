import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { getExtSession, meetingIdFor, patchExtSession } from "@/app/lib/ext-sessions";
import { getAdminDb } from "@/app/lib/firebase-admin";
import { MEETING_STATUS } from "@/app/lib/constants";
import { computeChatStats } from "@/app/lib/chat-stats";
import { mergeMeetingDocs } from "@/app/lib/meeting-merge";
import type { Meeting, Segment, Speaker } from "@/app/lib/db";

export const dynamic = "force-dynamic";

const SPEAKER_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
];

/** Kết thúc phiên extension → kết xuất Meeting (segments + speakers + chat + stats). */
export async function POST(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkRateLimit(`ext:end:${auth.uid}:${ip}`, 20, 5 * 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { sessionId?: string };
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

    // Idempotent: đã end trước đó → trả meetingId cũ.
    if (session.status === "ended" && session.meetingId) {
      return NextResponse.json({ ok: true, meetingId: session.meetingId, reused: true });
    }

    // Map tên người nói (live) → SPEAKER_xx theo thứ tự xuất hiện.
    const nameOrder: string[] = [];
    for (const s of session.liveSegments) {
      if (!nameOrder.includes(s.speaker)) nameOrder.push(s.speaker);
    }
    const nameToId = new Map(nameOrder.map((n, i) => [n, `SPEAKER_${String(i).padStart(2, "0")}`]));
    const speakers: Speaker[] = nameOrder.map((n, i) => ({
      id: nameToId.get(n)!,
      name: n,
      color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
    }));

    const segments: Segment[] = session.liveSegments.map((s) => ({
      id: s.id,
      speakerId: nameToId.get(s.speaker) ?? "SPEAKER_00",
      start: s.start,
      end: s.end,
      text: s.text,
    }));

    // Luồng kép bot + extension: cùng user + link + ngày → cùng meetingId,
    // gộp vào doc sẵn có (nếu bot đã kết xuất trước) thay vì tạo biên bản thứ hai.
    const meetingId =
      session.meetingId || meetingIdFor(auth.uid, session.meetingUrl, session.startedAt);
    const incoming: Meeting = {
      id: meetingId,
      userId: auth.uid,
      title: session.title,
      createdAt: session.startedAt,
      duration: segments.length > 0 ? segments[segments.length - 1].end : 0,
      segments,
      speakers,
      summary: "",
      status: MEETING_STATUS.TRANSCRIBED,
      isDeleted: false,
      source: "extension",
      meetingUrl: session.meetingUrl,
      provider: session.provider,
      participants: session.participants,
      chatMessages: session.chatMessages,
      chatStats: computeChatStats(session.chatMessages, session.participants),
    };

    const meetingsCol = getAdminDb().collection("meetings");
    let finalMeeting = incoming;
    try {
      const snap = await meetingsCol.doc(meetingId).get();
      if (snap.exists) {
        finalMeeting = mergeMeetingDocs(snap.data() as Meeting, incoming);
      }
    } catch (e) {
      console.warn("[ext/end] merge read failed, overwriting:", e);
    }

    const clean = Object.fromEntries(
      Object.entries(structuredClone(finalMeeting)).filter(([, v]) => v !== undefined)
    );
    await meetingsCol.doc(meetingId).set(clean);
    await patchExtSession(session.id, { status: "ended", meetingId });

    return NextResponse.json({ ok: true, meetingId });
  } catch (e) {
    console.error("[ext/end] failed:", e);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
