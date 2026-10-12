import type { Segment, Speaker } from "./db";

export function completeSpeakers(speakers: Speaker[], segments: Segment[]): Speaker[] {
  const result = [...speakers];
  const ids = new Set(result.map(s => s.id));
  for (const segment of segments) {
    if (!ids.has(segment.speakerId)) {
      ids.add(segment.speakerId);
      result.push({ id: segment.speakerId, name: "Chưa xác định", color: "bg-slate-100 text-slate-700 border-slate-200" });
    }
  }
  return result;
}
