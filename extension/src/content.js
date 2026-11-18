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
  const CODE_VERSION = "0.5.0";

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
  let lastRosterKey = "";
  // Tên roster mới nhất — dùng để bóc "Tên nội dung" trong caption
  // (Meet mới không render dấu hai chấm).
  let lastRosterNames = [];
  let lastRosterParticipants = [];
  const attendanceObserver = Math.random().toString(36).slice(2);
  let lastActive = new Map();
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
      if (kind === "attendance") return { kind, observations: items };
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

  let selfName = "";

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
  let chatObs = null;

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

  }

  // Panel họp là SPA mở muộn → thử gắn lại mỗi 5s.
  attachPanels();
  setInterval(attachPanels, 5000);

  // Lưới an toàn cho caption: đọc thẳng text root hiện tại mỗi 5s, kể cả khi
  // observer trượt. Debounce gộp câu trong handleCaptionNode lo phần còn lại.
  // Quét block tin nhắn theo timestamp (neo ổn định hơn selector class của
  // Meet). Tin nhắn tồn tại trong DOM nên poll bắt được cả khi observer trượt.
  function handleChatBlock(block) {
    if (!sessionId) return;
    try { selfName = platform.selfParticipant?.()?.name || platform.selfName?.() || selfName; } catch { /* keep known identity */ }
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
      ...(() => {
        const matches = lastRosterParticipants.filter(p => p.name === parsed.sender && p.id != null);
        let self;
        try { self = platform.selfParticipant?.(); } catch {}
        const own = block.matches('.chmVPb') || !!block.querySelector('.chmVPb');
        const id = own && self?.id ? self.id : matches.length === 1 ? matches[0].id : null;
        return id != null ? {participantId:String(id)} : {};
      })(),
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

  // Attendance heartbeat every 5s; roster metadata only when changed.
  function pollRoster() {
    if (!running || !sessionId) return;
    let roster = [];
    let complete = false;
    try {
      const snapshot = platform.attendanceSnapshot?.();
      roster = snapshot?.participants || platform.scrapeRoster() || [];
      complete = snapshot?.complete === true;
    } catch (e) { /* DOM lạ */ }
    lastRosterParticipants = roster;
    const at = Date.now();
    queue("attendance", {id:`attendance_${attendanceObserver}_${at}`, at, participants:roster, complete});
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
    lastRosterKey = "";
    // Captions remain optional; never change the user's Meet caption setting.
    activeSpans.length = 0;
    lastActive.clear();
    pollRoster();
    pollChatBlocks();


  }

  // Heartbeat + self-check selector.
  setInterval(() => {
    if (!running) return;
    let rosterCount = 0;
    let activeSpeaker = "";
    try {
      rosterCount = (platform.scrapeRoster() || []).length;
    } catch (e) { /* bỏ qua */ }
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
      // The signed-in web account may differ from the local Meet account.
      // Only Meet DOM/caption evidence is allowed to name microphone audio.
      activateSession(msg.sessionId);
    }
    if (msg?.type === "CN_STOP") {
      pollRoster();
      running = false;
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
        diag.captionObserved = false;
        sendResponse({ ok: true, diag });
      } catch (e) {
        try {
          sendResponse({ ok: false, error: String((e && e.message) || e) });
        } catch (ignored) { /* kênh đóng */ }
      }
    }
  });

  window.addEventListener("beforeunload", () => {
    pollRoster();
    flush();
  });
})();
