// Header-safe, opaque workflow identifiers only; never use titles, emails or text.
export function isValidAiSessionId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128
    && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9_-]/.test(value);
}

export function createAiSessionId(feature: "chat" | "live" | "docs"): string {
  return `${feature}-${crypto.randomUUID()}`;
}

export function meetingAiSessionId(feature: "summary" | "tasks", meetingId: string): string {
  const sessionId = `${feature}-${meetingId}`;
  if (!meetingId || !isValidAiSessionId(sessionId)) throw new Error("Invalid meeting session ID");
  return sessionId;
}
