import type { Meeting, Speaker } from "./db";

export const isUnnamedSpeaker = (speaker: Speaker) =>
  /^(?:người nói\s*\d+|speaker[_\s:-]*\d+|giọng\s+(?:mic|tab)\s*\d+)$/iu.test(speaker.name.trim());

const normalize = (text: string) => text.normalize("NFC").toLocaleLowerCase("vi").replace(/\s+/gu, " ").trim();
const nameWithoutTitle = (text: string) => normalize(text).replace(/^(?:anh|chị|cô|chú|bác|em|ông|bà|thầy|cô giáo)\s+/u, "");

export type SpeakerNameEvidence = { namingSegmentId: string; responseSegmentId: string; quote: string; kind: "self_introduction" | "address_response" };
export type SpeakerNameAssignment = { speakerId: string; name: string; confidence: "high" | "medium"; evidence: SpeakerNameEvidence[] };

/** Validate model proposals against actual source turns before changing labels. */
export function applySpeakerNames(meeting: Meeting, proposals: unknown): Speaker[] {
  if (!Array.isArray(proposals)) return meeting.speakers;
  const ordered = [...meeting.segments].sort((a, b) => a.start - b.start);
  const segments = new Map(ordered.map(segment => [segment.id, segment]));
  const accepted = new Map<string, SpeakerNameAssignment>();
  const conflicting = new Set<string>();
  for (const proposal of proposals.slice(0, meeting.speakers.length * 3)) {
    const speaker = meeting.speakers.find(person => person.id === proposal?.speakerId);
    if (!speaker || !isUnnamedSpeaker(speaker) || !["high", "medium"].includes(proposal.confidence)) continue;
    if (typeof proposal.name !== "string" || !/^[\p{L}\p{M} .'-]{2,80}$/u.test(proposal.name.trim())) continue;
    const name = proposal.name.trim();
    const key = nameWithoutTitle(name);
    if (key.length < 2 || !Array.isArray(proposal.evidence) || !proposal.evidence.length) continue;
    const evidence = proposal.evidence.filter((item: SpeakerNameEvidence) => {
      const naming = segments.get(item?.namingSegmentId), response = segments.get(item?.responseSegmentId);
      if (!naming || !response || response.speakerId !== speaker.id || typeof item.quote !== "string") return false;
      const quote = normalize(item.quote);
      const escapedName = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`(^|[^\\p{L}\\p{M}])${escapedName}($|[^\\p{L}\\p{M}])`, "u").test(quote) || !normalize(naming.text).includes(quote)) return false;
      if (item.kind === "self_introduction") {
        return naming.id === response.id && /(?:(?:tôi|mình|em|anh|chị|tớ)\s+(?:tên\s+)?là|tên\s+(?:tôi|mình|em)\s+là|my name is|i am|i'm)\s/iu.test(quote);
      }
      if (item.kind !== "address_response" || naming.speakerId === response.speakerId) return false;
      if (response.start < naming.end - 1 || response.start > naming.end + 20) return false;
      if (response.words?.some(word => word.overlap)) return false;
      const index = ordered.findIndex(segment => segment.id === naming.id);
      const nextSpeaker = ordered.slice(index + 1).find(segment => segment.text.trim() && segment.speakerId !== naming.speakerId);
      return nextSpeaker?.id === response.id;
    }).slice(0, 5);
    if (evidence.length) {
      const previous = accepted.get(speaker.id);
      if (previous && nameWithoutTitle(previous.name) !== key) conflicting.add(speaker.id);
      accepted.set(speaker.id, { speakerId: speaker.id, name, confidence: proposal.confidence, evidence });
    }
  }
  for (const id of conflicting) accepted.delete(id);
  // A name assigned to two distinct voices is unresolved rather than a merge.
  const names = meeting.speakers.map(speaker => nameWithoutTitle(accepted.get(speaker.id)?.name || speaker.name));
  return meeting.speakers.map((speaker, index) => {
    const assignment = accepted.get(speaker.id);
    if (!assignment || names.filter(name => name === names[index]).length !== 1) return speaker;
    return { ...speaker, name: assignment.name, nameSource: "conversation" as const, nameConfidence: assignment.confidence, nameEvidence: assignment.evidence };
  });
}

export function renameTranscriptSpeakers(text: string, before: Speaker[], after: Speaker[]): string {
  const names = new Map(before.map((speaker, index) => [speaker.name, after[index]?.name || speaker.name]));
  return text.replace(/\[([^\]\n]+)\](?=:)/gu, (label, value: string) => {
    const suffix = " (danh tính chưa xác nhận)";
    const name = value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
    return names.has(name) ? `[${names.get(name)}${value.endsWith(suffix) ? suffix : ""}]` : label;
  });
}
