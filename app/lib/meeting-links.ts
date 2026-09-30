// app/lib/meeting-links.ts
// Shared helper: detect + validate meeting URLs for Google Meet / Zoom / MS Teams.
// Used by both client (BotJoinModal) and server ( /api/bots/* ).

export type MeetingProvider = "meet" | "zoom" | "teams";

const MEET_PATTERNS = [
  /^https:\/\/(?:www\.)?meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[/?#].*)?$/i,
  /^https:\/\/(?:www\.)?meet\.google\.com\/lookup\/[\w-]+(?:[/?#].*)?$/i,
];

const ZOOM_PATTERNS = [
  // https://xxx.zoom.us/j/123... / https://zoom.us/my/... / https://*.zoomgov.com/...
  /^https:\/\/(?:[\w-]+\.)?zoom\.(?:us|com)(?::\d+)?\/(?:j|my|s|w)\/[\w.\-]+(?:[/?#].*)?$/i,
  /^https:\/\/(?:[\w-]+\.)?zoom\.(?:us|com)(?::\d+)?\/wc\/[\w.\-]+(?:[/?#].*)?$/i,
  /^https:\/\/(?:[\w-]+\.)?zoomgov\.com(?::\d+)?\/(?:j|my|s|w|wc)\/[\w.\-]+(?:[/?#].*)?$/i,
];

const TEAMS_PATTERNS = [
  // Classic meetup-join links
  /^https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^/]+(?:[/?#].*)?$/i,
  // teams.live.com meet links
  /^https:\/\/teams\.live\.com\/meet\/[^/]+(?:[/?#].*)?$/i,
  // teams.microsoft.com v2 meet links (dl/passport)
  /^https:\/\/teams\.microsoft\.com\/(?:v2\/)?meet\/[^/]+(?:[/?#].*)?$/i,
  /^https:\/\/teams\.microsoft\.com\/dl\/launcher\/launcher\.html.*url=.*meetup-join.*/i,
  // msteams short links
  /^https:\/\/(?:www\.)?msteams\.link\/.*/i,
];

export function detectProvider(rawUrl: string): MeetingProvider | null {
  const url = rawUrl.trim();
  if (!url) return null;
  if (MEET_PATTERNS.some((re) => re.test(url))) return "meet";
  if (ZOOM_PATTERNS.some((re) => re.test(url))) return "zoom";
  if (TEAMS_PATTERNS.some((re) => re.test(url))) return "teams";
  return null;
}

/** Strict validation: must match one of the known provider patterns. */
export function validateMeetingUrl(rawUrl: string): boolean {
  return detectProvider(rawUrl) !== null;
}

export const PROVIDER_LABELS: Record<MeetingProvider, string> = {
  meet: "Google Meet",
  zoom: "Zoom",
  teams: "MS Teams",
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
