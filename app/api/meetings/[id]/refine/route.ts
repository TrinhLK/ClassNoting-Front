import { checkRateLimit } from "@/app/lib/rate-limit";
import { NextResponse } from "next/server";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { getAdminDb } from "@/app/lib/firebase-admin";
import { startRefinement, pollRefinement } from "@/app/lib/refinement";
import type { Meeting } from "@/app/lib/db";

async function handle(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const limit = checkRateLimit(`refine:${auth.uid}:${id}:${req.method}`, req.method === "POST" ? 3 : 60, req.method === "POST" ? 300000 : 60000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const ref = getAdminDb().collection("meetings").doc(id);
  const meeting = (await ref.get()).data() as Meeting | undefined;
  if (!meeting || meeting.userId !== auth.uid) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    if (req.method === "POST") await startRefinement(meeting);
    else await pollRefinement(meeting);
    return NextResponse.json({ refinement: (await ref.get()).data()?.refinement || null });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Refinement failed" }, { status: 503 }); }
}
export const POST = handle;
export const GET = handle;
