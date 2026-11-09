import { getAdminDb } from "./firebase-admin";

function config() {
  const key = process.env.RUNPOD_API_KEY;
  const endpoint = process.env.RUNPOD_ENDPOINT_ID;
  if (!key || !endpoint) throw new Error("ASR_NOT_CONFIGURED");
  return { key, endpoint };
}

export function ownsAudioUrl(audioUrl: string, uid: string): boolean {
  try {
    const url = new URL(audioUrl);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucket) return false;
    let object: string;
    if (url.hostname === "firebasestorage.googleapis.com") {
      const prefix = `/v0/b/${bucket}/o/`;
      if (!url.pathname.startsWith(prefix)) return false;
      object = decodeURIComponent(url.pathname.slice(prefix.length));
    } else if (url.hostname === "storage.googleapis.com") {
      const prefix = `/${bucket}/`;
      if (!url.pathname.startsWith(prefix)) return false;
      object = decodeURIComponent(url.pathname.slice(prefix.length));
    } else return false;
    return object.startsWith(`users/${uid}/`) && !object.split("/").some(p => p === ".." || p === ".");
  } catch { return false; }
}

export async function startRunpodJob(uid: string, audioUrl: string, language: string, diarization?: unknown[]) {
  const { key, endpoint } = config();
  const response = await fetch(`https://api.runpod.ai/v2/${endpoint}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ input: {
      action: diarization ? "transcribe_hybrid" : "transcribe",
      audio_url: audioUrl, language,
      ...(diarization ? { diarization } : {}),
    } }),
  });
  if (!response.ok) throw new Error("ASR_UPSTREAM_ERROR");
  const data = await response.json();
  if (typeof data.id !== "string" || !/^[\w-]{1,200}$/.test(data.id)) throw new Error("ASR_UPSTREAM_ERROR");
  await getAdminDb().collection("transcription_jobs").doc(data.id).set({ uid, createdAt: Date.now() });
  return data.id as string;
}

export async function ownsRunpodJob(uid: string, jobId: string) {
  const db = getAdminDb();
  const record = await db.collection("transcription_jobs").doc(jobId).get();
  if (record.exists) return record.data()?.uid === uid;
  // Jobs created before the migration remain readable by their meeting owner.
  const meetings = await db.collection("meetings").where("jobId", "==", jobId).get();
  return meetings.docs.some(doc => doc.data().userId === uid);
}

export async function getRunpodJob(jobId: string) {
  const { key, endpoint } = config();
  const response = await fetch(`https://api.runpod.ai/v2/${endpoint}/status/${jobId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error("ASR_UPSTREAM_ERROR");
  return response.json();
}
