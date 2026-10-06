import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { addExtPublicTokenHash } from "@/app/lib/ext-sessions";

export const dynamic = "force-dynamic";

/** Create a bearer link for read-only live viewing. Only the session owner may issue one. */
export async function POST(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkRateLimit(`ext:share:${auth.uid}:${ip}`, 20, 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sessionId = (body.sessionId || "").trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(sessionId)) {
    return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  try {
    const added = await addExtPublicTokenHash(sessionId, auth.uid, tokenHash);
    if (!added) return NextResponse.json({ error: "Live session not found" }, { status: 404 });
    return NextResponse.json({ path: `/ext/${encodeURIComponent(sessionId)}#key=${token}` });
  } catch (error) {
    console.error("[ext/share] failed:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
