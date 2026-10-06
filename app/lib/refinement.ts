import { getAdminDb, getAdminStorage } from "./firebase-admin";
import { loadMeetingContent, saveMeetingContent } from "./meeting-content";
import type { Meeting, Segment, Speaker } from "./db";

function config() {
  const key = process.env.RUNPOD_API_KEY, endpoint = process.env.RUNPOD_ENDPOINT_ID;
  if (!key || !endpoint) throw new Error("Cần cấu hình RUNPOD_API_KEY và RUNPOD_ENDPOINT_ID trên server");
  return { key, url: `https://api.runpod.ai/v2/${endpoint}` };
}
async function request(path: string, body?: unknown) {
  const c = config();
  const res = await fetch(c.url + path, { method: body ? "POST" : "GET", headers: {
    Authorization: `Bearer ${c.key}`, "Content-Type": "application/json"
  }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ASR HTTP ${res.status}`);
  return res.json();
}

export async function startRefinement(meeting: Meeting) {
  const ref = getAdminDb().collection("meetings").doc(meeting.id);
  // Claim in a transaction to prevent duplicate paid jobs from double clicks.
  const claimed = await getAdminDb().runTransaction(async tx => {
    const current = (await tx.get(ref)).data() as Meeting;
    if (["queued", "running", "starting"].includes(current.refinement?.status || "")) return false;
    tx.update(ref, { refinement: { status: "starting" } }); return true;
  });
  if (!claimed) return;
  try {
    let audioChunks: Array<{ url: string; source: string; start: number }> | undefined;
    if (meeting.extensionSessionId) {
      const snap = await getAdminDb().collection("ext_sessions").doc(meeting.extensionSessionId).collection("audio").get();
      const bucket = getAdminStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
      audioChunks = await Promise.all(snap.docs.map(async doc => {
        const c = doc.data();
        const [url] = await bucket.file(c.path).getSignedUrl({ action: "read", expires: Date.now() + 24 * 3600_000 });
        return { url, source: c.source, start: c.start };
      }));
    }
    if (!audioChunks?.length && !meeting.audioUrl) throw new Error("Chưa có audio được lưu để hậu xử lý");
    if (meeting.audioUrl) {
      const url = new URL(meeting.audioUrl);
      if (url.protocol !== "https:" || !["firebasestorage.googleapis.com", "storage.googleapis.com"].includes(url.hostname)) throw new Error("Audio hậu xử lý phải nằm trên Firebase/Google Storage");
    }
    const job = await request("/run", { input: { action: "refine_meeting", audio_chunks: audioChunks,
      audio_url: meeting.audioUrl, language: meeting.language || "vi" } });
    if (typeof job.id !== "string") throw new Error("ASR không trả job ID");
    await ref.update({ refinement: { status: "queued", jobId: job.id } });
  } catch (e) {
    await ref.update({ refinement: { status: "failed", error: e instanceof Error ? e.message : "Không thể hậu xử lý" } });
    throw e;
  }
}

/** Transfer names only when a whole offline cluster has consistent, strong named evidence. */
export function applyRefinement(original: Meeting, refined: Segment[]): Meeting {
  const speakers: Speaker[] = [...original.speakers];
  const names = new Map<string, string>();
  for (const voice of new Set(refined.map(s => s.speakerId))) {
    const votes = new Map<string, number>();
    for (const seg of refined.filter(s => s.speakerId === voice)) for (const live of original.segments) {
      if (live.uncertain || !live.participantId) continue;
      const source = seg.speakerId.split(":")[0];
      if (["mic", "tab"].includes(source) && live.voiceId && !live.voiceId.startsWith(source + ":")) continue;
      const overlap = Math.max(0, Math.min(seg.end, live.end) - Math.max(seg.start, live.start));
      if (overlap) votes.set(live.speakerId, (votes.get(live.speakerId) || 0) + overlap);
    }
    const ranked = [...votes].sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((n, v) => n + v[1], 0);
    if (ranked[0]?.[1] >= 3 && ranked[0][1] / total >= 0.85) names.set(voice, ranked[0][0]);
  }
  const manual = original.segments.filter(s => s.manuallyEdited || s.speakerSource === "manual");
  const unlocked: Segment[] = [];
  for (const segment of refined) {
    const touches = (start: number, end: number) => manual.some(m => Math.min(m.end, end) > Math.max(m.start, start));
    if (!touches(segment.start, segment.end)) { unlocked.push(segment); continue; }
    if (!segment.words?.length) {
      // Without word times we cannot cut safely. Preserve the original live rows in this interval.
      for (const live of original.segments.filter(s => s.start < segment.end && s.end > segment.start))
        if (!manual.some(m => m.id === live.id)) manual.push(live);
      continue;
    }
    let group: NonNullable<Segment["words"]> = [];
    const flush = () => {
      if (!group.length) return;
      unlocked.push({ ...segment, id: `${segment.id}:${group[0].start}`, start: group[0].start,
        end: group[group.length - 1].end, text: group.map(w => w.word).join(" "), words: group });
      group = [];
    };
    for (const word of segment.words) { if (touches(word.start, word.end)) flush(); else group.push(word); }
    flush();
  }
  const segments = unlocked.map(s => {
    const speakerId = names.get(s.speakerId) || `offline:${s.speakerId}`;
    if (!speakers.some(p => p.id === speakerId)) speakers.push({ id: speakerId, name: `Người nói ${speakers.length + 1}`, color: "bg-indigo-50 text-indigo-700" });
    const namedEvidence = original.segments.find(live => live.speakerId === speakerId && live.participantId && !live.uncertain);
    return { ...s, ...(namedEvidence?.participantId ? { participantId: namedEvidence.participantId } : {}), speakerId, uncertain: !names.has(s.speakerId), speakerSource: "diarization" as const, revision: 2 };
  });
  return { ...original, segments: [...segments, ...manual].sort((a, b) => a.start - b.start), speakers,
    summaryNeedsReview: !!original.summary, refinement: { status: "completed" } };
}

export async function pollRefinement(meeting: Meeting) {
  if (!meeting.refinement?.jobId || !["queued", "running"].includes(meeting.refinement.status)) return;
  const result = await request(`/status/${encodeURIComponent(meeting.refinement.jobId)}`);
  const ref = getAdminDb().collection("meetings").doc(meeting.id);
  if (result.status === "COMPLETED") {
    if (result.output?.status !== "success" || !Array.isArray(result.output.transcript)) throw new Error("ASR trả kết quả không hợp lệ");
    const refined = result.output.transcript as Segment[];
    if (!refined.every(s => typeof s.text === "string" && typeof s.speakerId === "string" && Number.isFinite(s.start) && Number.isFinite(s.end))) throw new Error("Transcript hậu xử lý không hợp lệ");
    if (!refined.length && meeting.segments.length) throw new Error("ASR trả transcript rỗng; giữ nguyên dữ liệu live");
    const latestSnapshot = await ref.get();
    const latest = await loadMeetingContent(latestSnapshot.data() as Meeting);
    if (latest.refinement?.status === "completed" || latest.refinement?.jobId !== meeting.refinement.jobId) return;
    // Retain the original live transcript as an immutable recovery snapshot.
    const backupId = `live_${meeting.id}_${meeting.refinement.jobId}`;
    await saveMeetingContent({ ...latest, id: backupId, isDeleted: true, title: `${latest.title} (bản trước hậu xử lý)` });
    await saveMeetingContent(applyRefinement(latest, refined), latestSnapshot.updateTime);
  } else if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(result.status)) {
    await ref.update({ refinement: { status: "failed", error: String(result.error || result.status) } });
  }
}
