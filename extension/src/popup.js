/* eslint-disable */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let currentTabId = null;
  let serverList = [];
  let timerHandle = null;

  function refresh() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      currentTabId = tabs && tabs[0] ? tabs[0].id : null;
      chrome.runtime.sendMessage({ type: "CN_GET_STATE" }, (st) => {
        if (!st) return;
        render(st);
      });
    });
  }

  function fmtElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  // Thẻ live của tab hiện tại: tên + timer + số liệu từ server.
  function fillLiveCard(mine) {
    const box = $("activeSummary");
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
    if (!mine) {
      box.style.display = "none";
      $("speakerDiag").style.display = "none";
      return;
    }
    box.style.display = "block";
    const srv = serverList.find((s) => s.sessionId === mine.sessionId);
    $("liveTitle").textContent = (srv && srv.title) || "Đang ghi...";
    const diag = $("speakerDiag");
    if (diag) {
      const rosterCount = Number.isFinite(mine.rosterCount)
        ? mine.rosterCount
        : Number(srv?.participantCount || 0);
      const statuses = Object.entries(mine.speakerStatus || {}).map(([source, value]) =>
        `${source}: ${value.diarization ? "diarization bật" : "diarization tắt"} (protocol ${value.protocol || "?"})`
      );
      const active = mine.activeSpeaker ? `; active speaker: ${mine.activeSpeaker}` : "; chưa bắt được active speaker";
      const mic = mine.audioState?.micCapture === "enabled"
        ? "mic cục bộ đang thu vì Meet mic bật"
        : mine.micMuted === true ? "Meet mic tắt; mic cục bộ bị khóa"
          : mine.micMuted === false ? "Meet mic bật; mic cục bộ không hoạt động"
            : "Meet mic chưa xác định; mic cục bộ bị khóa";
      diag.textContent = `Định danh: ${statuses.join(" · ") || "chưa nhận trạng thái từ ASR"}. Meet roster: ${rosterCount} người${active}. ${mic}.`;
      diag.style.color = statuses.some(s => s.includes("diarization tắt")) || rosterCount === 0 ? "#b45309" : "#475569";
      diag.style.display = "block";
    }
    if (document.activeElement !== $("renameInput")) {
      $("renameInput").value = (srv && srv.title) || "";
    }
    const counts = srv
      ? `${srv.segmentCount || 0} câu nhận dạng · ${srv.participantCount || 0} người`
      : "Đang khởi tạo phiên...";
    $("liveCounts").textContent = counts;
    const tick = () => {
      const cur = serverList.find((s) => s.sessionId === mine.sessionId);
      const started = cur && cur.startedAt;
      $("liveTimer").textContent = started ? `● ${fmtElapsed(Date.now() - started)}` : "●";
    };
    tick();
    timerHandle = setInterval(tick, 1000);
  }

  function render(st) {
    if ($("codeVersion")) $("codeVersion").textContent = st.codeVersion || "?";
    $("consentBox").style.display = st.consent ? "none" : "block";
    $("autoStart").checked = st.autoStart !== false && st.consent === true;
    $("appOrigin").value = st.appOrigin || "";
    const authEl = $("authState");
    if (st.authed) {
      authEl.textContent = st.email || "Đã đăng nhập";
      authEl.className = "ok";
      $("loginHint").style.display = "none";
      $("loginBtn").style.display = "none";
    } else {
      authEl.textContent = "Chưa đăng nhập";
      authEl.className = "muted";
      $("loginHint").style.display = "block";
      $("loginBtn").style.display = "block";
    }
    const live = st.liveTabs || [];
    const mine = currentTabId != null ? live.find((t) => t.tabId === currentTabId) : null;
    const liveEl = $("liveState");
    if (mine) {
      liveEl.textContent = "Đang ghi cuộc họp";
      $("statusDot").classList.add("live");
    } else if (live.length > 0) {
      liveEl.textContent = "Đang ghi ở tab khác";
      $("statusDot").classList.add("live");
    } else {
      liveEl.textContent = "Sẵn sàng ghi";
      $("statusDot").classList.remove("live");
    }
    // Tab hiện tại đang ghi → chỉ hiện nút Kết thúc; chưa ghi → chỉ hiện Bắt đầu.
    fillLiveCard(mine);
    $("idleSummary").style.display = mine ? "none" : "block";
    $("liveCard").style.display = "none";
    $("startBtn").style.display = mine ? "none" : "block";
    $("endBtn").style.display = mine ? "block" : "none";
    $("startBtn").style.flex = mine ? "" : "1";
    $("endBtn").style.flex = mine ? "1" : "";
    if (mine && mine.unhealthy) {
      showActionMsg("Không đọc được dữ liệu phòng họp — thử mở panel People/Chat trong Meet và bật phụ đề (CC).", true);
    }
    // Trạng thái thu audio realtime (offscreen): tốt thì hiện số câu ASR,
    // lỗi thì hiện đúng nguyên nhân (tab chưa phát tiếng / WS chết...).
    if (mine) {
      const a = mine.audioState;
      if (!a) {
        showActionMsg("Audio: chưa bắt đầu thu (mở tab Meet có tiếng rồi bấm Bắt đầu lại).", true);
      } else {
        const AUDIO_MSGS = {
          starting: "Audio: đang xin quyền thu âm tab...",
          capturing: "Audio: đã thu được tiếng tab, đang nối ASR...",
          ws_connecting: "Audio: đang nối server ASR...",
          ws_open: "Audio: đã nối ASR, chờ câu nói đầu tiên...",
          transcribing: null, // hiện số câu bên dưới
          stopped: "Audio: đã dừng thu.",
          mic_failed: `Mic cục bộ chưa thu được (${a.detail || "cấp quyền micro nếu cần"}); audio tab vẫn được ghi.`,
          mic_status: "Trạng thái micro được khóa theo nút mic của Meet.",
          offscreen_failed: `Audio LỖI: không mở được offscreen (${a.detail || ""}). Reload extension rồi thử lại.`,
          capture_failed: `Audio LỖI: không lấy được audio tab (${a.detail || ""}). ${
            /active stream/i.test(a.detail || "")
              ? "Tab đang bị 1 phiên thu khác giữ (tắt extension ghi màn hình khác, bấm Kết thúc rồi Bắt đầu lại)."
              : "Hãy phát tiếng trong tab Meet rồi bấm Bắt đầu lại."
          }`,
          ws_retrying: `Audio: ${a.detail || "đang thử nối lại ASR..."}`,
          ws_dead: "Audio LỖI: không nối được server ASR. Kiểm tra server asr-live.",
          diarization_disabled: `Audio vẫn nhận dạng chữ, nhưng server chưa nạp model diarization (${a.detail || ""}).`,
          protocol_error: `Audio đã kết nối nhưng server chưa hỗ trợ giao thức speaker (${a.detail || ""}).`,
          speaker_status: "Audio: đã nhận được trạng thái diarization từ server.",
        };
        if (a.state === "mic_status") {
          showActionMsg(a.micCapture === "enabled" ? "Mic cục bộ đang thu vì mic Meet được bật." : "Mic cục bộ đã khóa; chỉ audio tab tiếp tục được ghi.", false);
        } else if (a.state === "transcribing") {
          const when = a.lastFinalAt
            ? new Date(a.lastFinalAt).toLocaleTimeString("vi-VN")
            : "?";
          showActionMsg(`Audio: ASR đã trả ${a.finals || 0} câu (mới nhất lúc ${when}).`, false);
        } else {
          const msg = AUDIO_MSGS[a.state] || `Audio: trạng thái ${a.state}.`;
          showActionMsg(msg, /LỖI/.test(msg));
        }
      }
    }
    // Trạng thái lần đẩy cuối: hết cảnh "số 0 bí ẩn" — lỗi nào hiện mặt chữ đó.
    if (mine && mine.lastFlush && mine.lastFlush.status !== "ok") {
      const at = mine.lastFlush.at ? new Date(mine.lastFlush.at).toLocaleTimeString("vi-VN") : "?";
      const FLUSH_MSGS = {
        unauthorized: `Đẩy dữ liệu thất bại lúc ${at}: token hết hạn — mở web app, F5 lại tab web để đẩy token mới.`,
        network: `Đẩy dữ liệu thất bại lúc ${at}: không gọi được server — kiểm tra mạng/Vercel.`,
      };
      const raw = mine.lastFlush.status || "";
      const msg = FLUSH_MSGS[raw] || `Đẩy dữ liệu thất bại lúc ${at} (mã ${raw}).`;
      showActionMsg(msg, true);
    }
  }

  $("consentBtn").addEventListener("click", () => {
    $("autoStart").checked = true;
    chrome.runtime.sendMessage(
      { type: "CN_SET_SETTINGS", consent: true, autoStart: true, appOrigin: $("appOrigin").value.trim() || undefined },
      () => refresh()
    );
  });

  $("saveBtn").addEventListener("click", () => {
    const autoStart = $("autoStart").checked;
    chrome.runtime.sendMessage(
      {
        type: "CN_SET_SETTINGS",
        consent: autoStart,
        autoStart,
        appOrigin: $("appOrigin").value.trim(),
      },
      () => refresh()
    );
  });

  const REASONS = {
    no_consent: "Cần bật quyền tự động ghi trong Cài đặt nâng cao.",
    no_auth: "Chưa đăng nhập — mở web app ClassNoting, đăng nhập, rồi F5 lại tab web.",
    token_expired: "Token hết hạn — mở web app, F5 lại tab web để đẩy token mới, rồi thử lại.",
    bad_link: "Tab này không phải link Google Meet được hỗ trợ.",
    rate_limited: "Bấm quá nhanh — đợi 1 phút rồi thử lại.",
    server_error: "Server lỗi — kiểm tra Vercel đã deploy bản mới nhất chưa.",
    network: "Không gọi được web app — kiểm tra mạng, rồi Reload extension ở chrome://extensions để nhận quyền host mới.",
    api_failed: "Không tạo được phiên — kiểm tra mạng và địa chỉ web app.",
    auto_off: "Chế độ tự động đang tắt.",
    error: "Lỗi không xác định — thử lại.",
  };

  function showActionMsg(text, isError) {
    const el = $("actionMsg");
    el.textContent = text;
    el.style.display = "block";
    el.style.color = isError ? "#dc2626" : "#059669";
  }

  // Khóa nút lúc request đang chạy — chống nháy đúp tạo trùng phiên.
  function setBusy(btn, busy, label) {
    btn.disabled = busy;
    btn.style.opacity = busy ? "0.6" : "";
    if (busy) btn.dataset.label = btn.textContent;
    btn.textContent = busy ? label : btn.dataset.label || btn.textContent;
  }

  function formatCounts(c) {
    if (!c) return "";
    return ` (${c.segments || 0} câu · ${c.chat || 0} chat · ${c.participants || 0} người)`;
  }

  $("startBtn").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;
      setBusy($("startBtn"), true, "Đang tạo...");
      chrome.runtime.sendMessage({ type: "CN_MANUAL_START", tabId: tab.id }, (res) => {
        setBusy($("startBtn"), false);
        if (res && !res.ok) {
          const extra = res.status ? ` (HTTP ${res.status})` : "";
          showActionMsg((REASONS[res.reason] || REASONS.error) + extra, true);
        } else if (res && res.ok) {
          showActionMsg(
            res.reused ? "Phiên đã tồn tại — tiếp tục ghi." : "Đã bắt đầu ghi phiên này.",
            false
          );
        }
        refresh();
      });
    });
  });

  $("loginBtn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CN_GET_STATE" }, (st) => {
      chrome.tabs.create({ url: (st && st.appOrigin) || "https://smart-noting.vercel.app" });
    });
  });

  const END_REASONS = {
    no_session: "Tab này không có phiên đang ghi (có thể đã kết thúc trước đó).",
    error: "Lỗi không xác định — thử lại.",
  };

  $("endBtn").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;
      setBusy($("endBtn"), true, "Đang kết xuất...");
      showActionMsg("Đang kết thúc và kết xuất...", false);
      chrome.runtime.sendMessage({ type: "CN_MANUAL_END", tabId: tab.id }, (res) => {
        setBusy($("endBtn"), false);
        if (res && res.ok) {
          if (res.empty) {
            showActionMsg(
              "Đã kết thúc nhưng phiên không thu được dữ liệu nào nên không tạo biên bản." +
                " Hãy F5 lại tab Meet rồi ghi lại.",
              true
            );
          } else {
            showActionMsg(
              (res.meetingId
                ? `Đã kết thúc. Biên bản: /meeting/${res.meetingId} (mở từ dashboard).`
                : "Đã kết thúc phiên ghi.") + formatCounts(res.counts),
              false
            );
          }
        } else {
          showActionMsg((res && END_REASONS[res.reason]) || END_REASONS.error, true);
        }
        refresh();
      });
    });
  });

  // Liệt kê mọi phiên live trên server (kể cả phiên mồ côi) + kết thúc từng cái.
  function renderServerSessions(list) {
    const box = $("serverSessions");
    box.innerHTML = "";
    if (!list || list.length === 0) {
      box.style.display = "none";
      return;
    }
    box.style.display = "block";
    const title = document.createElement("div");
    title.className = "muted";
    title.textContent = `Phiên live trên server (${list.length}) — kể cả phiên mồ côi:`;
    box.appendChild(title);
    list.forEach((s) => {
      const row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("span");
      name.className = "muted";
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";
      name.style.whiteSpace = "nowrap";
      name.style.maxWidth = "180px";
      name.textContent = `${s.title || s.sessionId} (${s.segmentCount || 0} câu)`;
      name.title = s.sessionId;
      const btn = document.createElement("button");
      btn.className = "ghost";
      btn.textContent = "Kết thúc";
      btn.addEventListener("click", () => {
        btn.disabled = true;
        chrome.runtime.sendMessage({ type: "CN_END_SESSION", sessionId: s.sessionId }, (res) => {
          if (res && res.ok) {
            showActionMsg(
              res.empty
                ? `Đã đóng phiên rỗng (${s.sessionId.slice(0, 8)}...).`
                : `Đã kết thúc${res.meetingId ? `, biên bản /meeting/${res.meetingId}` : ""}${formatCounts(res.counts)}.`,
              false
            );
          } else {
            showActionMsg((res && END_REASONS[res.reason]) || END_REASONS.error, true);
          }
          refreshServerSessions();
          refresh();
        });
      });
      // Ghi thêm tiếng tab hiện tại (vd tab YouTube đang share) vào phiên này.
      // Bấm khi đang đứng ở tab đó → có gesture/activeTab.
      const addBtn = document.createElement("button");
      addBtn.className = "ghost";
      addBtn.textContent = "＋ tab này";
      addBtn.title = "Thu thêm tiếng của tab đang mở vào phiên này (dùng khi share màn hình có tiếng)";
      addBtn.addEventListener("click", () => {
        addBtn.disabled = true;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs[0];
          if (!tab) {
            addBtn.disabled = false;
            return;
          }
          chrome.runtime.sendMessage(
            { type: "CN_CAPTURE_EXTRA", tabId: tab.id, sessionId: s.sessionId },
            (res) => {
              addBtn.disabled = false;
              if (res && res.ok) {
                showActionMsg("Đã bắt đầu thu thêm tiếng tab này vào phiên.", false);
              } else {
                showActionMsg("Không thu được tab này — thử phát tiếng trong tab rồi bấm lại.", true);
              }
              refresh();
            }
          );
        });
      });
      row.appendChild(name);
      const btns = document.createElement("span");
      btns.style.display = "flex";
      btns.style.gap = "4px";
      btns.appendChild(addBtn);
      btns.appendChild(btn);
      row.appendChild(btns);
      box.appendChild(row);
    });
  }

  function refreshServerSessions() {
    chrome.runtime.sendMessage({ type: "CN_LIST_SESSIONS" }, (res) => {
      if (res && res.ok) {
        serverList = res.sessions || [];
        renderServerSessions(serverList);
        // Cập nhật tên/counts/timer của thẻ live nếu đang mở.
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tid = tabs && tabs[0] ? tabs[0].id : null;
          chrome.runtime.sendMessage({ type: "CN_GET_STATE" }, (st) => {
            if (!st) return;
            const live = st.liveTabs || [];
            fillLiveCard(tid != null ? live.find((t) => t.tabId === tid) || null : null);
          });
        });
      }
    });
  }

  $("renameBtn").addEventListener("click", () => {
    const title = $("renameInput").value.trim();
    if (!title) {
      showActionMsg("Nhập tên mới trước khi đổi.", true);
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;
      chrome.runtime.sendMessage(
        { type: "CN_RENAME_SESSION", tabId: tab.id, title },
        (res) => {
          if (res && res.ok) {
            showActionMsg(`Đã đổi tên thành "${res.title}".`, false);
            refreshServerSessions();
          } else {
            showActionMsg("Đổi tên thất bại — thử lại.", true);
          }
        }
      );
    });
  });

  // Chẩn đoán DOM tab Meet hiện tại — copy kết quả gửi dev để viết selector khớp.
  $("diagBtn").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;
      const area = $("diagOut");
      area.style.display = "block";
      area.value = "Đang thu thập DOM...";
      chrome.runtime.sendMessage({ type: "CN_DIAG_REQUEST", tabId: tab.id }, (res) => {
        if (res && res.ok && res.diag) {
          const d = res.diag;
          const lines = [
            `url: ${d.url}`,
            `title: ${d.title}`,
            `content: bản ${d.codeVersion || "?"} | sessionId: ${d.sessionId || "(chưa có)"} | queuePending: ${d.queuePending || 0}`,
            `roster: ${(d.rosterNames || []).join(" | ") || "(rỗng)"}`,
            `observed: chat=${d.chatObserved ? "sống" : "CHẾT"} | caption=${d.captionObserved ? "sống" : "CHẾT"}`,
            "--- checks ---",
          ];
          (d.checks || []).forEach((c) => {
            let detail = "";
            if (c.count !== undefined) detail = `count=${c.count}`;
            else if (c.matched !== undefined) detail = `matched=${c.matched}`;
            else if (c.length !== undefined) detail = `length=${c.length}`;
            else if (c.indicatorCount !== undefined) detail = `name=${c.name || "(rỗng)"}; indicators=${c.indicatorCount}`;
            else if (c.name !== undefined) detail = `name=${c.name || "(rỗng)"}`;
            else if (c.found !== undefined) detail = `found=${c.found}`;
            else if (c.error) detail = `ERROR=${c.error}`;
            lines.push(`[${c.label}] ${detail}`);
            if (c.sample) lines.push(`  sample: ${c.sample}`);
            if (c.chain) lines.push(`  chain: ${c.chain}`);
          });
          area.value = lines.join("\n");
        } else {
          area.value =
            "Không lấy được DOM (content script chưa gắn vào tab — hãy F5 lại tab Meet). " +
            `reason=${(res && res.reason) || "?"}`;
        }
      });
    });
  });

  // Quyền micro: phải xin trong popup (có gesture). Quyền lưu theo origin
  // extension nên offscreen sau đó lấy mic im lặng. Không có mic thì họp solo câm.
  async function refreshMicState() {
    const el = $("micState");
    try {
      if (!navigator.permissions || !navigator.permissions.query) {
        el.textContent = "không kiểm tra được";
        return;
      }
      const st = await navigator.permissions.query({ name: "microphone" });
      if (st.state === "granted") {
        el.textContent = "Đã cho phép";
        el.className = "ok";
      } else if (st.state === "denied") {
        el.textContent = "Bị chặn — mở khóa trong cài đặt Chrome";
        el.className = "muted";
      } else {
        el.textContent = "Chưa hỏi";
        el.className = "muted";
      }
    } catch (e) {
      el.textContent = "không kiểm tra được";
    }
  }

  // Mở tab onboarding để xin quyền (popup sập khi mất focus nên hộp
  // Allow không bao giờ hiện nếu xin trực tiếp trong popup).
  $("micBtn").addEventListener("click", () => {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding.html") });
    } catch (e) {
      showActionMsg("Không mở được trang cấp quyền — thử lại.", true);
    }
  });

  refresh();
  refreshServerSessions();
  refreshMicState();
})();
