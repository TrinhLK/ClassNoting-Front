import { NextResponse } from "next/server";
import { getAdminDb } from "@/app/lib/firebase-admin";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { POST as generateSummary } from "@/app/api/gemini/route";
import { meetingAiSessionId } from "@/app/lib/ai-session";
import type { LiveSession } from "@/app/lib/db";

export const maxDuration = 300;
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const ref = getAdminDb().collection("live_sessions").doc(id);
  try {
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Phiên live không tồn tại." }, { status: 404 });
    const session = snap.data() as LiveSession;
    if (session.hostId !== auth.uid) return NextResponse.json({ error: "Chỉ chủ sở hữu mới được tóm tắt lại." }, { status: 403 });
    const text = (session.segments || []).map(s => `[${s.start}s] ${s.speakerId || "Chưa xác định"}: ${s.text || ""}`).join("\n");
    if (!(session.segments || []).some(s => s.text?.trim())) return NextResponse.json({ error: "Chưa có nội dung để tóm tắt." }, { status: 400 });
    const response = await generateSummary(new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": req.headers.get("x-forwarded-for") || "unknown" },
      body: JSON.stringify({ mode: "full", text, sessionId: meetingAiSessionId("summary", id), createdAt: session.startedAt,
        duration: Math.max(0, ...session.segments.map(s => s.end || 0)) }),
    }));
    const result = await response.json();
    if (!response.ok) return NextResponse.json({ error: result.error || "Không thể tóm tắt." }, { status: response.status });
    if (typeof result.summary !== "string" || !result.summary.trim()) throw new Error("Empty summary");
    const fullSummary = result.summary.trim();
    const summarizedAt = Date.now();
    const saved = await getAdminDb().runTransaction(async tx => {
      const current = await tx.get(ref);
      if (!current.exists || current.data()?.hostId !== auth.uid) return false;
      // Keep live insights separate so ongoing recording cannot overwrite the full summary.
      tx.update(ref, { fullSummary, summarizedAt });
      return true;
    });
    if (!saved) return NextResponse.json({ error: "Phiên live đã bị xóa hoặc quyền sở hữu đã thay đổi." }, { status: 404 });
    return NextResponse.json({ fullSummary, summarizedAt });
  } catch (error) {
    console.error("Live summary failed", error);
    return NextResponse.json({ error: "Không thể tóm tắt phiên live. Vui lòng thử lại." }, { status: 500 });
  }
}
