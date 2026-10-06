import type { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import type { Meeting } from "./db";

/** Keep large meetings below the Firestore document limit without discarding history. */
export async function saveMeetingContent(meeting: Meeting, expectedVersion?: Timestamp) {
  const ref = getAdminDb().collection("meetings").doc(meeting.id);
  const persist = (data: Record<string, unknown>) => expectedVersion ? ref.update(data, { lastUpdateTime: expectedVersion }) : ref.set(data);
  const clean = JSON.parse(JSON.stringify(meeting)) as Meeting;
  if (Buffer.byteLength(JSON.stringify(clean)) < 700_000 && !meeting.contentPaged) {
    await persist(clean as unknown as Record<string, unknown>); return;
  }
  const generation = crypto.randomUUID();
  const pages: Array<{ segments?: Meeting["segments"]; chatMessages?: Meeting["chatMessages"] }> = [];
  for (const key of ["segments", "chatMessages"] as const) {
    const rows = clean[key] || [];
    for (let i = 0; i < rows.length; i += 50) pages.push({ [key]: rows.slice(i, i + 50) });
  }
  for (let i = 0; i < pages.length; i += 400) {
    const batch = getAdminDb().batch();
    pages.slice(i, i + 400).forEach((p, j) => batch.set(ref.collection("content").doc(`${generation}_${i + j}`), { ...p, generation, index: i + j }));
    await batch.commit();
  }
  // Publish the generation only after all pages exist. Old pages remain recoverable.
  await persist({ ...clean, segments: clean.segments.slice(-20), chatMessages: (clean.chatMessages || []).slice(-20), contentPaged: true, contentGeneration: generation });
}

export async function loadMeetingContent<T extends Meeting>(meeting: T): Promise<T> {
  if (!meeting.contentPaged) return meeting;
  const generation = (meeting as T & { contentGeneration?: string }).contentGeneration;
  const pages = await getAdminDb().collection("meetings").doc(meeting.id).collection("content").where("generation", "==", generation).get();
  const rows = pages.docs.map(d => d.data()).sort((a, b) => a.index - b.index);
  return { ...meeting, segments: rows.flatMap(r => r.segments || []), chatMessages: rows.flatMap(r => r.chatMessages || []) };
}
