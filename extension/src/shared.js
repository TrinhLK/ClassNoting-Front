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
      if (t < s.start || t >= s.end) continue;
      if (best && (normalizeName(best.name) !== normalizeName(s.name) ||
          (best.participantId && s.participantId && best.participantId !== s.participantId))) return null;
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
    if (!best || bestOverlap < Math.min(0.3, (end - start) / 2)) return null;
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
    const fromCaption = captionNameOverlap(ctx.captionLines || [], segStart, segEnd);
    if (atMid && fromCaption && atMid !== fromCaption) return { name: ctx.fallbackName || "SPEAKER_00", uncertain: true };
    if (atMid) return { name: atMid, splitAt, uncertain: fromCaption !== atMid };
    if (fromCaption) return { name: fromCaption, uncertain: true };
    if (ctx.prevName && ctx.prevEnd !== undefined && segStart >= ctx.prevEnd && segStart - ctx.prevEnd < 1.0) {
      return { name: ctx.prevName, uncertain: true };
    }
    return { name: (ctx.fallbackName || "SPEAKER_00"), uncertain: true };
  }

  function resolveAudioSpeaker(source, start, end, ctx) {
    if (source === "mic" && ctx.selfParticipant?.id && ctx.selfParticipant?.name) {
      return {name: normalizeName(ctx.selfParticipant.name), participantId: String(ctx.selfParticipant.id),
        uncertain: false, speakerSource: "platform"};
    }
    const captions = ctx.captionLines || [];
    const localNames = new Set(captions.filter(c => c.isSelf === true && c.name && !/^(you|bạn)$/i.test(c.name)).map(c => c.name));
    if (ctx.selfParticipant?.name) localNames.add(ctx.selfParticipant.name);
    const remoteSpan = span => span.participantId && ctx.selfParticipant?.id
      ? span.participantId !== ctx.selfParticipant.id : !localNames.has(span.name);
    const resolved = resolveSpeakerName(start, end, {
      ...ctx,
      activeSpans: source === "mic" ? [] : (ctx.activeSpans || []).filter(remoteSpan),
      captionLines: captions.filter(c => source === "mic" ? c.isSelf === true : c.isSelf !== true),
    });
    // This stream is the local Meet microphone, so a uniquely confirmed local
    // account owns it even if ASR timestamps precede the arrival of captions.
    if (source === "mic" && localNames.size === 1 && resolved.name === ctx.fallbackName) {
      resolved.name = [...localNames][0];
      resolved.uncertain = true;
    }
    // A local caption identifies the Meet account, not a biometric identity.
    const mid = (start + end) / 2;
    const spans = (ctx.activeSpans || []).filter(remoteSpan);
    const active = activeNameAt(spans, mid);
    const identities = new Set(spans.filter(s => s.start <= mid && mid < s.end && s.name === resolved.name && s.participantId).map(s => s.participantId));
    return { ...resolved, ...(active === resolved.name && identities.size === 1 ? {participantId:[...identities][0]} : {}),
      speakerSource: source === "mic" || !active ? "caption" : "active-speaker" };
  }

  // Meet captions may arrive after the opening words. Recover only an exact
  // textual prefix with one account, a bounded delay and no competing speaker.
  function resolveCaptionPrefix(source, start, end, text, captions) {
    const normalize = value => String(value || "").toLocaleLowerCase("vi")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d")
      .replace(/\b(mot|hai|ba|bon|nam|sau)\b/g, word => ({mot:1,hai:2,ba:3,bon:4,nam:5,sau:6})[word])
      .replace(/[^a-z0-9]+/g, " ").trim();
    const prefix = normalize(text);
    if (prefix.split(" ").length < 3) return null;
    const eligible = (captions || []).filter(c => source === "mic" ? c.isSelf === true : c.isSelf !== true);
    const matches = eligible.filter(c => c.name && c.start >= start && c.start - start <= 3 && c.end >= end - .25 &&
      (normalize(c.text) === prefix || normalize(c.text).startsWith(prefix + " ")));
    const names = new Set(matches.map(c => c.name));
    if (names.size !== 1) return null;
    const name = matches[0].name;
    if (eligible.some(c => c.name !== name && c.end > start && c.start <= matches[0].start)) return null;
    return { name, uncertain: true, speakerSource: "caption" };
  }

  // Nối chuỗi chống lặp (port từ mergeText của realtime-protocol.ts).
  function mergeText(prev, next) {
    const p = String(prev || "").trim();
    const n = String(next || "").trim();
    if (!p) return n;
    if (!n) return p;
    if (n.startsWith(p)) return n;
    if (p.endsWith(n)) return p;
    const overlapMax = Math.min(p.length, n.length, 20);
    for (let i = overlapMax; i > 0; i--) {
      if (p.slice(-i) === n.slice(0, i)) return p + n.slice(i);
    }
    if (/^[.,!?;:]/.test(n)) return p + n;
    return p + " " + n;
  }

  // Hai segment ASR final có gộp thành một không? Cùng người nói (chuẩn hóa)
  // và gap nhỏ — mirror mergeFinalSegment phía web app. Pure — test được.
  // maxGap mặc định 1.5s (rộng hơn web 1.0s vì nhịp ASR extension thưa hơn).
  function shouldMergeSeg(prev, next, maxGap) {
    if (!prev || !next) return false;
    const gap = typeof maxGap === "number" ? maxGap : 1.5;
    const ps = normalizeName(prev.speaker || "").toLowerCase();
    const ns = normalizeName(next.speaker || "").toLowerCase();
    if (!ps || ps !== ns) return false;
    const g = (next.start || 0) - (prev.end || 0);
    return g >= 0 && g < gap;
  }

  function createMeetParagraphTracker(makeId = () => crypto.randomUUID()) {
    let current = null;
    const assigned = new Map();
    const pauses = new Set();
    return {
      assign(segment, eventId, source) {
        if (assigned.has(eventId)) return assigned.get(eventId);
        const identity = segment.participantId ? `participant:${segment.participantId}` :
          `unknown:${segment.voiceId || source}:${segment.speaker}`;
        // A name shared by two accounts is never used as the identity key.
        if (!current || current.identity !== identity || segment.start < current.end - 0.25) {
          current = { id: makeId(), identity, source, end: segment.end, pauseCount: 0 };
        }
        current.end = Math.max(current.end, segment.end);
        current.source = source;
        assigned.set(eventId, current.id);
        if (assigned.size > 10000) assigned.delete(assigned.keys().next().value);
        return current.id;
      },
      pause(eventId, source, seconds) {
        if (!current || current.source !== source || !Number.isFinite(seconds) || seconds < 1 || pauses.has(eventId)) return;
        pauses.add(eventId);
        if (pauses.size > 10000) pauses.delete(pauses.values().next().value);
        if (++current.pauseCount === 5) current = null;
      },
      close() { current = null; },
    };
  }

  function recoverShortActivePrefix(groups, spans) {
    if (groups.length < 2) return groups;
    const first = groups[0], next = groups[1];
    if (first.participantId || !next.participantId || next.speakerSource !== 'active-speaker' ||
        first.words.length === 0 || first.words.length > 2 || first.text.trim().split(/\s+/).length > 2 ||
        first.end - first.start > 0.6 || first.end < first.start ||
        next.start - first.end > 0.25 || next.start < first.end - 0.05 || next.end - next.start < 1.5 ||
        first.words.some(w => w.overlap) || next.words.some(w => w.overlap)) return groups;
    const evidence = spans.filter(s => s.start < next.end && s.end > first.start - 0.3);
    // No prefix propagation across a speaker switch or unknown account evidence.
    if (!evidence.length || evidence.some(s => !s.participantId || s.participantId !== next.participantId)) return groups;
    first.participantId = next.participantId; first.speaker = next.speaker;
    first.identity = `participant:${next.participantId}`;
    first.speakerSource = 'active-speaker'; first.uncertain = true;
    return groups;
  }

  function coalesceSpeakerGroups(groups) {
    const merged = [];
    for (const group of groups) {
      const prior = merged[merged.length - 1];
      if (prior && group.participantId && prior.participantId === group.participantId &&
          prior.uncertain === group.uncertain &&
          group.start - prior.end <= 1 && !prior.words.some(w => w.overlap) && !group.words.some(w => w.overlap)) {
        prior.text += ' ' + group.text; prior.end = group.end; prior.words.push(...group.words);
        if (/:-1$/.test(prior.voiceId)) prior.voiceId = group.voiceId;
      } else merged.push({...group, words:[...group.words]});
    }
    return merged;
  }

  function createVoiceIdentityTracker() {
    const voices = new Map();
    return {
      observe(group) {
        if (!group.voiceId || /:-1$/.test(group.voiceId) || group.words?.some(w => w.overlap) ||
            !group.participantId || !["caption", "platform", "active-speaker"].includes(group.speakerSource)) return;
        const key = String(group.participantId);
        let value = voices.get(group.voiceId);
        if (!value) { value = {key, name: group.speaker, seconds: 0, blocked: false}; voices.set(group.voiceId, value); }
        if (value.key !== key) value.blocked = true;
        if (!value.blocked) value.seconds += Math.max(0, group.end - group.start);
        if (voices.size > 512) voices.delete(voices.keys().next().value);
      },
      resolve(voiceId) {
        const value = voices.get(voiceId);
        return value && !value.blocked && value.seconds >= 3 ? {participantId: value.key, name: value.name} : null;
      },
    };
  }

  global.ClassNotingShared = {
    createMeetParagraphTracker,
    createVoiceIdentityTracker,
    coalesceSpeakerGroups,
    recoverShortActivePrefix,
    resolveCaptionPrefix,
    detectProvider,
    normalizeName,
    resolveSpeakerName,
    resolveAudioSpeaker,
    mergeText,
    shouldMergeSeg,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
