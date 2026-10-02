// app/lib/meeting-links.ts
// Shared helper: detect + validate meeting URLs.
// PHẠM VI: chỉ Google Meet (Zoom/MS Teams đã loại khỏi sản phẩm).

export type MeetingProvider = "meet";

const MEET_PATTERNS = [
  /^https:\/\/(?:www\.)?meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[/?#].*)?$/i,
  /^https:\/\/(?:www\.)?meet\.google\.com\/lookup\/[\w-]+(?:[/?#].*)?$/i,
];

export function detectProvider(rawUrl: string): MeetingProvider | null {
  const url = rawUrl.trim();
  if (!url) return null;
  if (MEET_PATTERNS.some((re) => re.test(url))) return "meet";
  return null;
}

/** Strict validation: must be a Google Meet link. */
export function validateMeetingUrl(rawUrl: string): boolean {
  return detectProvider(rawUrl) !== null;
}

export const PROVIDER_LABELS: Record<MeetingProvider, string> = {
  meet: "Google Meet",
};

/**
 * Build the display bot name as "Thư ký của {userName}".
 * Falls back to email prefix / generic when name is missing.
 */
export function buildBotName(userName?: string | null, email?: string | null): string {
  const name = (userName || "").trim() || (email || "").split("@")[0]?.trim();
  if (!name) return "Thư ký AI";
  return `Thư ký của ${name}`;
}
