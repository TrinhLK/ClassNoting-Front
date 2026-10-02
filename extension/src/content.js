/* eslint-disable */
/**
 * content.js — Chạy trong tab họp: scrape roster/chat/captions + active-speaker,
 * dedupe, gửi batch về background. Tự thích nghi khi panel mở muộn (SPA).
 */
(function () {
  "use strict";

  const shared = globalThis.ClassNotingShared;
  const platforms = globalThis.ClassNotingPlatforms;
  if (!shared || !platforms) return;

  const provider = shared.detectProvider(location.href);
  if (!provider) return;
  const platform = platforms[provider];
  if (!platform) return;

  let sessionId = null;
  let running = true;
  const seenChat = new Set();
  const seenCaption = new Set();
  let lastRosterKey = "";
  let lastActive = { name: "", ts: 0 };
  const activeSpans = [];
  let eventQueue = [];

  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
    } catch (e) { /* background chưa sẵn sàng */ }
  }

  function flush() {
    if (eventQueue.length === 0) return;
    const batch = eventQueue.splice(0, 100);
    // Nhóm theo kind để khớp API /api/extension/events.
    const byKind = {};
    for (const ev of batch) {
      (byKind[ev.kind] = byKind[ev.kind] || []).push(ev.payload);
    }
    const events = Object.entries(byKind).map(([kind, items]) => {
      if (kind === "participants") return { kind, participants: items[items.length - 1] };
      if (kind === "chat") return { kind, messages: items };
      return { kind, segments: items };
    });
    send({ type: "CN_EVENTS", events });
  }
  setInterval(flush, 2000);

  function queue(kind, payload) {
    eventQueue.push({ kind, payload });
    if (eventQueue.length >= 100) flush();
  }

  function chatKey(sender, text) {
    return sender + "\n" + text;
  }

  function handleChatNode(node) {
    let parsed = null;
    try {
      parsed = platform.parseChatNode(node);
    } catch (e) { /* DOM lạ */ }
    if (!parsed || !parsed.text) return;
    const key = chatKey(parsed.sender, parsed.text);
    if (seenChat.has(key)) return;
    seenChat.add(key);
    if (seenChat.size > 1000) {
      const first = seenChat.values().next().value;
      seenChat.delete(first);
    }
    queue("chat", {
      id: "chat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      sender: parsed.sender,
      text: parsed.text,
      timestamp: Date.now(),
    });
  }

  function handleCaptionNode(node) {
    let parsed = null;
    try {
      parsed = platform.parseCaptionNode(node);
    } catch (e) { /* DOM lạ */ }
    if (!parsed || !parsed.text) return;
    const key = parsed.name + "\n" + parsed.text;
    if (seenCaption.has(key)) return;
    seenCaption.add(key);
    if (seenCaption.size > 1000) {
      const first = seenCaption.values().next().value;
      seenCaption.delete(first);
    }
    const now = Date.now() / 1000;
    // Caption gửi dạng transcript phụ (uncertain=false khi có tên).
    queue("transcript", {
      id: "cap_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      speaker: parsed.name || "SPEAKER_00",
      text: (parsed.name ? "" : "") + parsed.text,
      start: now - 4,
      end: now,
      caption: true,
      uncertain: !parsed.name,
    });
  }

  function observeSubtree(root, onAdd) {
    if (!root) return null;
    // Quét sẵn nội dung hiện có.
    root.querySelectorAll("*").forEach((n) => {
      if (n.children.length === 0) onAdd(n);
    });
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.children.length === 0) onAdd(n);
          else n.querySelectorAll("*").forEach((c) => {
            if (c.children.length === 0) onAdd(c);
          });
        });
      }
    });
    obs.observe(root, { childList: true, subtree: true });
    return obs;
  }

  let chatObs = null;
  let captionObs = null;

  function attachPanels() {
    if (!running) return;
    try {
      if (!chatObs) {
        const root = platform.chatRoot();
        if (root) chatObs = observeSubtree(root, handleChatNode);
      }
    } catch (e) { /* thử lại vòng sau */ }
    try {
      if (!captionObs) {
        const root = platform.captionRoot();
        if (root) captionObs = observeSubtree(root, handleCaptionNode);
      }
    } catch (e) { /* thử lại vòng sau */ }
  }

  // Panel họp là SPA mở muộn → thử gắn lại mỗi 5s.
  attachPanels();
  setInterval(attachPanels, 5000);

  // Roster: quét mỗi 5s, chỉ gửi khi thay đổi.
  function pollRoster() {
    if (!running) return;
    let roster = [];
    try {
      roster = platform.scrapeRoster() || [];
    } catch (e) { /* DOM lạ */ }
    const key = JSON.stringify(roster.map((r) => r.name));
    if (key !== lastRosterKey) {
      lastRosterKey = key;
      queue("participants", roster);
    }
  }
  pollRoster();
  setInterval(pollRoster, 5000);

  // Active-speaker: lấy mẫu mỗi 500ms → span {name,start,end}, gửi kèm heartbeat.
  setInterval(() => {
    if (!running) return;
    let name = "";
    try {
      name = (platform.sampleActiveSpeaker() || "").trim();
    } catch (e) { /* bỏ qua */ }
    const now = Date.now() / 1000;
    if (name) {
      if (lastActive.name === name) {
        const span = activeSpans[activeSpans.length - 1];
        if (span) span.end = now;
      } else {
        activeSpans.push({ name, start: now - 0.5, end: now });
        if (activeSpans.length > 200) activeSpans.splice(0, activeSpans.length - 200);
        lastActive = { name, ts: now };
      }
    }
    // Gửi spans mới về background để fusion với ASR.
    send({ type: "CN_SPANS", spans: activeSpans.slice(-50) });
  }, 500);

  // Heartbeat + self-check selector.
  setInterval(() => {
    if (!running) return;
    let rosterCount = 0;
    try {
      rosterCount = (platform.scrapeRoster() || []).length;
    } catch (e) { /* bỏ qua */ }
    send({
      type: "CN_HEARTBEAT",
      provider,
      url: location.href,
      title: document.title,
      rosterCount,
      chatPanel: !!platform.chatRoot(),
      captionPanel: !!platform.captionRoot(),
    });
  }, 15000);

  // Báo danh khi load.
  send({
    type: "CN_MEETING_STATE",
    provider,
    url: location.href,
    title: document.title,
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "CN_SESSION") sessionId = msg.sessionId;
    if (msg?.type === "CN_STOP") {
      running = false;
      flush();
    }
    // Chẩn đoán DOM theo yêu cầu popup (đồng bộ — không cần return true).
    if (msg?.type === "CN_DIAG") {
      try {
        const diag = platform.describe
          ? platform.describe()
          : { url: location.href, title: document.title, checks: [] };
        diag.sessionId = sessionId;
        diag.queuePending = eventQueue.length;
        sendResponse({ ok: true, diag });
      } catch (e) {
        try {
          sendResponse({ ok: false, error: String((e && e.message) || e) });
        } catch (ignored) { /* kênh đóng */ }
      }
    }
  });

  window.addEventListener("beforeunload", () => {
    flush();
  });
})();
