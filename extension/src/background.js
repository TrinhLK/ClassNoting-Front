/* eslint-disable */
/**
 * background.js — Service worker (MV3 module): phát hiện tab họp, quản lý
 * session, gom batch events, điều phối offscreen audio, tự end khi rời phòng.
 */
// Đổi theo manifest.json mỗi build — popup/diag hiện số này để biết chắc
// cả 3 mảnh (popup/background/content) có đồng bộ không.
const CODE_VERSION = "0.2.0";
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

async function apiFetch(path, body, method) {
  const { appOrigin } = await getSettings();
  const auth = await getAuth();
  if (!auth) {
    const err = new Error("NO_AUTH");
    err.code = "NO_AUTH";
    throw err;
  }
  const m = method || "POST";
  const res = await fetch(`${appOrigin}${path}`, {
    method: m,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.idToken}`,
    },
    ...(m === "GET" ? {} : { body: JSON.stringify(body) }),
  });
  if (res.status === 401) {
    await chrome.storage.session.clear();
    const err = new Error("UNAUTHORIZED");
    err.code = "UNAUTHORIZED";
    throw err;
  }
  return res;
}

// Kết thúc 1 session theo id (không cần tab — dọn được cả phiên mồ côi).
// Trả { meetingId, empty, counts } hoặc { error }.
async function endSessionById(sessionId, reason) {
  for (const [tabId, t] of tabs.entries()) {
    if (t.sessionId === sessionId) {
      tabs.delete(tabId);
      try {
        chrome.tabs.sendMessage(tabId, { type: "CN_STOP" }).catch(() => {});
      } catch (e) { /* tab đã đóng */ }
      await stopAudioCapture(tabId);
      setBadge(tabId, "", undefined);
    }
  }
  persistTabs();
  try {
    const res = await apiFetch("/api/extension/end", { sessionId });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return data;
    return { error: "api_failed", status: res.status };
  } catch (e) {
    if (e.code === "NO_AUTH" || e.code === "UNAUTHORIZED") return { error: "token_expired" };
    return { error: "network" };
  }
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
    const res = await apiFetch("/api/extension/events", { sessionId: t.sessionId, events });
    if (!res.ok) {
      // Lỗi HTTP không-phải-401 (409 ended, 429, 5xx): ghi nhận để popup hiện,
      // batch coi như đã xử lý phía server (409) hoặc sẽ gửi lại vòng sau.
      t.lastFlush = { at: Date.now(), status: `http_${res.status}`, count: batch.length };
      return;
    }
    t.lastFlush = { at: Date.now(), status: "ok", count: batch.length };
  } catch (e) {
    if (e.code === "NO_AUTH" || e.code === "UNAUTHORIZED") {
      t.lastFlush = { at: Date.now(), status: "unauthorized", count: batch.length };
      t.authFailCount = (t.authFailCount || 0) + 1;
      if (!notifiedNoAuth.has(t.sessionId)) {
        notifiedNoAuth.add(t.sessionId);
        notifyLoginRequired();
      }
      // Giữ lại batch để thử lại sau khi có token.
      t.queue.unshift(...batch.flatMap((ev) =>
        ev.kind === "participants" ? [ev] : ev.payload?.map?.((p) => ({ kind: ev.kind, payload: p })) || [ev]
      ).slice(0, 100));
    } else {
      // Mạng đứt / CORS / server sập: batch mất theo vòng flush này nhưng
      // content vẫn giữ polling (roster) nên dữ liệu mới tiếp tục sinh.
      t.lastFlush = { at: Date.now(), status: "network", count: batch.length };
    }
  }
}
setInterval(() => {
  tabs.forEach((_, tabId) => flushTab(tabId));
}, FLUSH_MS);

// Gửi sessionId (+ tên hiển thị chủ phiên để map "You"/"Bạn" trong caption)
// xuống tab Meet. Fire-and-forget có bắt lỗi để khỏi tràn trang Errors.
async function pushSession(tabId, sessionId) {
  try {
    const auth = await getAuth();
    await chrome.tabs.sendMessage(tabId, {
      type: "CN_SESSION",
      sessionId,
      ownerDisplayName: auth?.displayName || auth?.email || "",
    });
  } catch (e) { /* tab đóng hoặc chưa gắn content script */ }
}

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
    // BẮT BUỘC gửi CN_SESSION (không chỉ trả sendResponse — content không đọc
    // response của CN_MEETING_STATE). Thiếu dòng này, tab F5 lại là mồ côi
    // session vĩnh viễn dù session live vẫn tồn tại (đã thấy thực tế).
    pushSession(tabId, existing.sessionId);
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
      emptyStreak: 0,
    });
    persistTabs();
    setBadge(tabId, "REC", "#dc2626");
    pushSession(tabId, data.sessionId);
    startAudioCapture(tabId, data.sessionId, info.provider).catch(() => {
      // Thu audio thất bại (quyền/tab chưa audible) → vẫn giữ roster/chat/captions,
      // báo user bấm popup để thử lại (có user gesture).
      setBadge(tabId, "!", "#d97706");
    });
    return { sessionId: data.sessionId, reused: !!data.reused };
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

function setAudioState(tabId, audioState) {
  const t = tabs.get(tabId);
  if (!t) return;
  t.audioState = Object.assign({ at: Date.now() }, audioState);
}

async function startAudioCapture(tabId, sessionId, provider) {
  try {
    await ensureOffscreen();
  } catch (e) {
    setAudioState(tabId, { state: "offscreen_failed", detail: String((e && e.message) || e) });
    throw e;
  }
  const { appOrigin } = await getSettings();
  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (e) {
    // Hay gặp: tab chưa phát tiếng / thiếu gesture — hiện rõ ra popup.
    setAudioState(tabId, { state: "capture_failed", detail: String((e && e.message) || e) });
    throw e;
  }
  const auth = await getAuth();
  // Bắt buộc .catch: offscreen chưa chạy thì promise reject → lỗi
  // "Could not establish connection" tràn trang Errors (đã thấy thực tế).
  try {
    await chrome.runtime.sendMessage({
      type: "CN_AUDIO_START",
      tabId,
      sessionId,
      provider,
      streamId,
      wsBase: "wss://asr-live.noting.io.vn",
      appOrigin,
      idToken: auth?.idToken,
    });
  } catch (e) { /* offscreen chưa sẵn sàng — roster/chat/caption vẫn chạy */ }
}

async function stopAudioCapture(tabId) {
  try {
    await chrome.runtime.sendMessage({ type: "CN_AUDIO_STOP", tabId }).catch(() => {});
  } catch (e) { /* offscreen chưa chạy */ }
}

// ---- Kết thúc phiên của 1 tab ----
// Thứ tự bắt buộc: flush batch cuối TRƯỚC khi xóa khỏi map,
// vì flushTab thoát ngay khi không còn entry (mất batch cuối nếu xóa trước).
// Trả { meetingId, empty, counts } hoặc null khi không có gì để end.
async function endSession(tabId, reason) {
  const t = tabs.get(tabId);
  if (!t) return null;
  // Flush batch cuối TRƯỚC khi xóa entry (flushTab cần entry mới gửi được).
  await flushTab(tabId).catch(() => {});
  if (!t.sessionId) {
    tabs.delete(tabId);
    persistTabs();
    return { empty: true, counts: { segments: 0, chat: 0, participants: 0 } };
  }
  const r = await endSessionById(t.sessionId, reason);
  if (r && r.error) return null;
  if (r && r.meetingId) {
    const { appOrigin } = await getSettings();
    chrome.notifications.create(`cn-done-${t.sessionId}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Đã kết xuất biên bản",
      message: `Mở ${appOrigin}/meeting/${r.meetingId} để xem. (${reason})`,
    }).catch(() => {});
  }
  return r;
}

// ---- Map tab→session chỉ sống trong RAM của service worker (MV3 kill SW lúc
// rảnh là mất). Persist + nạp lại để popup/bấm Kết thúc vẫn đúng sau restart.
async function persistTabs() {
  try {
    const dump = [...tabs.entries()].map(([tabId, t]) => ({
      tabId,
      sessionId: t.sessionId,
      provider: t.provider,
      url: t.url,
    }));
    await chrome.storage.session.set({ liveTabs: dump });
  } catch (e) { /* storage chưa sẵn — bỏ qua */ }
}

async function rehydrateTabs() {
  try {
    const s = await chrome.storage.session.get(["liveTabs"]);
    const dump = Array.isArray(s.liveTabs) ? s.liveTabs : [];
    const now = Date.now();
    for (const d of dump) {
      if (!d || !d.tabId || !d.sessionId) continue;
      // Cho heartbeat từ content script (15s) cơ hội gắn lại trước khi sweep xét.
      tabs.set(d.tabId, {
        sessionId: d.sessionId,
        provider: d.provider,
        url: d.url,
        lastSeen: now,
        queue: [],
        spans: [],
        captions: [],
        emptyStreak: 0,
        recovered: true,
      });
    }
  } catch (e) { /* bỏ qua */ }
}
rehydrateTabs();

// Dựng entry nhẹ từ sessionId mà tab gửi kèm — dùng khi map RAM mất entry
// sau service worker restart. Trước đây CN_EVENTS rớt im lặng ở kiểm tra
// tabs.has, dữ liệu bốc hơi mà hai đầu đều tưởng ổn (thấy thực tế).
function attachLight(tabId, sessionId, extra) {
  if (!tabId || !sessionId) return null;
  const t = {
    sessionId,
    provider: (extra && extra.provider) || undefined,
    url: (extra && extra.url) || undefined,
    lastSeen: Date.now(),
    queue: [],
    spans: [],
    captions: [],
    emptyStreak: 0,
    reattached: true,
  };
  tabs.set(tabId, t);
  persistTabs();
  return t;
}

// Số heartbeat trống liên tiếp thì coi như selector hỏng (không đọc được gì
// dù tab Meet vẫn mở). 12 lần ≈ 3 phút.
const EMPTY_HEARTBEAT_LIMIT = 12;

function noteHeartbeat(tabId, t, msg) {
  t.lastSeen = Date.now();
  const empty = (msg.rosterCount || 0) === 0 && !msg.chatPanel && !msg.captionPanel;
  t.emptyStreak = empty ? (t.emptyStreak || 0) + 1 : 0;
  if ((t.emptyStreak || 0) >= EMPTY_HEARTBEAT_LIMIT) {
    chrome.action.setBadgeText({ text: "?", tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: "#d97706", tabId }).catch(() => {});
  }
  return t.emptyStreak || 0;
}

// Heartbeat từ tab lạ (SW vừa restart, map trống): tự gắn lại session qua API
// (server dedupe theo URL nên trả đúng sessionId cũ), không cần user bấm gì.
async function recoverFromHeartbeat(tabId, msg) {
  if (!msg.url) return false;
  const { consent } = await getSettings();
  if (!consent) return false;
  const auth = await getAuth();
  if (!auth) return false;
  try {
    const res = await apiFetch("/api/extension/session", {
      meetingUrl: msg.url,
      title: msg.title,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.sessionId) return false;
    tabs.set(tabId, {
      sessionId: data.sessionId,
      provider: data.provider || msg.provider,
      url: msg.url,
      lastSeen: Date.now(),
      queue: [],
      spans: [],
      captions: [],
      emptyStreak: 0,
      recovered: true,
    });
    persistTabs();
    setBadge(tabId, "REC", "#dc2626");
    pushSession(tabId, data.sessionId);
    return true;
  } catch (e) {
    return false;
  }
}

// ---- Nhận message từ content/offscreen/popup ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? msg.tabId;
  if (msg?.type === "CN_MEETING_STATE" && sender.tab?.id) {
    ensureSession(sender.tab.id, msg).then((sid) => sendResponse({ sessionId: sid }));
    return true;
  }
  if (msg?.type === "CN_EVENTS" && tabId) {
    let t = tabs.get(tabId);
    if (!t && msg.sessionId) t = attachLight(tabId, msg.sessionId, msg);
    if (!t) return;
    t.lastSeen = Date.now();
    let gotData = false;
    for (const ev of msg.events || []) {
      if (ev.kind === "participants") {
        t.queue.push({ kind: "participants", payload: ev.participants });
        if ((ev.participants || []).length > 0) gotData = true;
      } else if (ev.kind === "chat") {
        for (const m of ev.messages || []) t.queue.push({ kind: "chat", payload: m });
        if ((ev.messages || []).length > 0) gotData = true;
      } else if (ev.kind === "caption") {
        // Caption chỉ fusion tên cho ASR (offscreen đọc qua CN_GET_SPANS),
        // không đẩy lên API, không thành segment.
        for (const s of ev.captions || []) {
          if (!s || !String(s.text || "").trim()) continue;
          t.captions.push({ name: s.speaker || "", text: s.text, start: s.start, end: s.end });
          if (t.captions.length > 200) t.captions.splice(0, t.captions.length - 200);
        }
      } else if (ev.kind === "transcript") {
        for (const s of ev.segments || []) {
          t.queue.push({ kind: "transcript", payload: s });
        }
        if ((ev.segments || []).length > 0) gotData = true;
      }
    }
    // Có dữ liệu thật chảy về → reset cảnh báo selector + badge REC.
    if (gotData) {
      t.emptyStreak = 0;
      setBadge(tabId, "REC", "#dc2626");
    }
    if (t.queue.length >= 100) flushTab(tabId);
    sendResponse({ ok: true });
    return;
  }
  if (msg?.type === "CN_SPANS" && tabId) {
    let t = tabs.get(tabId);
    if (!t && msg.sessionId) t = attachLight(tabId, msg.sessionId, msg);
    if (!t) return;
    t.spans = (msg.spans || []).slice(-200);
    return;
  }
  if (msg?.type === "CN_HEARTBEAT" && tabId) {
    let t = tabs.get(tabId);
    if (!t && msg.sessionId) {
      // Tab biết sessionId của mình → gắn lại trực tiếp, khỏi gọi API.
      t = attachLight(tabId, msg.sessionId, msg);
      noteHeartbeat(tabId, t, msg);
      return;
    }
    if (t) {
      noteHeartbeat(tabId, t, msg);
      return;
    }
    // Tab lạ (SW vừa restart): tự gắn lại session cũ, không cần user bấm gì.
    recoverFromHeartbeat(tabId, msg).then((ok) => {
      if (ok) sendResponse({ recovered: true });
    });
    return;
  }
  if (msg?.type === "CN_GET_SPANS" && msg.tabId && tabs.has(msg.tabId)) {
    const t = tabs.get(msg.tabId);
    sendResponse({ spans: t.spans.slice(-50), captions: t.captions.slice(-50) });
    return;
  }
  if (msg?.type === "CN_ASR_FINAL" && msg.tabId) {
    // Segment ASR đã fusion tên ở offscreen → đẩy vào queue transcript.
    let t = tabs.get(msg.tabId);
    if (!t && msg.sessionId) t = attachLight(msg.tabId, msg.sessionId, msg);
    if (!t) return;
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
        if (r.sessionId) sendResponse({ ok: true, sessionId: r.sessionId, reused: !!r.reused });
        else sendResponse({ ok: false, reason: r.error || "api_failed", status: r.status });
      } catch (e) {
        sendResponse({ ok: false, reason: "error" });
      }
    })();
    return true;
  }
  if (msg?.type === "CN_MANUAL_END" && msg.tabId) {
    endSession(msg.tabId, "bấm tay").then((r) => {
      if (r && !r.error) sendResponse({ ok: true, ...r });
      else {
        // Không có phiên nào cho tab này (vd SW restart mà chưa kịp gắn lại,
        // hoặc phiên đã end trước đó).
        sendResponse({ ok: false, reason: "no_session" });
      }
    });
    return true;
  }
  // Kết thúc 1 session theo id (dọn được cả phiên mồ côi trong popup "kết thúc tất cả").
  if (msg?.type === "CN_END_SESSION" && msg.sessionId) {
    endSessionById(msg.sessionId, "bấm tay").then((r) => {
      if (r && !r.error) sendResponse({ ok: true, ...r });
      else sendResponse({ ok: false, reason: (r && r.error) || "api_failed", status: r && r.status });
    });
    return true;
  }
  // Đổi tên phiên của tab (popup) — meeting kết xuất sau mang tên đã sửa.
  if (msg?.type === "CN_RENAME_SESSION" && msg.tabId && msg.title) {
    (async () => {
      try {
        const t = tabs.get(msg.tabId);
        if (!t || !t.sessionId) {
          sendResponse({ ok: false, reason: "no_session" });
          return;
        }
        const res = await apiFetch("/api/extension/rename", {
          sessionId: t.sessionId,
          title: String(msg.title).slice(0, 120),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) sendResponse({ ok: true, title: data.title });
        else sendResponse({ ok: false, reason: "api_failed", status: res.status });
      } catch (e) {
        sendResponse({ ok: false, reason: "network" });
      }
    })();
    return true;
  }
  // Liệt kê phiên live của user (popup "kết thúc tất cả").
  if (msg?.type === "CN_LIST_SESSIONS") {
    (async () => {
      try {
        const res = await apiFetch("/api/extension/sessions", undefined, "GET");
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) sendResponse({ ok: true, sessions: data.sessions || [] });
        else sendResponse({ ok: false, reason: "api_failed", status: res.status });
      } catch (e) {
        if (e.code === "NO_AUTH" || e.code === "UNAUTHORIZED") {
          sendResponse({ ok: false, reason: "no_auth" });
        } else {
          sendResponse({ ok: false, reason: "network" });
        }
      }
    })();
    return true;
  }
  if (msg?.type === "CN_GET_STATE") {
    Promise.all([getSettings(), getAuth()]).then(([settings, auth]) => {
      sendResponse({
        codeVersion: CODE_VERSION,
        consent: settings.consent,
        autoStart: settings.autoStart,
        appOrigin: settings.appOrigin,
        authed: !!auth,
        email: auth?.email,
        liveTabs: [...tabs.entries()].map(([id, t]) => ({
          tabId: id,
          sessionId: t.sessionId,
          provider: t.provider,
          // Cảnh báo selector cho popup: không đọc được gì quá lâu.
          unhealthy: (t.emptyStreak || 0) >= EMPTY_HEARTBEAT_LIMIT,
          // Trạng thái lần đẩy cuối để popup hiện thay vì im lặng.
          lastFlush: t.lastFlush || null,
          // Trạng thái thu audio realtime (offscreen báo về).
          audioState: t.audioState || null,
        })),
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
  // Trạng thái thu audio realtime do offscreen báo về (để popup hiện,
  // khỏi mù như trước: ASR im lặng mà không ai biết vì sao).
  if (msg?.type === "CN_AUDIO_STATE" && tabId) {
    let t = tabs.get(tabId);
    if (!t && msg.sessionId) t = attachLight(tabId, msg.sessionId, msg);
    if (t) {
      t.audioState = {
        state: msg.state || "unknown",
        detail: msg.detail || "",
        finals: msg.finals || 0,
        lastFinalAt: msg.lastFinalAt || 0,
        at: Date.now(),
      };
      t.lastSeen = Date.now();
    }
    return;
  }
  if (msg?.type === "CN_PING") {
    sendResponse({ ok: true, pong: true, time: Date.now() });
    return;
  }
  // Chuyển tiếp yêu cầu chẩn đoán DOM tới tab Meet (bất đồng bộ).
  if (msg?.type === "CN_DIAG_REQUEST" && msg.tabId) {
    chrome.tabs.sendMessage(msg.tabId, { type: "CN_DIAG" }).then(
      (res) => sendResponse(res || { ok: false, reason: "no_response" }),
      () => sendResponse({ ok: false, reason: "no_content_script" })
    );
    return true;
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

// Tab bắt đầu phát tiếng mà audio chưa chạy tốt (chết lúc tab câm) →
// tự thử lại thu audio, khỏi bắt user bấm tay.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.audible !== true) return;
  const t = tabs.get(tabId);
  if (!t || !t.sessionId) return;
  const st = t.audioState && t.audioState.state;
  if (st === "capturing" || st === "ws_open" || st === "transcribing" || st === "starting" || st === "ws_connecting" || st === "ws_retrying") return;
  startAudioCapture(tabId, t.sessionId, t.provider).catch(() => {});
});

chrome.alarms.create("cn-sweep", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "cn-sweep") return;
  const now = Date.now();
  tabs.forEach((t, tabId) => {
    if (now - t.lastSeen > HEARTBEAT_TIMEOUT_MS) endSession(tabId, "mất tín hiệu");
  });
});
