import { createHash } from "node:crypto";
import type { ExtSessionPatch } from "../ext-sessions";

type Obj = Record<string, unknown>;
const object = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const text = (value: unknown) => typeof value === "string" ? value.slice(0, 8000).trim() : "";
const id = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).slice(0, 160) : "";
const stamp = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : NaN;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

/** RTMS media packets, NOT Zoom webhook envelopes. Epoch milliseconds per official API. */
export function zoomPacket(raw: unknown, startedAt: number): ExtSessionPatch {
  const packet = object(raw), c = object(packet.content);
  if (packet.msg_type === 17) {
    const participantId = id(c.user_id), name = text(c.user_name), body = text(c.data);
    const start = stamp(c.start_time), end = stamp(c.end_time);
    if (!participantId || participantId === "0" || !name || !body || !Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("Invalid Zoom transcript");
    return { participants: [{ id: participantId, name }], liveSegments: [{
      id: `zoom_${hash([participantId, start])}`, participantId, speaker: name, text: body,
      start: Math.max(0, (start - startedAt) / 1000), end: Math.max(0, (end - startedAt) / 1000),
      uncertain: false, speakerSource: "platform", revision: stamp(c.timestamp) || 1,
    }] };
  }
  if (packet.msg_type === 18) {
    // Public chat only. Reactions do not become text evidence.
    if (object(c.chat_session).type !== 1 || c.operation_type !== 1) return {};
    const sender = object(c.sender), body = text(c.data), timestamp = stamp(c.timestamp);
    if (!body || !Number.isFinite(timestamp) || !id(c.message_id)) throw new Error("Invalid Zoom chat");
    return { chatMessages: [{ id: `zoom_${id(c.message_id)}`, sender: text(sender.user_name) || "Khách", text: body, timestamp }] };
  }
  return {};
}

/** Explicit bridge contract produced by a Teams bot/Graph transcript importer.
 * Graph notifications alone contain no transcript text; fetch and normalize first.
 */
export function teamsEvent(raw: unknown, startedAt: number): ExtSessionPatch {
  const c = object(raw), participant = object(c.participant);
  const participantId = id(participant.id), name = text(participant.displayName);
  if (c.kind === "participant" && participantId && name) return { participants: [{ id: participantId, name }] };
  const body = text(c.text), eventId = id(c.id), start = stamp(c.startTimeMs), end = stamp(c.endTimeMs);
  if (c.kind === "transcript") {
    if (!participantId || !name || !body || !eventId || !Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("Invalid Teams transcript");
    return { participants: [{ id: participantId, name }], liveSegments: [{ id: `teams_${eventId}`,
      participantId, speaker: name, text: body, start: Math.max(0, (start - startedAt) / 1000),
      end: Math.max(0, (end - startedAt) / 1000), uncertain: false, speakerSource: "platform",
      revision: Number.isSafeInteger(c.revision) && Number(c.revision) > 0 ? Number(c.revision) : 1 }] };
  }
  if (c.kind === "chat") {
    const timestamp = stamp(c.timestampMs);
    if (!eventId || !name || !body || !Number.isFinite(timestamp)) throw new Error("Invalid Teams chat");
    return { chatMessages: [{ id: `teams_${eventId}`, sender: name, text: body, timestamp }] };
  }
  return {};
}
