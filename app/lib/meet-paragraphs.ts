import type { ExtLiveSegment } from "./ext-sessions";

/** Raw ASR rows stay durable; only the display/final document groups paragraphs. */
export function meetParagraphs(segments: ExtLiveSegment[]): ExtLiveSegment[] {
  const result: ExtLiveSegment[] = [];
  for (const segment of [...segments].sort((a, b) => a.start - b.start)) {
    const previous = result.at(-1);
    const sameAccount = segment.participantId
      ? segment.participantId === previous?.participantId
      : segment.voiceId === previous?.voiceId && segment.speaker === previous?.speaker;
    if (previous && segment.paragraphId && segment.paragraphId === previous.paragraphId && sameAccount) {
      previous.text += " " + segment.text;
      previous.end = Math.max(previous.end, segment.end);
      previous.uncertain = previous.uncertain !== false || segment.uncertain !== false;
      if (segment.words?.length) previous.words = [...(previous.words || []), ...segment.words];
    } else {
      result.push({ ...segment, ...(segment.words ? { words: [...segment.words] } : {}) });
    }
  }
  return result;
}
