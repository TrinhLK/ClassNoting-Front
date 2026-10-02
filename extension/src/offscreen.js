/* eslint-disable */
/**
 * offscreen.js — Thu audio tab họp → PCM 16kHz → WS classnoting-realtime-server.
 * Port logic từ app/hooks/useLocalTranscription.ts + app/lib/realtime-protocol.ts.
 * Fusion tên người nói bằng ClassNotingShared.resolveSpeakerName với spans/captions
 * do background cung cấp (từ content script).
 */
(function () {
  "use strict";
  const shared = globalThis.ClassNotingShared;

  const SAMPLE_RATE = 16000;
  const BUFFER_SIZE = 8192;
  const HEARTBEAT_MS = 8000;
  const CONNECT_TIMEOUT_MS = 8000;
  const MAX_RETRY = 5;
  const SILENCE = new Int16Array(16000);

  // tabId -> capture state
  const captures = new Map();

  function downsample(buffer, inputRate, outputRate) {
    if (outputRate === inputRate) {
      const buf = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        buf[i] = Math.max(-1, Math.min(1, buffer[i])) * 0x7fff;
      }
      return buf;
    }
    const ratio = inputRate / outputRate;
    const result = new Int16Array(Math.round(buffer.length / ratio));
    let oRes = 0, oBuf = 0;
    while (oRes < result.length) {
      const next = Math.round((oRes + 1) * ratio);
      let accum = 0, count = 0;
      for (let i = oBuf; i < next && i < buffer.length; i++) { accum += buffer[i]; count++; }
      result[oRes] = Math.max(-1, Math.min(1, count > 0 ? accum / count : 0)) * 32768;
      oRes++; oBuf = next;
    }
    return result;
  }

  function parsePacket(data) {
    if (!data || typeof data !== "object" || data.type === "keepalive") return null;
    const alt = data.channel && data.channel.alternatives && data.channel.alternatives[0];
    const raw = alt && typeof alt.transcript === "string" ? alt.transcript : "";
    if (!raw) return null;
    const words = Array.isArray(alt.words) ? alt.words : [];
    const sp = typeof alt.speaker === "number" ? alt.speaker
      : (words[0] && typeof words[0].speaker === "number" ? words[0].speaker : 0);
    return { kind: data.is_final ? "final" : "interim", text: raw, words, serverSpeaker: sp };
  }

  function getSpans(tabId) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "CN_GET_SPANS", tabId }, (res) => {
          resolve(res || { spans: [], captions: [] });
        });
      } catch (e) {
        resolve({ spans: [], captions: [] });
      }
    });
  }

  async function handleFinal(cap, packet) {
    // Chuẩn hóa timestamp như web app.
    if (cap.serverOffset === null) {
      const first = packet.words[0];
      cap.serverOffset = first && first.start > 3600 ? first.start : 0;
    }
    const words = packet.words.map((w) => ({
      start: Math.max(0, w.start - (cap.serverOffset || 0)),
      end: Math.max(0, w.end - (cap.serverOffset || 0)),
    }));
    const start = words.length > 0 ? words[0].start : cap.lastEnd + 0.1;
    const end = words.length > 0 ? words[words.length - 1].end : cap.lastEnd + 0.1;
    cap.lastEnd = Math.max(cap.lastEnd, end);

    const { spans, captions } = await getSpans(cap.tabId);
    const r = shared.resolveSpeakerName(start, end, {
      activeSpans: spans,
      captionLines: captions,
      prevName: cap.prevName,
      prevEnd: cap.prevEnd,
      fallbackName: "SPEAKER_" + String(cap.unknownCount).padStart(2, "0"),
    });
    if (r.uncertain && r.name.startsWith("SPEAKER_")) cap.unknownCount++;
    cap.prevName = r.name;
    cap.prevEnd = end;

    const sendSeg = (id, speaker, text, s, e, uncertain) => {
      try {
        chrome.runtime.sendMessage({
          type: "CN_ASR_FINAL", tabId: cap.tabId, id, speaker, text,
          start: s, end: e, uncertain: uncertain || undefined,
        });
      } catch (err) { /* background restart */ }
    };

    // Tách segment khi lật người nói giữa chừng: resolve riêng từng nửa.
    if (r.splitAt && r.splitAt > start + 0.5 && r.splitAt < end - 0.5) {
      const ratio = (r.splitAt - start) / Math.max(0.01, end - start);
      const cut = Math.max(1, Math.floor(packet.text.length * ratio));
      const r1 = shared.resolveSpeakerName(start, r.splitAt, {
        activeSpans: spans, captionLines: captions,
        prevName: cap.prevName, prevEnd: cap.prevEnd,
        fallbackName: "SPEAKER_" + String(cap.unknownCount).padStart(2, "0"),
      });
      const r2 = shared.resolveSpeakerName(r.splitAt, end, {
        activeSpans: spans, captionLines: captions, prevName: undefined, prevEnd: undefined,
        fallbackName: "SPEAKER_" + String(cap.unknownCount).padStart(2, "0"),
      });
      sendSeg("asr_" + Date.now() + "_a", r1.name, packet.text.slice(0, cut), start, r.splitAt, r1.uncertain);
      sendSeg("asr_" + Date.now() + "_b", r2.name, packet.text.slice(cut), r.splitAt, end, r2.uncertain);
      cap.prevName = r2.name;
    } else {
      sendSeg("asr_" + Date.now(), r.name, packet.text, start, end, r.uncertain);
    }
  }

  async function startCapture(msg) {
    const { tabId, wsBase } = msg;
    if (captures.has(tabId)) return;
    const cap = {
      tabId, sessionId: msg.sessionId, ws: null, ctx: null, proc: null,
      stream: null, heartbeat: null, connectTimer: null,
      retry: 0, closed: false, serverOffset: null, lastEnd: 0,
      prevName: undefined, prevEnd: undefined, unknownCount: 0,
      buffer: [],
    };
    captures.set(tabId, cap);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: msg.streamId },
      },
    });
    cap.stream = stream;
    const ctx = new AudioContext();
    cap.ctx = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
    cap.proc = proc;
    src.connect(proc);
    proc.connect(ctx.destination);

    const connect = () => {
      if (cap.closed) return;
      const ws = new WebSocket(`${wsBase}/?language=vi&client=extension&session=${msg.sessionId}`);
      cap.ws = ws;
      cap.connectTimer = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) { try { ws.close(); } catch (e) {} }
      }, CONNECT_TIMEOUT_MS);
      ws.onopen = () => {
        if (cap.connectTimer) { clearTimeout(cap.connectTimer); cap.connectTimer = null; }
        cap.retry = 0;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        for (const chunk of cap.buffer.splice(0)) {
          if (ws.readyState === WebSocket.OPEN) ws.send(chunk.buffer);
        }
        if (cap.heartbeat) clearInterval(cap.heartbeat);
        cap.heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(SILENCE.buffer);
        }, HEARTBEAT_MS);
      };
      ws.onmessage = (event) => {
        let data = null;
        try { data = JSON.parse(event.data); } catch (e) { return; }
        const packet = parsePacket(data);
        if (!packet || packet.kind !== "final") return;
        handleFinal(cap, packet);
      };
      ws.onclose = () => {
        if (cap.heartbeat) { clearInterval(cap.heartbeat); cap.heartbeat = null; }
        if (cap.closed) return;
        if (cap.retry < MAX_RETRY) {
          const delay = Math.min(1000 * Math.pow(2, cap.retry), 16000);
          cap.retry++;
          setTimeout(connect, delay);
        }
      };
    };
    connect();

    proc.onaudioprocess = (e) => {
      const ws = cap.ws;
      const pcm = downsample(e.inputBuffer.getChannelData(0), ctx.sampleRate, SAMPLE_RATE);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        cap.buffer.push(pcm);
        if (cap.buffer.length > 50) cap.buffer.shift();
        return;
      }
      for (const chunk of cap.buffer.splice(0)) ws.send(chunk.buffer);
      ws.send(pcm.buffer);
    };
  }

  function stopCapture(tabId) {
    const cap = captures.get(tabId);
    if (!cap) return;
    cap.closed = true;
    captures.delete(tabId);
    try { cap.ws && cap.ws.close(1000, "stop"); } catch (e) {}
    if (cap.heartbeat) clearInterval(cap.heartbeat);
    if (cap.connectTimer) clearTimeout(cap.connectTimer);
    try { cap.proc && cap.proc.disconnect(); } catch (e) {}
    try { cap.stream && cap.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { cap.ctx && cap.ctx.close().catch(() => {}); } catch (e) {}
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "CN_AUDIO_START") {
      startCapture(msg).catch(() => {
        captures.delete(msg.tabId);
      });
    }
    if (msg?.type === "CN_AUDIO_STOP") stopCapture(msg.tabId);
  });
})();
