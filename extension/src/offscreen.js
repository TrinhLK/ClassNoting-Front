/* eslint-disable */
/** Two independent PCM streams. Audio clock is relative to session.startedAt. */
(function () {
  "use strict";
  const shared = globalThis.ClassNotingShared;
  const captures = new Map();
  const RATE = 16000;
  function report(cap, state, detail) {
    chrome.runtime.sendMessage({ type: "CN_AUDIO_STATE", tabId: cap.tabId,
      sessionId: cap.sessionId, state, detail, finals: cap.finals || 0 }).catch(() => {});
  }
  function pcm16(input, rate) {
    const ratio = rate / RATE;
    const out = new Int16Array(Math.round(input.length / ratio));
    for (let i = 0; i < out.length; i++) {
      let sum = 0, n = 0;
      for (let j = Math.floor(i * ratio); j < Math.min(input.length, Math.floor((i + 1) * ratio)); j++) { sum += input[j]; n++; }
      out[i] = Math.round(Math.max(-1, Math.min(1, sum / Math.max(1, n))) * 32767);
    }
    return out;
  }
  function wav(chunks) {
    const length = chunks.reduce((n, c) => n + c.length, 0);
    const buffer = new ArrayBuffer(44 + length * 2), view = new DataView(buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); view.setUint32(4, 36 + length * 2, true); str(8, "WAVEfmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, "data"); view.setUint32(40, length * 2, true);
    let offset = 44;
    for (const chunk of chunks) for (const sample of chunk) { view.setInt16(offset, sample, true); offset += 2; }
    return new Blob([buffer], { type: "audio/wav" });
  }
  function audioDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("classnoting-audio", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("pending", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  async function pendingAudio(action, value) {
    const db = await audioDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("pending", action === "getAll" ? "readonly" : "readwrite");
        const request = tx.objectStore("pending")[action](value);
        tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  async function sendAudioRecord(record) {
    const ctx = await chrome.runtime.sendMessage({ type: "CN_CAPTURE_CONTEXT", tabId: record.tabId });
    if (!ctx?.idToken) throw new Error("Mở ClassNoting để làm mới đăng nhập");
    const form = new FormData();
    for (const key of ["sessionId", "id", "source", "start"]) form.set(key, String(record[key]));
    form.set("audio", record.blob, record.id + ".wav");
    const res = await fetch(`${ctx.appOrigin}/api/extension/audio`, {
      method: "POST", headers: { Authorization: `Bearer ${ctx.idToken}` }, body: form, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Lưu audio: HTTP ${res.status}`);
    await pendingAudio("delete", record.id);
  }
  async function upload(cap, source) {
    if (!source.archive.length) return;
    const chunks = source.archive.splice(0), start = source.archiveStart;
    source.archiveSamples = 0;
    const record = { id: `${cap.captureId}_${source.name}_${source.sequence++}`, tabId: cap.tabId,
      sessionId: cap.sessionId, source: source.name, start, blob: wav(chunks) };
    try { await pendingAudio("put", record); }
    catch (e) { (cap.unpersisted ||= []).push(record); report(cap, "archive_failed", "Không thể lưu audio dự phòng: " + e.message); }
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await sendAudioRecord(record); cap.unpersisted = (cap.unpersisted || []).filter(r => r.id !== record.id); return; }
      catch (e) { if (attempt === 2) { cap.archiveFailed = true; report(cap, "archive_failed", "Audio đang chờ gửi lại: " + e.message); } }
    }
  }
  async function retryPending(tabId) {
    const records = (await pendingAudio("getAll")).filter(r => r.tabId === tabId);
    let failed = false;
    for (const record of records) { try { await sendAudioRecord(record); } catch { failed = true; } }
    return failed;
  }
  async function handleFinal(cap, source, data) {
    const alt = data.channel?.alternatives?.[0];
    if (!data.is_final || !alt?.transcript) return;
    const context = await chrome.runtime.sendMessage({ type: "CN_GET_SPANS", tabId: cap.spansTabId }).catch(() => ({}));
    const relative = list => (list || []).map(s => ({ ...s, start: s.start - cap.epoch, end: s.end - cap.epoch }));
    const spans = relative(context?.spans), captions = relative(context?.captions);
    const offset = data.protocol === 2 ? 0 : source.connectionOffset;
    const words = (alt.words || []).filter(w => Number.isFinite(w.start) && Number.isFinite(w.end))
      .map(w => ({ ...w, start: w.start + offset, end: w.end + offset }));
    // Missing timestamps are explicitly uncertain, never fabricated across a whole sentence.
    const units = words.length ? words : [{ word: alt.transcript, start: source.lastEnd, end: source.lastEnd, speaker: -1 }];
    const groups = [];
    for (const w of units) {
      const voice = w.overlap ? -1 : (w.speaker ?? alt.speaker ?? -1);
      const voiceId = `${source.name}:${data.speaker_scope || source.generation}:${voice}`;
      // Tab metadata describes remote sound. Mic may contain several people; do not label it as the owner.
      const resolved = source.name === "tab" && !w.overlap ? shared.resolveSpeakerName(w.start, w.end, {
        activeSpans: spans, captionLines: captions, fallbackName: "Chưa xác định"
      }) : { name: "Chưa xác định", uncertain: true };
      const matches = (context?.participants || []).filter(p => (p.displayName || p.name) === resolved.name);
      const participantId = matches.length === 1 && matches[0].id != null ? String(matches[0].id) : undefined;
      const speaker = resolved.name !== "Chưa xác định" ? resolved.name : voice >= 0 ? `Giọng ${source.name} ${voice + 1}` : "Chưa xác định";
      const identity = participantId ? `participant:${participantId}` : voiceId;
      const prev = groups[groups.length - 1];
      const uncertain = resolved.uncertain || !participantId || !!w.overlap;
      if (prev && prev.identity === identity && prev.speaker === speaker && prev.uncertain === uncertain) {
        prev.text += " " + w.word; prev.end = w.end; prev.words.push(w);
      } else groups.push({ identity, speaker, voiceId, ...(participantId ? { participantId } : {}),
        text: w.word, start: w.start, end: w.end, words: [w], uncertain,
        speakerSource: resolved.name !== "Chưa xác định" ? "active-speaker" : voice >= 0 ? "diarization" : "unknown" });
    }
    if (groups.length === 1) groups[0].text = alt.transcript;
    for (const group of groups) {
      source.lastEnd = Math.max(source.lastEnd, group.end);
      await chrome.runtime.sendMessage({ type: "CN_ASR_FINAL", tabId: cap.tabId, sessionId: cap.sessionId,
        ...group, id: crypto.randomUUID(), revision: 1 });
    }
    cap.finals += groups.length;
    report(cap, "transcribing", `Đã nhận ${cap.finals} đoạn; mic và tab độc lập`);
  }
  function startSource(cap, stream, name) {
    const source = { name, ws: null, buffer: [], archive: [], archiveSamples: 0, sequence: 0,
      retry: 0, generation: 0, protocol: 0, lastEnd: 0, uploads: Promise.resolve(), processing: Promise.resolve() };
    cap.sources.push(source);
    const src = cap.ctx.createMediaStreamSource(stream);
    const proc = cap.ctx.createScriptProcessor(4096, 1, 1);
    source.node = src; source.proc = proc;
    src.connect(proc); proc.connect(cap.ctx.destination);
    if (name === "tab") src.connect(cap.ctx.destination); // tabCapture suppresses normal tab playback
    function connect() {
      if (cap.closed) return;
      source.generation++; source.protocol = 0;
      const url = new URL(cap.wsBase); url.searchParams.set("language", "vi");
      url.searchParams.set("client", "extension"); url.searchParams.set("source", name);
      const ws = new WebSocket(url); source.ws = ws;
      source.timeout = setTimeout(() => { if (ws.readyState === 0) ws.close(); }, 8000);
      ws.onopen = () => { clearTimeout(source.timeout); source.retry = 0; };
      ws.onmessage = event => {
        let data; try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === "flushed") { source.onFlushed?.(); return; }
        if (data.type === "ready") { source.protocol = data.protocol || 1; return; }
        const metadataDeadline = Date.now() + (data.is_final ? 2000 : 0);
        source.processing = source.processing.then(async () => {
          await new Promise(resolve => setTimeout(resolve, Math.max(0, metadataDeadline - Date.now())));
          return handleFinal(cap, source, data);
        }).catch(e => report(cap, "transcript_failed", String(e)));
      };
      ws.onclose = () => {
        clearTimeout(source.timeout);
        if (!cap.closed && source.retry < 5) source.timer = setTimeout(connect, Math.min(16000, 1000 * 2 ** source.retry++));
        else if (!cap.closed) report(cap, "ws_failed", `Mất kết nối ${name}; audio vẫn được lưu để hậu xử lý`);
      };
    }
    connect();
    source.heartbeat = setInterval(() => {
      if (source.ws?.readyState === 1 && source.protocol >= 2) source.ws.send(JSON.stringify({ type: "ping" }));
    }, 8000);
    proc.onaudioprocess = e => {
      if (cap.closed || cap.stopping) return;
      const pcm = pcm16(e.inputBuffer.getChannelData(0), cap.ctx.sampleRate);
      const start = cap.audioOrigin + e.playbackTime;
      if (!source.archive.length) source.archiveStart = start;
      source.archive.push(pcm); source.archiveSamples += pcm.length;
      if (source.archiveSamples >= RATE * 30) {
        // Drain now; retain only this immutable batch while the upload is pending.
        const batch = { ...source, archive: source.archive.splice(0), archiveStart: source.archiveStart, sequence: source.sequence++ };
        source.archiveSamples = 0;
        source.uploads = source.uploads.then(() => upload(cap, batch));
      }
      source.buffer.push({ pcm, start });
      if (source.buffer.length > 80) source.buffer.shift();
      if (source.ws?.readyState !== 1 || source.protocol < 2) return;
      if (source.connectionGeneration !== source.generation) {
        source.connectionGeneration = source.generation;
        source.connectionOffset = source.buffer[0].start;
      }
      for (const chunk of source.buffer.splice(0)) {
        if (source.protocol >= 2) source.ws.send(JSON.stringify({ type: "audio_clock", offset: chunk.start }));
        source.ws.send(chunk.pcm.buffer);
      }
    };
  }
  async function startCapture(msg) {
    if (captures.has(msg.tabId)) return;
    const cap = { ...msg, captureId: crypto.randomUUID(), epoch: msg.startedAt / 1000,
      spansTabId: msg.spansTabId || msg.tabId, sources: [], streams: [], finals: 0 };
    captures.set(msg.tabId, cap);
    try {
      const tab = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: msg.streamId } } });
      cap.streams.push(tab); cap.ctx = new AudioContext();
      cap.audioOrigin = Date.now() / 1000 - cap.epoch - cap.ctx.currentTime;
      if (!Number.isFinite(cap.audioOrigin)) throw new Error("Thiếu thời điểm bắt đầu phiên");
      startSource(cap, tab, "tab");
      // Auxiliary shared-media tabs must never capture a second copy of the microphone.
      if (!msg.spansTabId || msg.spansTabId === msg.tabId) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
          cap.streams.push(mic); startSource(cap, mic, "mic");
        } catch { report(cap, "mic_failed", "Chỉ thu tab; cấp quyền mic để thu giọng tại máy này"); }
      }
      await cap.ctx.resume();
    } catch (e) { report(cap, "capture_failed", String(e.message)); await stopCapture(msg.tabId); throw e; }
  }
  async function stopCapture(tabId) {
    const cap = captures.get(tabId); if (!cap) return { archiveFailed: await retryPending(tabId) };
    cap.stopping = true;
    await Promise.all(cap.sources.map(s => new Promise(resolve => {
      if (s.ws?.readyState !== 1 || s.protocol < 2) return resolve();
      const timeout = setTimeout(() => { report(cap, "flush_timeout", "ASR chưa chốt đoạn cuối; audio được giữ để hậu xử lý"); resolve(); }, 20000);
      s.onFlushed = () => { clearTimeout(timeout); resolve(); };
      s.ws.send(JSON.stringify({ type: "flush" }));
    })));
    cap.closed = true;
    for (const s of cap.sources) {
      clearTimeout(s.timer); clearTimeout(s.timeout); clearInterval(s.heartbeat);
      await s.processing; await s.uploads; await upload(cap, s);
      s.ws?.close(); s.proc.disconnect(); s.node.disconnect();
    }
    cap.streams.forEach(s => s.getTracks().forEach(t => t.stop()));
    if (cap.ctx && cap.ctx.state !== "closed") await cap.ctx.close();
    for (const record of cap.unpersisted || []) { try { await sendAudioRecord(record); cap.unpersisted = cap.unpersisted.filter(r => r.id !== record.id); } catch { /* keep in memory */ } }
    const pendingFailed = await retryPending(tabId) || !!cap.unpersisted?.length;
    if (!pendingFailed) captures.delete(tabId);
    return { archiveFailed: pendingFailed };
  }
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.type === "CN_AUDIO_START") { startCapture(msg).then(() => respond({ ok: true })).catch(e => respond({ error: String(e) })); return true; }
    if (msg?.type === "CN_AUDIO_STOP") { stopCapture(msg.tabId).then(respond); return true; }
  });
})();
