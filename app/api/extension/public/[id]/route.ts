import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { getExtSession } from "@/app/lib/ext-sessions";
import { endStaleSessions, STALE_SESSION_MS } from "@/app/lib/ext-finalize";

export const dynamic = "force-dynamic";

/** Read-only view for people holding a session-specific public link. */
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkRateLimit(`ext:public:${id}:${ip}`, 120, 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const token = req.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    let session = await getExtSession(id);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const candidate = Buffer.from(createHash("sha256").update(token).digest("hex"), "hex");
    const valid = (session.publicTokenHashes || []).some((stored) => {
      if (!/^[a-f0-9]{64}$/i.test(stored)) return false;
      return timingSafeEqual(candidate, Buffer.from(stored, "hex"));
    });
    if (!valid) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.status === "live" && Date.now() - (session.updatedAt || session.startedAt) >= STALE_SESSION_MS) {
      await endStaleSessions(session.ownerUid);
      session = await getExtSession(id);
      if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (session.status !== "live") {
      return NextResponse.json({ error: "Live session has ended" }, { status: 410 });
    }
    const etag = `"${session.updatedAt}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "no-store, private" },
      });
    }

    return NextResponse.json(
      {
        session: {
          id: session.id,
          title: session.title,
          provider: session.provider,
          status: session.status,
          startedAt: session.startedAt,
          updatedAt: session.updatedAt,
          participants: (session.participants || []).map((participant) => ({
            name: participant.name,
            ...(participant.displayName ? { displayName: participant.displayName } : {}),
          })),
          chatMessages: (session.chatMessages || []).map((message) => ({
            id: message.id,
            sender: message.sender,
            text: message.text,
            timestamp: message.timestamp,
          })),
          liveSegments: (session.liveSegments || []).map((segment) => ({
            id: segment.id,
            speaker: segment.speaker,
            text: segment.text,
            start: segment.start,
            end: segment.end,
            uncertain: segment.uncertain,
          })),
        },
      },
      { headers: { ETag: etag, "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("[ext/public] failed:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
