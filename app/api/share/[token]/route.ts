import { NextResponse } from "next/server";
import { getAdminDb } from "@/app/lib/firebase-admin";
import { loadMeetingContent } from "@/app/lib/meeting-content";
import type { Meeting } from "@/app/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const { token } = await ctx.params;
    if (!token || token.length > 200) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
    const snapshot = await getAdminDb().collection("meetings").where("shareToken", "==", token).limit(1).get();
    const data = snapshot.docs[0]?.data() as Meeting | undefined;
    if (!data || data.isDeleted) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
    const meeting = await loadMeetingContent({ ...data, id: snapshot.docs[0].id });
    // Explicit public fields: never expose owner, credentials or processing metadata.
    return NextResponse.json({
      id: meeting.id, title: meeting.title, createdAt: meeting.createdAt,
      duration: meeting.duration, status: meeting.status, isDeleted: false,
      summary: meeting.summary || "", segments: meeting.segments || [],
      speakers: meeting.speakers || [], chatMessages: meeting.chatMessages || [],
      audioUrl: meeting.audioUrl || "", isMinuteOnly: !!meeting.isMinuteOnly,
    }, { headers });
  } catch (error) {
    console.error("Unable to load shared meeting", error);
    return NextResponse.json({ error: "Không thể tải cuộc họp" }, { status: 500, headers });
  }
}
