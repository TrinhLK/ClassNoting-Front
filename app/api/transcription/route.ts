import { NextResponse } from "next/server";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { ownsAudioUrl, startRunpodJob, ownsRunpodJob, getRunpodJob } from "@/app/lib/runpod-server";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function POST(req: Request) {
  const user = await verifyExtensionAuth(req);
  if (user instanceof NextResponse) return user;
  if (!checkRateLimit(`asr:start:${user.uid}`, 10, 60_000).allowed) return json({ error: "Too many requests" }, 429);
  try {
    const raw = await req.text();
    if (raw.length > 500_000) return json({ error: "Payload too large" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body || typeof body.audioUrl !== "string" || !ownsAudioUrl(body.audioUrl, user.uid)) {
      return json({ error: "Audio must belong to your account" }, 400);
    }
    const language = body.language ?? "vi";
    if (!["vi", "en"].includes(language) || (body.diarization !== undefined && (!Array.isArray(body.diarization) || body.diarization.length > 10_000))) {
      return json({ error: "Invalid transcription options" }, 400);
    }
    const id = await startRunpodJob(user.uid, body.audioUrl, language, body.diarization);
    return json({ id });
  } catch {
    return json({ error: "Không thể tạo tác vụ phiên âm." }, 502);
  }
}

export async function GET(req: Request) {
  const user = await verifyExtensionAuth(req);
  if (user instanceof NextResponse) return user;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[\w-]{1,200}$/.test(id)) return json({ error: "Invalid job ID" }, 400);
  if (!checkRateLimit(`asr:poll:${user.uid}`, 120, 60_000).allowed) return json({ error: "Too many requests" }, 429);
  try {
    if (!await ownsRunpodJob(user.uid, id)) return json({ error: "Not found" }, 404);
    return json(await getRunpodJob(id));
  } catch {
    return json({ error: "Không thể lấy trạng thái phiên âm." }, 502);
  }
}
