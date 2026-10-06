import { NextResponse } from "next/server";
import { getAdminDb } from "@/app/lib/firebase-admin";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { loadMeetingContent, saveMeetingContent } from "@/app/lib/meeting-content";
import type { Meeting } from "@/app/lib/db";

type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  const { id } = await ctx.params;
  const snap = await getAdminDb().collection("meetings").doc(id).get();
  const meeting = snap.data() as Meeting | undefined;
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const shareToken = new URL(req.url).searchParams.get("shareToken");
  if (!shareToken || shareToken !== meeting.shareToken) {
    const auth = await verifyExtensionAuth(req);
    if (auth instanceof NextResponse) return auth;
    if (auth.uid !== meeting.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const full = await loadMeetingContent(meeting);
  // Shared callers only need content, never internal job IDs or owner metadata.
  return NextResponse.json({ segments: full.segments, chatMessages: full.chatMessages, speakers: full.speakers });
}
export async function PUT(req: Request, ctx: Context) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const snap = await getAdminDb().collection("meetings").doc(id).get();
  const meeting = snap.data() as Meeting | undefined;
  if (!meeting || meeting.userId !== auth.uid) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  if (!Array.isArray(body.segments) || !Array.isArray(body.speakers)) return NextResponse.json({ error: "Invalid content" }, { status: 400 });
  const editable: Partial<Meeting> = {};
  for (const key of ["summary", "objectives", "title"] as const) {
    if (typeof body[key] === "string") editable[key] = body[key];
  }
  if (Array.isArray(body.actionItems)) editable.actionItems = body.actionItems;
  await saveMeetingContent({ ...meeting, ...editable, segments: body.segments, speakers: body.speakers, chatMessages: body.chatMessages || meeting.chatMessages });
  return NextResponse.json({ ok: true });
}
