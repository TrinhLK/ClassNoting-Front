import { NextResponse } from "next/server";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { getExtSession } from "@/app/lib/ext-sessions";
import { getAdminDb, getAdminStorage } from "@/app/lib/firebase-admin";

export async function POST(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (Number(req.headers.get("content-length")) > 2_100_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const form = await req.formData();
  const sessionId = String(form.get("sessionId") || ""), id = String(form.get("id") || "");
  const source = String(form.get("source")), start = Number(form.get("start"));
  const audio = form.get("audio");
  if (!/^[\w-]{1,160}$/.test(sessionId) || !/^[\w-]{1,160}$/.test(id) || !["mic", "tab"].includes(source) ||
      !Number.isFinite(start) || start < 0 || !(audio instanceof Blob) || audio.size > 2_000_000 || audio.size < 44)
    return NextResponse.json({ error: "Invalid audio chunk" }, { status: 400 });
  const session = await getExtSession(sessionId);
  if (!session || session.ownerUid !== auth.uid) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.status !== "live") return NextResponse.json({ error: "Session ended" }, { status: 409 });
  const bytes = Buffer.from(await audio.arrayBuffer());
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE" ||
      bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 || bytes.readUInt32LE(24) !== 16000 || bytes.readUInt16LE(34) !== 16)
    return NextResponse.json({ error: "Expected PCM16 mono 16kHz WAV" }, { status: 400 });
  const path = `users/${auth.uid}/meeting-audio/${sessionId}/${id}.wav`;
  const bucket = getAdminStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  await bucket.file(path).save(bytes, { contentType: "audio/wav", resumable: false });
  await getAdminDb().collection("ext_sessions").doc(sessionId).collection("audio").doc(id).set({
    id, path, source, start, duration: (bytes.length - 44) / 32000,
  });
  return NextResponse.json({ ok: true });
}
