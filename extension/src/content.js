/* eslint-disable */
/**
 * content.js — Chạy trong tab họp: scrape roster/chat/captions + active-speaker,
 * dedupe, gửi batch về background. Tự thích nghi khi panel mở muộn (SPA).
 */
(function () {
  "use strict";

  // Declarative injection and the onUpdated recovery can race on a fresh tab.
  // Only one collector may own observers/timers in this isolated world.
  if (globalThis.__classNotingCollectorLoaded) return;

  // Đồng bộ với manifest.json — hiện trong ô chẩn đoán để biết tab đang
  // chạy content bản nào (tránh cãi nhau chuyện reload chưa).
  const CODE_VERSION = "0.4.1";

  const shared = globalThis.ClassNotingShared;
  const platforms = globalThis.ClassNotingPlatforms;
  if (!shared || !platforms) return;

  const provider = shared.detectProvider(location.href);
  if (!provider) return;
  const platform = platforms[provider];
  if (!platform) return;
  // /new can become a room URL without a document reload. Only claim the
  // singleton after initialization is possible, so recovery can try again.
  globalThis.__classNotingCollectorLoaded = true;

  let sessionId = null;
  let running = true;
  const seenChat = new Set();
  const seenCaption = new Set();
  let lastRosterKey = "";
  // Tên roster mới nhất — dùng để bóc "Tên nội dung" trong caption
  // (Meet mới không render dấu hai chấm).
  let lastRosterNames = [];
  let lastActive = { name: "", ts: 0 };
  const activeSpans = [];
  let eventQueue = [];

  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        void chrome.runtime.lastError;
        // Dự phòng: background trả sessionId qua response khi tab gắn lại
        // session cũ (F5) mà message CN_SESSION không tới kịp.
        if (msg && msg.type === "CN_MEETING_STATE" && res && res.sessionId && !sessionId) {
          activateSession(res.sessionId);
        }
      });
    } catch (e) { /* background chưa sẵn sàng */ }
  }

  function flush() {
    if (!sessionId || eventQueue.length === 0) return;
    const batch = eventQueue.splice(0, 100);
    // Nhóm theo kind để khớp API /api/extension/events.
    const byKind = {};
    for (const ev of batch) {
      (byKind[ev.kind] = byKind[ev.kind] || []).push(ev.payload);
    }
    const events = Object.entries(byKind).map(([kind, items]) => {
      if (kind === "participants") return { kind, participants: items[items.length - 1] };
      if (kind === "chat") return { kind, messages: items };
      // Caption CHỈ dùng fusion tên người nói cho ASR (background giữ trong
      // t.captions, không đẩy lên API) — không bao giờ thành segment transcript.
      if (kind === "caption") return { kind, captions: items };
      return { kind, segments: items };
    });
    // Gửi kèm sessionId để background nhận diện phiên ngay cả khi map RAM
    // mất entry sau service worker restart (trước đây rớt im lặng ở tabs.has).
    send({ type: "CN_EVENTS", events, sessionId: sessionId || undefined });
  }
  setInterval(flush, 2000);

  function queue(kind, payload) {
    if (!sessionId) return;
    eventQueue.push({ kind, payload });
    if (eventQueue.length >= 100) flush();
  }

  function chatKey(sender, text) {
    return sender + "\n" + text;
  }

  let chatScanTimer = null;
  function handleChatNode() {
    // Coalesce DOM mutations and use the same complete-message parser as polling.
    // Leaf/header parsing previously emitted a second copy with a different sender.
    if (chatScanTimer) clearTimeout(chatScanTimer);
    chatScanTimer = setTimeout(pollChatBlocks, 150);
  }

  // Caption Meet chảy từng ký tự (characterData) — debounce: chỉ gửi khi câu
  // đứng yên CAPTION_SETTLE_MS, nếu không mỗi ký tự thành 1 segment (flood).
  const CAPTION_SETTLE_MS = 1500;
  let pendingCaption = null;
  let lastCaptionSnapshot = "";
  let lastCaptionContextAt = 0;
  const captionClocks = new WeakMap();

  function publishCaptionContext(p, force) {
    if (!p || !sessionId || (!force && Date.now() - lastCaptionContextAt < 250)) return;
    lastCaptionContextAt = Date.now();
    // Identity metadata must reach audio fusion while speech is still growing,
    // rather than waiting indefinitely for a pause in continuous speech.
    send({ type: "CN_EVENTS", sessionId, events: [{ kind: "caption", captions: [{
      id: p.id, speaker: p.name || "", text: p.text, isSelf: p.isSelf === true,
      start: p.firstSeen, end: p.lastSeen,
    }] }] });
  }

  function flushPendingCaption() {
    const p = pendingCaption;
    pendingCaption = null;
    if (!p) return;
    const key = p.name + "\n" + p.text;
    if (seenCaption.has(key)) return;
    seenCaption.add(key);
    if (seenCaption.size > 1000) {
      const first = seenCaption.values().next().value;
      seenCaption.delete(first);
    }
    const now = Date.now() / 1000;
    // Caption chỉ phục vụ fusion tên cho ASR (kind riêng, background không
    // đẩy lên API) — transcript lấy từ audio qua model STT.
    publishCaptionContext(p, true);
  }

  // Tên tài khoản thật (background gửi kèm CN_SESSION) để map "You"/"Bạn"
  // mà Meet dùng gọi chính mình.
  let selfName = "";
  function normalizeSelfName(name) {
    const n = String(name || "").trim();
    if (!n) return "";
    try { selfName = platform.selfName?.() || selfName; } catch { /* keep known identity */ }
    if (/^(you|bạn)$/i.test(n) && selfName) return selfName;
    return n;
  }

  // Thân câu để so gộp (logic nằm ở platform.captionMergeKey để test được).
  function captionBody(text) {
    return platform.captionMergeKey(String(text || ""), lastRosterNames);
  }

  function handleCaptionNode(node) {
    if (!sessionId || !running) return;
    let parsed = null;
    try {
      parsed = platform.parseCaptionNode(node, lastRosterNames);
    } catch (e) { /* DOM lạ */ }
    if (!parsed || !parsed.text) return;
    const snapshot = parsed.name + "\n" + parsed.text;
    if (snapshot === lastCaptionSnapshot) return;
    lastCaptionSnapshot = snapshot;
    const speaker = normalizeSelfName(parsed.name);
    const isSelf = /^(you|bạn)$/i.test(parsed.name || "");
    const row = node.closest?.('.nMcdL') || [...(node.querySelectorAll?.('.nMcdL') || [])].at(-1) || node;
    if (!captionClocks.has(row)) captionClocks.set(row, Date.now() / 1000);
    const body = captionBody(parsed.text);
    if (!body) return;
    if (
      pendingCaption && (!speaker || !pendingCaption.name || speaker === pendingCaption.name) &&
      platform.shouldMergeCaption({ body: captionBody(pendingCaption.text) }, { body })
    ) {
      clearTimeout(pendingCaption.timer);
      // Giữ bản dài hơn (câu đang lớn dần), tên non-empty mới nhất.
      if (body.length >= captionBody(pendingCaption.text).length) {
        pendingCaption.text = body;
      }
      if (speaker) pendingCaption.name = speaker;
      pendingCaption.isSelf = isSelf;
      pendingCaption.lastSeen = Date.now() / 1000;
    } else {
      flushPendingCaption();
      pendingCaption = {
        id: "cap_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        name: speaker,
        isSelf,
        text: body,
        // Google revises earlier words as it recognizes a sentence. Those
        // revisions must not reset the speaker interval to its last word.
        firstSeen: captionClocks.get(row),
        lastSeen: Date.now() / 1000,
        timer: setTimeout(flushPendingCaption, CAPTION_SETTLE_MS),
      };
      publishCaptionContext(pendingCaption, true);
      return;
    }
    pendingCaption.timer = setTimeout(flushPendingCaption, CAPTION_SETTLE_MS);
    publishCaptionContext(pendingCaption, false);
  }

  function observeSubtree(root, onAdd) {
    if (!root) return null;
    // Handler biết root để parse cấp block (chat): bóc đúng sender/body.
    const handle = (n) => onAdd(n, root);
    // Quét sẵn nội dung hiện có.
    root.querySelectorAll("*").forEach((n) => {
      if (n.children.length === 0) handle(n);
    });
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // Meet sửa text node tại chỗ khi caption chảy (không thêm node mới) —
        // bắt buộc nghe characterData, nếu không transcript mãi rỗng.
        if (m.type === "characterData") {
          const el = m.target && m.target.nodeType === 3 ? m.target.parentElement : m.target;
          if (el && el.nodeType === 1) handle(el);
          continue;
        }
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 3) {
            if (n.parentElement) handle(n.parentElement);
            return;
          }
          if (n.nodeType !== 1) return;
          if (n.children.length === 0) handle(n);
          else n.querySelectorAll("*").forEach((c) => {
            if (c.children.length === 0) handle(c);
          });
        });
      }
    });
    obs.observe(root, { childList: true, characterData: true, subtree: true });
    return obs;
  }

  // Meet SPA render lại container (node cũ detached) → observer treo mà không
  // bao giờ bắn nữa (đã thấy thực tế với caption). Mỗi vòng kiểm tra root đang
  // watch còn sống và đúng root hiện tại không, khác thì gắn lại.
  let chatWatched = null;
  let captionWatched = null;
  let chatObs = null;
  let captionObs = null;

  function watchedAlive(obs, watched) {
    if (!obs || !watched) return false;
    try {
      return watched.isConnected;
    } catch (e) {
      return false;
    }
  }

  function attachPanels() {
    if (!running) return;
    try {
      const root = platform.chatRoot();
      if (root && (root !== chatWatched || !watchedAlive(chatObs, chatWatched))) {
        if (chatObs) { try { chatObs.disconnect(); } catch (e) { /* bỏ qua */ } }
        chatObs = observeSubtree(root, handleChatNode);
        chatWatched = root;
      } else if (!root) {
        chatWatched = null;
      }
    } catch (e) { /* thử lại vòng sau */ }
    try {
      const root = platform.captionRoot();
      if (root && (root !== captionWatched || !watchedAlive(captionObs, captionWatched))) {
        if (captionObs) { try { captionObs.disconnect(); } catch (e) { /* bỏ qua */ } }
        captionObs = observeSubtree(root, handleCaptionNode);
        captionWatched = root;
      } else if (!root) {
        captionWatched = null;
      }
    } catch (e) { /* thử lại vòng sau */ }
  }

  // Panel họp là SPA mở muộn → thử gắn lại mỗi 5s.
  attachPanels();
  setInterval(attachPanels, 5000);

  // Lưới an toàn cho caption: đọc thẳng text root hiện tại mỗi 5s, kể cả khi
  // observer trượt. Debounce gộp câu trong handleCaptionNode lo phần còn lại.
  function pollCaption() {
    if (!running) return;
    try {
      const root = platform.captionRoot();
      if (root) handleCaptionNode(root);
    } catch (e) { /* DOM lạ */ }
  }
  setInterval(pollCaption, 5000);

  // Quét block tin nhắn theo timestamp (neo ổn định hơn selector class của
  // Meet). Tin nhắn tồn tại trong DOM nên poll bắt được cả khi observer trượt.
  function handleChatBlock(block) {
    if (!sessionId) return;
    try { selfName = platform.selfName?.() || selfName; } catch { /* keep known identity */ }
    let parsed = null;
    try {
      parsed = platform.parseChatBlock(block, lastRosterNames, selfName || "Bạn");
    } catch (e) { /* DOM lạ */ }
    if (!parsed || !parsed.text) return;
    const messageId = block.getAttribute("data-message-id");
    const key = messageId ? "message:" + messageId : chatKey(parsed.sender, parsed.text);
    if (seenChat.has(key)) return;
    seenChat.add(key);
    if (seenChat.size > 1000) {
      const first = seenChat.values().next().value;
      seenChat.delete(first);
    }
    queue("chat", {
      id: messageId ? "meet_" + messageId : "chat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      sender: parsed.sender,
      text: parsed.text,
      timestamp: Date.now(),
    });
  }

  function pollChatBlocks() {
    if (!running) return;
    try {
      const root = platform.chatRoot();
      if (!root || !platform.findChatBlocks) return;
      const blocks = platform.findChatBlocks(root);
      for (const b of blocks) handleChatBlock(b);
    } catch (e) { /* DOM lạ */ }
  }
  setInterval(pollChatBlocks, 3000);

  // Roster: quét mỗi 5s, chỉ gửi khi thay đổi.
  function pollRoster() {
    if (!running || !sessionId) return;
    let roster = [];
    try {
      roster = platform.scrapeRoster() || [];
    } catch (e) { /* DOM lạ */ }
    lastRosterNames = roster.map((r) => r.name).filter(Boolean);
    const key = JSON.stringify(roster.map((r) => [r.name, r.id || null]));
    if (key !== lastRosterKey) {
      lastRosterKey = key;
      queue("participants", roster);
    }
  }
  pollRoster();
  setInterval(pollRoster, 5000);

  function activateSession(id) {
    if (!id || (sessionId === id && running)) return;
    sessionId = id;
    running = true;
    seenChat.clear();
    seenCaption.clear();
    lastCaptionSnapshot = "";
    lastRosterKey = "";
    pollRoster();
    pollChatBlocks();
    pollCaption();
    lastMicMuted = undefined;
    reportMicState();
  }

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
    if (!name) lastActive = { name: "", ts: now };
    // Gửi spans mới về background để fusion với ASR.
    send({ type: "CN_SPANS", spans: activeSpans.slice(-50), sessionId: sessionId || undefined });
  }, 500);

  // Mic vật lý chỉ được extension lấy khi Meet xác nhận mic đang bật.
  // Nếu nhãn nút chưa đọc được thì fail-closed: không cấp mic riêng cho extension.
  let lastMicMuted;
  function reportMicState() {
    let muted = null;
    try { muted = platform.microphoneMuted(); } catch (e) { /* giữ trạng thái an toàn */ }
    if (muted === lastMicMuted) return;
    lastMicMuted = muted;
    send({ type: "CN_MIC_STATE", muted, sessionId: sessionId || undefined });
  }
  reportMicState();
  setInterval(reportMicState, 250);

  // Heartbeat + self-check selector.
  setInterval(() => {
    if (!running) return;
    let rosterCount = 0;
    let activeSpeaker = "";
    try {
      rosterCount = (platform.scrapeRoster() || []).length;
    } catch (e) { /* bỏ qua */ }
    try { activeSpeaker = (platform.sampleActiveSpeaker() || "").trim(); } catch (e) { /* bỏ qua */ }
    send({
      type: "CN_HEARTBEAT",
      provider,
      url: location.href,
      title: document.title,
      rosterCount,
      activeSpeaker,
      chatPanel: !!platform.chatRoot(),
      captionPanel: !!platform.captionRoot(),
      sessionId: sessionId || undefined,
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
    if (msg?.type === "CN_GET_MIC_STATE") {
      let muted = null;
      try { muted = platform.microphoneMuted(); } catch (e) { /* unknown: mic stays disabled */ }
      sendResponse({ muted });
      return;
    }
    if (msg?.type === "CN_SESSION") {
      if (msg.ownerDisplayName) selfName = String(msg.ownerDisplayName);
      activateSession(msg.sessionId);
    }
    if (msg?.type === "CN_STOP") {
      running = false;
      flushPendingCaption();
      flush();
    }
    // Chẩn đoán DOM theo yêu cầu popup (đồng bộ — không cần return true).
    if (msg?.type === "CN_DIAG") {
      try {
        const diag = platform.describe
          ? platform.describe()
          : { url: location.href, title: document.title, checks: [] };
        diag.codeVersion = CODE_VERSION;
        diag.sessionId = sessionId;
        diag.queuePending = eventQueue.length;
        diag.chatObserved = watchedAlive(chatObs, chatWatched);
        diag.captionObserved = watchedAlive(captionObs, captionWatched);
        sendResponse({ ok: true, diag });
      } catch (e) {
        try {
          sendResponse({ ok: false, error: String((e && e.message) || e) });
        } catch (ignored) { /* kênh đóng */ }
      }
    }
  });

  window.addEventListener("beforeunload", () => {
    flushPendingCaption();
    flush();
  });
})();
