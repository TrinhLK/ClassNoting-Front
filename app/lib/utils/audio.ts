import { Meeting } from "../db";
import { MEETING_STATUS } from "../constants";

export async function resolveAudioUrl(meeting: Meeting): Promise<string> {
  if (meeting.status === MEETING_STATUS.DRAFT) {
    try {
      const { getDraftFull } = await import("../indexedDB");
      const fullDraft = await getDraftFull(meeting.id);
      if (fullDraft?.audioBlob) {
        return URL.createObjectURL(fullDraft.audioBlob);
      }
    } catch (e) {
      console.error("Failed to load draft audio", e);
    }
  }
  return meeting.audioUrl || "";
}
