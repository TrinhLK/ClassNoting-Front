import { NextResponse } from "next/server";
import { getAdminDb } from "@/app/lib/firebase-admin";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";

export async function GET(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    // Fetch only list metadata, never the transcript or AI output.
    const snapshot = await getAdminDb().collection("live_sessions")
      .where("hostId", "==", auth.uid).select("title", "status", "startedAt", "summarizedAt").get();
    const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => Number((b as { startedAt?: number }).startedAt || 0) - Number((a as { startedAt?: number }).startedAt || 0));
    return NextResponse.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Live session listing failed", error);
    return NextResponse.json({ error: "Không thể tải danh sách phiên live." }, { status: 500 });
  }
}
