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

  // Báo trạng thái thu audio về background để hiện ra popup (/ext sau này).
  // Trước đây startCapture chết im (getUserMedia/tabCapture/WS lỗi đều nuốt),
  // nên ASR im lặng mà không ai biết vì sao.
  function reportAudio(cap, state, detail) {
    try {
      chrome.runtime.sendMessage({
        type: "CN_AUDIO_STATE",
        tabId: cap.tabId,
        sessionId: cap.sessionId,
        state,
        detail: detail || "",
        finals: cap.finals || 0,
        lastFinalAt: cap.lastFinalAt || 0,
      });
    } catch (e) { /* background restart */ }
  }

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

  // Tab phụ (share) không có spans của mình → hỏi theo tab Meet cùng session.
  function getSpans(cap) {
    const tabId = (cap && cap.spansTabId) || (cap && cap.tabId);
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

    const { spans, captions } = await getSpans(cap);
    const r = shared.resolveSpeakerName(start, end, {
      activeSpans: spans,
      captionLines: captions,
      prevName: cap.prevName,
      prevEnd: cap.prevEnd,
      fallbackName: "SPEAKER_" + String(cap.unknownCount).padStart(2, "0"),
    });
    // Tiếng phát ra mà không ai sáng tên (vd share màn hình có tiếng) thì là
    // của chủ phiên — gán tên tài khoản, giữ cờ uncertain để trung thực.
    let finalName = r.name;
    let finalUncertain = r.uncertain;
    if (r.uncertain && r.name.indexOf("SPEAKER_") === 0 && spans.length === 0 && cap.selfName) {
      finalName = cap.selfName;
      finalUncertain = true;
    }
    if (r.uncertain && r.name.startsWith("SPEAKER_")) cap.unknownCount++;
    cap.prevName = finalName;
    cap.prevEnd = end;
    // Ghi đè kết quả resolve bằng tên đã chốt.
    r.name = finalName;
    r.uncertain = finalUncertain;

    const sendSeg = (id, speaker, text, s, e, uncertain) => {
      try {
        chrome.runtime.sendMessage({
          type: "CN_ASR_FINAL", tabId: cap.tabId, sessionId: cap.sessionId,
          id, speaker, text,
          start: s, end: e, uncertain: uncertain || undefined,
        });
      } catch (err) { /* background restart */ }
    };

    // Gửi câu đang giữ (đã gộp) đi. Gọi khi hết 1.2s im hoặc dừng thu.
    function flushPending(c) {
      const p = c.pending;
      c.pending = null;
      if (!p) return;
      if (p.timer) {
        try {
          clearTimeout(p.timer);
        } catch (e) { /* bỏ qua */ }
      }
      sendSeg(p.id, p.speaker, p.text, p.start, p.end, p.uncertain);
    }

    // Tách segment khi lật người nói giữa chừng: resolve riêng từng nửa.
    // Mọi segment đi qua hold-buffer gộp câu (tránh vụn "đây/đây/đây").
    const hold = (id, speaker, text, s, e, uncertain) => {
      const seg = { id, speaker, text, start: s, end: e, uncertain };
      const prev = cap.pending;
      if (prev && shared.shouldMergeSeg(prev, seg)) {
        clearTimeout(prev.timer);
        prev.text = shared.mergeText(prev.text, seg.text);
        prev.end = seg.end;
        if (!prev.speaker) prev.speaker = seg.speaker;
        prev.timer = setTimeout(() => flushPending(cap), 1200);
        return;
      }
      flushPending(cap);
      seg.timer = setTimeout(() => flushPending(cap), 1200);
      cap.pending = seg;
    };
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
      hold("asr_" + Date.now() + "_a", r1.name, packet.text.slice(0, cut), start, r.splitAt, r1.uncertain);
      hold("asr_" + Date.now() + "_b", r2.name, packet.text.slice(cut), r.splitAt, end, r2.uncertain);
      cap.prevName = r2.name;
    } else {
      hold("asr_" + Date.now(), r.name, packet.text, start, end, r.uncertain);
    }
    cap.finals = (cap.finals || 0) + 1;
    cap.lastFinalAt = Date.now();
    reportAudio(cap, "transcribing", `Đã nhận ${cap.finals} câu từ ASR`);
  }

  async function startCapture(msg) {
    const { tabId, wsBase } = msg;
    const prev = captures.get(tabId);
    if (prev) {
      // Capture cũ còn sót (phiên trước end không sạch / SW restart mồ côi)
      // giữ stream tab → getMediaStreamId mới chết "active stream".
      // Cùng session thì giữ nguyên; khác session thì dừng cũ rồi thu mới.
      if (prev.sessionId && prev.sessionId === msg.sessionId) return;
      try {
        stopCapture(tabId);
      } catch (e) { /* tiếp tục thu mới */ }
    }
    const cap = {
      tabId, sessionId: msg.sessionId, selfName: msg.ownerDisplayName || "",
      // Tab phụ (share) fusion tên theo spans của tab Meet cùng session.
      spansTabId: msg.spansTabId || tabId,
      ws: null, ctx: null, proc: null,
      stream: null, heartbeat: null, connectTimer: null,
      retry: 0, closed: false, serverOffset: null, lastEnd: 0,
      prevName: undefined, prevEnd: undefined, unknownCount: 0,
      buffer: [],
      finals: 0, lastFinalAt: 0,
    };
    captures.set(tabId, cap);
    reportAudio(cap, "starting", "Đang xin quyền thu audio tab...");

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: msg.streamId },
        },
      });
    } catch (e) {
      // Hay gặp nhất: tab chưa phát tiếng (not audible) hoặc thiếu gesture.
      reportAudio(cap, "mic_failed", String((e && e.message) || e));
      throw e;
    }
    cap.stream = stream;
    // Trộn thêm mic: tabCapture chỉ thu TIẾNG RA của tab — giọng chính mình
    // (mic đi vào, không phát lại ra loa) nên họp solo mic luôn câm.
    // Mic lỗi/quyền (offscreen khó có gesture) thì vẫn chạy tab-only.
    let micStream = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      cap.micStream = micStream;
    } catch (e) {
      cap.micDenied = String((e && e.message) || e);
    }
    reportAudio(
      cap,
      "capturing",
      micStream
        ? "Đã thu tiếng tab + mic, đang nối ASR..."
        : "Chỉ thu tiếng tab (mic bị chặn, họp solo sẽ câm)."
    );
    const ctx = new AudioContext();
    cap.ctx = ctx;
    const src = ctx.createMediaStreamSource(stream);
    // 2 kênh vào: 0 = tab, 1 = mic (kênh thiếu đọc ra im lặng).
    const proc = ctx.createScriptProcessor(BUFFER_SIZE, 2, 1);
    cap.proc = proc;
    src.connect(proc);
    if (micStream) {
      try {
        const micSrc = ctx.createMediaStreamSource(micStream);
        cap.micSrc = micSrc;
        micSrc.connect(proc);
      } catch (e) {
        cap.micDenied = String((e && e.message) || e);
      }
    }
    proc.connect(ctx.destination);

    const connect = () => {
      if (cap.closed) return;
      const ws = new WebSocket(`${wsBase}/?language=vi&client=extension&session=${msg.sessionId}`);
      cap.ws = ws;
      reportAudio(cap, "ws_connecting", "Đang nối WebSocket tới server ASR...");
      cap.connectTimer = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) { try { ws.close(); } catch (e) {} }
      }, CONNECT_TIMEOUT_MS);
      ws.onopen = () => {
        if (cap.connectTimer) { clearTimeout(cap.connectTimer); cap.connectTimer = null; }
        cap.retry = 0;
        reportAudio(cap, "ws_open", "Đã nối ASR, đang chờ câu nói...");
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
          reportAudio(cap, "ws_retrying", `Mất nối ASR, thử lại lần ${cap.retry}/${MAX_RETRY}...`);
          setTimeout(connect, delay);
        } else {
          reportAudio(cap, "ws_dead", "Không nối được server ASR sau nhiều lần thử.");
        }
      };
    };
    connect();

    proc.onaudioprocess = (e) => {
      const ws = cap.ws;
      // Trộn kênh 0 (tab) + kênh 1 (mic, im lặng nếu thiếu).
      const ch0 = e.inputBuffer.getChannelData(0);
      let ch1 = null;
      try {
        if (e.inputBuffer.numberOfChannels > 1) ch1 = e.inputBuffer.getChannelData(1);
      } catch (err) { /* một kênh */ }
      let mixed = ch0;
      if (ch1) {
        mixed = new Float32Array(ch0.length);
        for (let i = 0; i < ch0.length; i++) {
          const v = ch0[i] + ch1[i];
          mixed[i] = Math.max(-1, Math.min(1, v));
        }
      }
      const pcm = downsample(mixed, ctx.sampleRate, SAMPLE_RATE);
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
    // Đẩy nốt câu đang giữ trong hold-buffer trước khi dọn.
    try {
      const p = cap.pending;
      cap.pending = null;
      if (p) {
        if (p.timer) {
          try {
            clearTimeout(p.timer);
          } catch (e) { /* bỏ qua */ }
        }
        chrome.runtime.sendMessage({
          type: "CN_ASR_FINAL", tabId: cap.tabId, sessionId: cap.sessionId,
          id: p.id, speaker: p.speaker, text: p.text,
          start: p.start, end: p.end, uncertain: p.uncertain || undefined,
        });
      }
    } catch (e) { /* bỏ qua */ }
    reportAudio(cap, "stopped", "Đã dừng thu audio.");
    captures.delete(tabId);
    try { cap.ws && cap.ws.close(1000, "stop"); } catch (e) {}
    if (cap.heartbeat) clearInterval(cap.heartbeat);
    if (cap.connectTimer) clearTimeout(cap.connectTimer);
    try { cap.proc && cap.proc.disconnect(); } catch (e) {}
    try { cap.micSrc && cap.micSrc.disconnect(); } catch (e) {}
    try { cap.stream && cap.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { cap.micStream && cap.micStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
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
