/* eslint-disable */
/**
 * background.js — Service worker (MV3 module): phát hiện tab họp, quản lý
 * session, gom batch events, điều phối offscreen audio, tự end khi rời phòng.
 */
const DEFAULT_APP_ORIGIN = "https://smart-noting.vercel.app";
const FLUSH_MS = 2000;
const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;

// tabId -> { sessionId, provider, url, lastSeen, queue: [], spans: [], captions: [] }
const tabs = new Map();
const notifiedNoAuth = new Set();

async function getSettings() {
  const s = await chrome.storage.sync.get(["appOrigin", "autoStart", "consent"]);
  return {
    appOrigin: (s.appOrigin || DEFAULT_APP_ORIGIN).replace(/\/$/, ""),
    autoStart: s.autoStart !== false,
    consent: s.consent === true,
  };
}

async function getAuth() {
  const s = await chrome.storage.session.get(["idToken", "uid", "email", "displayName"]);
  return s.idToken ? s : null;
}

async function apiFetch(path, body) {
  const { appOrigin } = await getSettings();
  const auth = await getAuth();
  if (!auth) {
    const err = new Error("NO_AUTH");
    err.code = "NO_AUTH";
    throw err;
  }
  const res = await fetch(`${appOrigin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.idToken}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    await chrome.storage.session.clear();
    const err = new Error("UNAUTHORIZED");
    err.code = "UNAUTHORIZED";
    throw err;
  }
  return res;
}

function notifyLoginRequired() {
  chrome.notifications.create("cn-login", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "ClassNoting cần đăng nhập",
    message: "Mở web app ClassNoting và đăng nhập để extension tự ghi chú cuộc họp.",
  }).catch(() => {});
}

function setBadge(tabId, text, color) {
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
  if (color) chrome.action.setBadgeBackgroundColor({ color, tabId }).catch(() => {});
}

// ---- Token relay từ web app (ExtensionBridge) ----
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "CLASSNOTING_AUTH" && msg.idToken && msg.uid) {
    chrome.storage.session
      .set({ idToken: msg.idToken, uid: msg.uid, email: msg.email, displayName: msg.displayName })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

// ---- Flush batch events ----
async function flushTab(tabId) {
  const t = tabs.get(tabId);
  if (!t || !t.sessionId || t.queue.length === 0) return;
  const batch = t.queue.splice(0, 100);
  const byKind = {};
  for (const ev of batch) (byKind[ev.kind] = byKind[ev.kind] || []).push(ev.payload);
  const events = Object.entries(byKind).map(([kind, items]) => {
    if (kind === "participants") return { kind, participants: items[items.length - 1] };
    if (kind === "chat") return { kind, messages: items };
    return { kind, segments: items };
  });
  try {
    await apiFetch("/api/extension/events", { sessionId: t.sessionId, events });
  } catch (e) {
    if (e.code === "NO_AUTH" || e.code === "UNAUTHORIZED") {
      if (!notifiedNoAuth.has(t.sessionId)) {
        notifiedNoAuth.add(t.sessionId);
        notifyLoginRequired();
      }
      // Giữ lại batch để thử lại sau khi có token.
      t.queue.unshift(...batch.flatMap((ev) =>
        ev.kind === "participants" ? [ev] : ev.payload?.map?.((p) => ({ kind: ev.kind, payload: p })) || [ev]
      ).slice(0, 100));
    }
  }
}
setInterval(() => {
  tabs.forEach((_, tabId) => flushTab(tabId));
}, FLUSH_MS);

// ---- Đảm bảo session khi phát hiện phòng họp ----
// opts.manual=true (nút "Bắt đầu tab này" trong popup): bỏ qua cờ autoStart,
// nhưng vẫn yêu cầu consent một lần + đăng nhập.
// tryEnsureSession trả { sessionId } hoặc { error, status } để popup chẩn đoán
// chính xác (thay vì một message chung chung).
async function tryEnsureSession(tabId, info, opts) {
  const { autoStart, consent } = await getSettings();
  if (!consent) return { error: "no_consent" };
  if (!opts?.manual && !autoStart) return { error: "auto_off" };
  const existing = tabs.get(tabId);
  if (existing?.sessionId) {
    existing.lastSeen = Date.now();
    return { sessionId: existing.sessionId };
  }
  const auth = await getAuth();
  if (!auth) {
    notifyLoginRequired();
    return { error: "no_auth" };
  }
  try {
    const res = await apiFetch("/api/extension/session", {
      meetingUrl: info.url,
      title: info.title,
    });
    let data = {};
    try {
      data = await res.json();
    } catch (e) { /* body lỗi — xử lý theo status */ }
    if (!res.ok || !data.sessionId) {
      if (res.status === 400) return { error: "bad_link", status: res.status };
      if (res.status === 429) return { error: "rate_limited", status: res.status };
      if (res.status >= 500) return { error: "server_error", status: res.status };
      return { error: "api_failed", status: res.status };
    }
    tabs.set(tabId, {
      sessionId: data.sessionId,
      provider: data.provider || info.provider,
      url: info.url,
      lastSeen: Date.now(),
      queue: [],
      spans: [],
      captions: [],
    });
    setBadge(tabId, "REC", "#dc2626");
    chrome.tabs.sendMessage(tabId, { type: "CN_SESSION", sessionId: data.sessionId }).catch(() => {});
    startAudioCapture(tabId, data.sessionId, info.provider).catch(() => {
      // Thu audio thất bại (quyền/tab chưa audible) → vẫn giữ roster/chat/captions,
      // báo user bấm popup để thử lại (có user gesture).
      setBadge(tabId, "!", "#d97706");
    });
    return { sessionId: data.sessionId };
  } catch (e) {
    if (e.code === "NO_AUTH" || e.code === "UNAUTHORIZED") {
      notifyLoginRequired();
      return { error: "token_expired" };
    }
    // TypeError: Failed to fetch — mạng đứt hoặc thiếu host_permissions
    // (manifest) nên request bị chặn ngay từ extension.
    return { error: "network" };
  }
}

async function ensureSession(tabId, info, opts) {
  const r = await tryEnsureSession(tabId, info, opts);
  return r.sessionId || null;
}

// ---- Audio tab → offscreen document ----
let offscreenReady = null;
async function ensureOffscreen() {
  if (offscreenReady) return offscreenReady;
  offscreenReady = (async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: "src/offscreen.html",
        reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
        justification: "Thu audio tab họp để live-transcript qua classnoting-realtime-server.",
      });
    }
  })().catch((e) => {
    offscreenReady = null;
    throw e;
  });
  return offscreenReady;
}

async function startAudioCapture(tabId, sessionId, provider) {
  await ensureOffscreen();
  const { appOrigin } = await getSettings();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const auth = await getAuth();
  chrome.runtime.sendMessage({
    type: "CN_AUDIO_START",
    tabId,
    sessionId,
    provider,
    streamId,
    wsBase: "wss://asr-live.noting.io.vn",
    appOrigin,
    idToken: auth?.idToken,
  });
}

async function stopAudioCapture(tabId) {
  try {
    chrome.runtime.sendMessage({ type: "CN_AUDIO_STOP", tabId });
  } catch (e) { /* offscreen chưa chạy */ }
}

// ---- Kết thúc phiên ----
async function endSession(tabId, reason) {
  const t = tabs.get(tabId);
  if (!t) return;
  tabs.delete(tabId);
  try {
    chrome.tabs.sendMessage(tabId, { type: "CN_STOP" }).catch(() => {});
  } catch (e) { /* tab đã đóng */ }
  await stopAudioCapture(tabId);
  setBadge(tabId, "", undefined);
  await flushTab(tabId).catch(() => {});
  if (t.sessionId) {
    try {
      const res = await apiFetch("/api/extension/end", { sessionId: t.sessionId });
      const data = await res.json().catch(() => ({}));
      if (data.meetingId) {
        const { appOrigin } = await getSettings();
        chrome.notifications.create(`cn-done-${t.sessionId}`, {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "Đã kết xuất biên bản",
          message: `Mở ${appOrigin}/meeting/${data.meetingId} để xem. (${reason})`,
        }).catch(() => {});
      }
    } catch (e) { /* mạng lỗi — phiên vẫn ended ở lần heartbeat sau */ }
  }
}

// ---- Nhận message từ content/offscreen/popup ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? msg.tabId;
  if (msg?.type === "CN_MEETING_STATE" && sender.tab?.id) {
    ensureSession(sender.tab.id, msg).then((sid) => sendResponse({ sessionId: sid }));
    return true;
  }
  if (msg?.type === "CN_EVENTS" && tabId && tabs.has(tabId)) {
    const t = tabs.get(tabId);
    t.lastSeen = Date.now();
    for (const ev of msg.events || []) {
      if (ev.kind === "participants") t.queue.push({ kind: "participants", payload: ev.participants });
      else if (ev.kind === "chat") for (const m of ev.messages || []) t.queue.push({ kind: "chat", payload: m });
      else if (ev.kind === "transcript") for (const s of ev.segments || []) {
        t.queue.push({ kind: "transcript", payload: s });
        if (s.caption === true) {
          t.captions.push({ name: s.speaker, text: s.text, start: s.start, end: s.end });
          if (t.captions.length > 200) t.captions.splice(0, t.captions.length - 200);
        }
      }
    }
    if (t.queue.length >= 100) flushTab(tabId);
    sendResponse({ ok: true });
    return;
  }
  if (msg?.type === "CN_SPANS" && tabId && tabs.has(tabId)) {
    tabs.get(tabId).spans = (msg.spans || []).slice(-200);
    return;
  }
  if (msg?.type === "CN_HEARTBEAT" && tabId && tabs.has(tabId)) {
    tabs.get(tabId).lastSeen = Date.now();
    return;
  }
  if (msg?.type === "CN_GET_SPANS" && msg.tabId && tabs.has(msg.tabId)) {
    const t = tabs.get(msg.tabId);
    sendResponse({ spans: t.spans.slice(-50), captions: t.captions.slice(-50) });
    return;
  }
  if (msg?.type === "CN_ASR_FINAL" && msg.tabId && tabs.has(msg.tabId)) {
    // Segment ASR đã fusion tên ở offscreen → đẩy vào queue transcript.
    const t = tabs.get(msg.tabId);
    t.lastSeen = Date.now();
    t.queue.push({
      kind: "transcript",
      payload: {
        id: msg.id,
        speaker: msg.speaker,
        text: msg.text,
        start: msg.start,
        end: msg.end,
        uncertain: msg.uncertain || undefined,
      },
    });
    if (msg.splitAt) {
      // Báo split để lần sau offscreen tự tách — ở đây chỉ ghi nhận.
    }
    return;
  }
  if (msg?.type === "CN_MANUAL_START" && msg.tabId) {
    (async () => {
      try {
        const tab = await chrome.tabs.get(msg.tabId);
        const r = await tryEnsureSession(
          msg.tabId,
          { provider: msg.provider, url: tab.url, title: tab.title },
          { manual: true }
        );
        if (r.sessionId) sendResponse({ ok: true, sessionId: r.sessionId });
        else sendResponse({ ok: false, reason: r.error || "api_failed", status: r.status });
      } catch (e) {
        sendResponse({ ok: false, reason: "error" });
      }
    })();
    return true;
  }
  if (msg?.type === "CN_MANUAL_END" && msg.tabId) {
    endSession(msg.tabId, "bấm tay").then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "CN_GET_STATE") {
    Promise.all([getSettings(), getAuth()]).then(([settings, auth]) => {
      sendResponse({
        consent: settings.consent,
        autoStart: settings.autoStart,
        appOrigin: settings.appOrigin,
        authed: !!auth,
        email: auth?.email,
        liveTabs: [...tabs.entries()].map(([id, t]) => ({ tabId: id, sessionId: t.sessionId, provider: t.provider })),
      });
    });
    return true;
  }
  if (msg?.type === "CN_SET_SETTINGS") {
    const patch = {};
    if (typeof msg.appOrigin === "string" && msg.appOrigin.trim() !== "") {
      patch.appOrigin = msg.appOrigin.trim().replace(/\/$/, "");
    }
    if (typeof msg.autoStart === "boolean") patch.autoStart = msg.autoStart;
    if (typeof msg.consent === "boolean") patch.consent = msg.consent;
    chrome.storage.sync.set(patch).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "CN_PING") {
    sendResponse({ ok: true, pong: true, time: Date.now() });
    return;
  }
  // Chẩn đoán: trả lời mọi message lạ để console không treo pending
  // (trước đây message không khớp type nào thì promise treo vĩnh viễn).
  try {
    sendResponse({ ok: false, error: "unknown_message", type: msg?.type });
  } catch (e) { /* sender đã đóng kênh */ }
});

// Rời phòng: tab đóng → end; heartbeat quá hạn → end.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabs.has(tabId)) endSession(tabId, "đóng tab");
});

chrome.alarms.create("cn-sweep", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "cn-sweep") return;
  const now = Date.now();
  tabs.forEach((t, tabId) => {
    if (now - t.lastSeen > HEARTBEAT_TIMEOUT_MS) endSession(tabId, "mất tín hiệu");
  });
});
