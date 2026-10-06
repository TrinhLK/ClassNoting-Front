import { timingSafeEqual } from "node:crypto";
/** Dedicated server-to-server relay identity. Never accept owner UID from a packet. */
export function integrationOwner(req: Request): string | null {
  const secret = process.env.MEETING_RELAY_TOKEN, owner = process.env.MEETING_RELAY_OWNER_UID;
  const received = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!secret || !owner || !received) return null;
  const a = Buffer.from(secret), b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b) ? owner : null;
}
