/**
 * realtime-protocol.ts — Logic dùng chung cho Live ASR (classnoting-realtime-server).
 *
 * Dùng bởi:
 * - Web app: `app/hooks/useLocalTranscription.ts` (mic + thu hệ thống)
 * - Chrome extension (offscreen document): audio tab họp → cùng WebSocket server
 *
 * Mục tiêu: một định nghĩa duy nhất cho protocol (PCM 16kHz, heartbeat,
 * parse response, nối segment, gán tên người nói) để hai client không fork lệch.
 */

import type { Word } from "./mockData";

// ---------------------------------------------------------------------------
// Hằng số protocol (giữ nguyên giá trị đang chạy production)
// ---------------------------------------------------------------------------

/** Sample rate server yêu cầu. */
export const REALTIME_SAMPLE_RATE = 16000;

/** Kích thước chunk ScriptProcessor. */
export const REALTIME_BUFFER_SIZE = 8192;

/** Silence buffer 1 giây @16kHz — heartbeat giữ WS sống trước Cloudflare idle-timeout. */
export const SILENCE_BUFFER = new Int16Array(16000);

/** Chu kỳ heartbeat (ms). */
export const HEARTBEAT_INTERVAL_MS = 8000;

/** Buffer tối đa khi mất kết nối (~5 giây audio). */
export const MAX_AUDIO_BUFFER_SIZE = 50;

/** WS kẹt ở CONNECTING quá lâu → ép close để retry. */
export const CONNECT_TIMEOUT_MS = 8000;

/** Số lần retry tối đa. */
export const MAX_RECONNECT_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Audio: downsample & convert Int16 (tách từ useLocalTranscription, giữ nguyên)
// ---------------------------------------------------------------------------

export const downsampleBuffer = (
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Int16Array => {
  if (outputSampleRate === inputSampleRate) return convertFloat32ToInt16(buffer);
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Int16Array(newLength);
  let offsetResult = 0,
    offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0,
      count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] =
      Math.max(-1, Math.min(1, count > 0 ? accum / count : 0)) * 32768;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
};

export const convertFloat32ToInt16 = (buffer: Float32Array): Int16Array => {
  let l = buffer.length;
  const buf = new Int16Array(l);
  while (l--) buf[l] = Math.max(-1, Math.min(1, buffer[l])) * 0x7fff;
  return buf;
};

// ---------------------------------------------------------------------------
// URL WebSocket (tương thích ngược: param lạ server cũ bỏ qua)
// ---------------------------------------------------------------------------

export function buildRealtimeUrl(
  baseUrl: string,
  language: string,
  extra?: { client?: string; session?: string }
): string {
  const params = new URLSearchParams({ language });
  if (extra?.client) params.set("client", extra.client);
  if (extra?.session) params.set("session", extra.session);
  // baseUrl dạng "wss://host" (không query) — chuẩn hiện tại của app.
  // Server cũ bỏ qua param lạ → tương thích ngược.
  return `${baseUrl}/?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Parse message từ server
// ---------------------------------------------------------------------------

export interface ServerWord {
  word: string;
  start: number;
  end: number;
  speaker?: number;
  confidence?: number;
  uncertain?: boolean;
  overlap?: boolean;
}

export interface ParsedServerPacket {
  kind: "interim" | "final";
  /** Raw transcript (chưa format) — caller tự formatTranscriptText. */
  rawTranscript: string;
  rawWords: ServerWord[];
  /** Index người nói do server trả (nếu có), mặc định 0. */
  serverSpeaker: number;
  speakerScope?: string;
  protocol?: number;
}

export function parseServerMessage(data: unknown): ParsedServerPacket | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  // Bỏ qua keepalive.
  if (msg.type === "keepalive") return null;

  const channel = msg.channel as
    | { alternatives?: Array<{ transcript?: unknown; words?: ServerWord[]; speaker?: unknown }> }
    | undefined;
  const alt = channel?.alternatives?.[0];
  const rawTranscript = typeof alt?.transcript === "string" ? alt.transcript : "";
  if (!rawTranscript) return null;

  const rawWords = Array.isArray(alt?.words) ? (alt.words as ServerWord[]) : [];
  const fromAlt = typeof alt?.speaker === "number" ? alt.speaker : undefined;
  const fromWord = typeof rawWords[0]?.speaker === "number" ? rawWords[0].speaker : undefined;
  return {
    kind: msg.is_final ? "final" : "interim",
    rawTranscript,
    rawWords,
    serverSpeaker: fromAlt ?? fromWord ?? -1,
    ...(typeof msg.speaker_scope === "string" ? { speakerScope: msg.speaker_scope } : {}),
    ...(typeof msg.protocol === "number" ? { protocol: msg.protocol } : {}),
  };
}

// ---------------------------------------------------------------------------
// Nối chuỗi thông minh (chống lặp) — giữ nguyên logic cũ
// ---------------------------------------------------------------------------

export const mergeText = (prev: string, next: string): string => {
  const p = prev.trim();
  const n = next.trim();
  if (!p) return n;
  if (!n) return p;
  if (n.startsWith(p)) return n;
  const overlapMax = Math.min(p.length, n.length, 20);
  for (let i = overlapMax; i > 0; i--) {
    const suffix = p.slice(-i);
    const prefix = n.slice(0, i);
    if (suffix === prefix) return p + n.slice(i);
  }
  if (/^[.,!?;:]/.test(n)) return p + n;
  return p + " " + n;
};

// Dùng `type` (không phải `interface`): TS chỉ cho object type literal
// implicit index signature — cần để tương thích với TranscriptView.
export type TranscriptSegment = {
  speaker: number;
  content: string;
  isFinal: boolean;
  words?: Word[];
  uncertain?: boolean;
};

export interface MergeResult {
  segments: TranscriptSegment[];
  /** End timestamp mới nhất — caller lưu vào ref. */
  lastEnd: number;
}

/**
 * Gộp segment final vào danh sách (pure — tách từ useLocalTranscription).
 * `words` đã được chuẩn hóa timestamp + formatWords trước khi gọi.
 */
export function mergeFinalSegment(
  prev: TranscriptSegment[],
  transcript: string,
  words: Word[],
  speaker: number,
  prevLastEnd: number
): MergeResult {
  const lastSegment = prev[prev.length - 1];
  const currentStart = words.length > 0 ? words[0].start : prevLastEnd + 0.1;
  const gap = currentStart - prevLastEnd;
  const lastEnd =
    words.length > 0 ? words[words.length - 1].end : prevLastEnd;

  if (lastSegment && lastSegment.speaker === speaker && gap < 1.0) {
    return {
      segments: [
        ...prev.slice(0, -1),
        {
          ...lastSegment,
          content: mergeText(lastSegment.content, transcript),
          words: (lastSegment.words || []).concat(words),
        },
      ],
      lastEnd,
    };
  }

  return {
    segments: [...prev, { speaker, content: transcript, isFinal: true, words }],
    lastEnd,
  };
}

// ---------------------------------------------------------------------------
// Gán tên người nói từ Google Meet — pure, testable
// ---------------------------------------------------------------------------

/** Khoảng thời gian một cái tên đang "giữ mic" (từ chỉ báo active-speaker DOM). */
export interface ActiveSpan {
  name: string;
  start: number;
  end: number;
}

/** Dòng caption live kèm tên (Google Meet CC). */
export interface CaptionLine {
  name: string;
  text: string;
  start: number;
  end: number;
}

export interface SpeakerResolveContext {
  activeSpans: ActiveSpan[];
  captionLines: CaptionLine[];
  /** Tên segment trước đó (để nối khi gap nhỏ). */
  prevName?: string;
  /** End của segment trước đó (giây). */
  prevEnd?: number;
  /** Tên hiển thị thay thế khi không xác định được (mặc định theo index). */
  fallbackName?: string;
}

export interface SpeakerResolveResult {
  name: string;
  /** Thời điểm (giây) phát hiện lật người nói giữa segment → caller tách segment. */
  splitAt?: number;
  /** true khi kết quả chỉ là suy đoán yếu (nên gắn cờ để hậu kỳ rà soát). */
  uncertain: boolean;
}

const normalizeName = (raw: string): string => raw.trim().replace(/\s+/g, " ");

function activeNameAt(spans: ActiveSpan[], t: number): string | null {
  // Ưu tiên span chứa t; nếu nhiều, lấy span bắt đầu gần t nhất.
  let best: ActiveSpan | null = null;
  for (const s of spans) {
    if (t < s.start || t >= s.end) continue;
    if (best && normalizeName(best.name) !== normalizeName(s.name)) return null;
    if (!best || s.start > best.start) best = s;
  }
  return best ? normalizeName(best.name) : null;
}

function captionNameOverlap(
  captions: CaptionLine[],
  start: number,
  end: number
): string | null {
  let best: CaptionLine | null = null;
  let bestOverlap = 0;
  for (const c of captions) {
    const overlap = Math.min(c.end, end) - Math.max(c.start, start);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = c;
    }
  }
  // Chỉ tin caption overlap đáng kể (>0.3s) để tránh nhiễu.
  if (!best || bestOverlap < Math.min(0.3, (end - start) / 2)) return null;
  return normalizeName(best.name);
}

/**
 * Gán tên người nói thật cho một segment ASR `{start, end}`.
 * Thứ tự: active-speaker tại midpoint → phát hiện lật người nói → caption
 * overlap → nối prev khi gap nhỏ → fallback.
 */
export function resolveSpeakerName(
  segStart: number,
  segEnd: number,
  ctx: SpeakerResolveContext
): SpeakerResolveResult {
  const mid = (segStart + segEnd) / 2;
  const atMid = activeNameAt(ctx.activeSpans, mid);

  // Phát hiện lật người nói giữa segment: active ở đầu ≠ active ở cuối.
  const atStart = activeNameAt(ctx.activeSpans, segStart + 0.05);
  const atEnd = activeNameAt(ctx.activeSpans, segEnd - 0.05);
  let splitAt: number | undefined;
  if (atStart && atEnd && atStart !== atEnd) {
    // Tìm biên lật: thời điểm span của atStart kết thúc trong segment.
    for (const s of ctx.activeSpans) {
      if (
        normalizeName(s.name) === atStart &&
        s.end > segStart &&
        s.end < segEnd
      ) {
        splitAt = s.end;
        break;
      }
    }
    splitAt ??= mid;
  }

  const fromCaption = captionNameOverlap(ctx.captionLines, segStart, segEnd);
  if (atMid && fromCaption && atMid !== fromCaption) return { name: ctx.fallbackName ?? "SPEAKER_00", uncertain: true };
  if (atMid) return { name: atMid, splitAt, uncertain: fromCaption !== atMid };
  if (fromCaption) return { name: fromCaption, uncertain: true };

  if (
    ctx.prevName &&
    ctx.prevEnd !== undefined &&
    segStart >= ctx.prevEnd && segStart - ctx.prevEnd < 1.0
  ) {
    return { name: ctx.prevName, uncertain: true };
  }

  return { name: ctx.fallbackName ?? "SPEAKER_00", uncertain: true };
}

/** Split on word-level labels, preserving the whole transcript when there is no turn. */
export function splitSpeakerTurns(packet: ParsedServerPacket): ParsedServerPacket[] {
  const words = packet.rawWords.filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start);
  const groups: ParsedServerPacket[] = [];
  for (const word of words) {
    const speaker = word.overlap ? -1 : (word.speaker ?? packet.serverSpeaker);
    let group = groups[groups.length - 1];
    if (!group || group.serverSpeaker !== speaker) {
      group = { ...packet, rawTranscript: "", rawWords: [], serverSpeaker: speaker };
      groups.push(group);
    }
    group.rawWords.push(word);
    group.rawTranscript += (group.rawTranscript ? " " : "") + word.word;
  }
  if (groups.length <= 1) return [{ ...packet, rawWords: words, serverSpeaker: groups[0]?.serverSpeaker ?? packet.serverSpeaker }];
  return groups;
}

export function speakersFromSegments(segments: Array<{ speakerId: string }>) {
  return [...new Set(segments.map(s => s.speakerId))].map((id, index) => ({
    id, name: id.includes("-1") ? "Chưa xác định" : `Người nói ${index + 1}`,
    color: "bg-indigo-50 text-indigo-700",
  }));
}
