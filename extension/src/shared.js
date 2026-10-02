/* eslint-disable */
/**
 * shared.js — Port JS thuần của app/lib/meeting-links.ts (detectProvider)
 * và phần speaker-fusion của app/lib/realtime-protocol.ts (resolveSpeakerName).
 * PHẠM VI: chỉ Google Meet.
 * GIỮ ĐỒNG BỘ TAY khi sửa 2 file gốc. Không dùng import/export (MV3 content script).
 */
(function (global) {
  "use strict";

  const MEET_PATTERNS = [
    /^https:\/\/(?:www\.)?meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[/?#].*)?$/i,
    /^https:\/\/(?:www\.)?meet\.google\.com\/lookup\/[\w-]+(?:[/?#].*)?$/i,
  ];
  function detectProvider(rawUrl) {
    const url = String(rawUrl || "").trim();
    if (!url) return null;
    if (MEET_PATTERNS.some((re) => re.test(url))) return "meet";
    return null;
  }

  // ---- Speaker fusion (port từ resolveSpeakerName) ----
  function normalizeName(raw) {
    return String(raw || "").trim().replace(/\s+/g, " ");
  }

  function activeNameAt(spans, t) {
    let best = null;
    for (const s of spans) {
      if (t < s.start || t > s.end) continue;
      if (!best || s.start > best.start) best = s;
    }
    return best ? normalizeName(best.name) : null;
  }

  function captionNameOverlap(captions, start, end) {
    let best = null;
    let bestOverlap = 0;
    for (const c of captions) {
      const overlap = Math.min(c.end, end) - Math.max(c.start, start);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = c;
      }
    }
    if (!best || bestOverlap < 0.3) return null;
    return normalizeName(best.name);
  }

  function resolveSpeakerName(segStart, segEnd, ctx) {
    const mid = (segStart + segEnd) / 2;
    const atMid = activeNameAt(ctx.activeSpans || [], mid);
    const atStart = activeNameAt(ctx.activeSpans || [], segStart + 0.05);
    const atEnd = activeNameAt(ctx.activeSpans || [], segEnd - 0.05);
    let splitAt;
    if (atStart && atEnd && atStart !== atEnd) {
      for (const s of ctx.activeSpans || []) {
        if (normalizeName(s.name) === atStart && s.end > segStart && s.end < segEnd) {
          splitAt = s.end;
          break;
        }
      }
      if (splitAt === undefined) splitAt = mid;
    }
    if (atMid) return { name: atMid, splitAt, uncertain: false };
    const fromCaption = captionNameOverlap(ctx.captionLines || [], segStart, segEnd);
    if (fromCaption) return { name: fromCaption, uncertain: false };
    if (ctx.prevName && ctx.prevEnd !== undefined && segStart - ctx.prevEnd < 1.0) {
      return { name: ctx.prevName, uncertain: true };
    }
    return { name: (ctx.fallbackName || "SPEAKER_00"), uncertain: true };
  }

  global.ClassNotingShared = {
    detectProvider,
    normalizeName,
    resolveSpeakerName,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
