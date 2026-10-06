// app/lib/meeting-links.ts
// Shared helper: detect + validate meeting URLs.
// PHẠM VI: chỉ Google Meet (Zoom/MS Teams đã loại khỏi sản phẩm).

export type MeetingProvider = "meet" | "zoom" | "teams";

const MEET_PATTERNS = [
  /^https:\/\/(?:www\.)?meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[/?#].*)?$/i,
  /^https:\/\/(?:www\.)?meet\.google\.com\/lookup\/[\w-]+(?:[/?#].*)?$/i,
];

export function detectProvider(rawUrl: string): MeetingProvider | null {
  const url = rawUrl.trim();
  if (!url) return null;
  if (MEET_PATTERNS.some((re) => re.test(url))) return "meet";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (/(^|\.)zoom\.us$/i.test(parsed.hostname) && /^\/(j|wc\/join)\/\d+/.test(parsed.pathname)) return "zoom";
    if (["teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"].includes(parsed.hostname) && /^\/(l\/meetup-join|meet)\//.test(parsed.pathname)) return "teams";
  } catch { /* Invalid URL */ }
  return null;
}

/** Strict validation: must be a Google Meet link. */
export function validateMeetingUrl(rawUrl: string): boolean {
  return detectProvider(rawUrl) !== null;
}

export const PROVIDER_LABELS: Record<MeetingProvider, string> = {
  meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
};

/** Trích mã phòng Meet (xxx-yyyy-zzz) từ URL để đặt tên bản ghi dễ nhớ. */
export function meetCodeFromUrl(rawUrl: string): string {
  const m = rawUrl.trim().match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return m ? m[1].toLowerCase() : "";
}

/** Tên phiên mặc định: "Họp Meet {mã} {dd/MM HH:mm}" (Meet không có tên phòng). */
export function defaultMeetingTitle(meetingUrl: string, at: number = Date.now()): string {
  const code = meetCodeFromUrl(meetingUrl);
  const d = new Date(at);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return code ? `Họp Meet ${code} ${day}/${month} ${hh}:${mm}` : `Ghi chú họp ${day}/${month}`;
}

/**
 * Build the display bot name as "Thư ký của {userName}".
 * Falls back to email prefix / generic when name is missing.
 */
export function buildBotName(userName?: string | null, email?: string | null): string {
  const name = (userName || "").trim() || (email || "").split("@")[0]?.trim();
  if (!name) return "Thư ký AI";
  return `Thư ký của ${name}`;
}
