/* eslint-disable */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let currentTabId = null;

  function refresh() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      currentTabId = tabs && tabs[0] ? tabs[0].id : null;
      chrome.runtime.sendMessage({ type: "CN_GET_STATE" }, (st) => {
        if (!st) return;
        render(st);
      });
    });
  }

  function render(st) {
    $("consentBox").style.display = st.consent ? "none" : "block";
    $("autoStart").checked = st.autoStart !== false;
    $("appOrigin").value = st.appOrigin || "";
    const authEl = $("authState");
    if (st.authed) {
      authEl.textContent = st.email || "Đã đăng nhập";
      authEl.className = "ok";
      $("loginHint").style.display = "none";
    } else {
      authEl.textContent = "Chưa đăng nhập";
      authEl.className = "muted";
      $("loginHint").style.display = "block";
    }
    const live = st.liveTabs || [];
    const liveEl = $("liveState");
    if (live.length > 0) {
      liveEl.innerHTML = live.map((t) => `<span class="live">● ${t.provider || "meet"}</span>`).join(" ");
    } else {
      liveEl.textContent = "Không có";
    }
    // Tab hiện tại đang ghi → chỉ hiện nút Kết thúc; chưa ghi → chỉ hiện Bắt đầu.
    const mine = currentTabId != null ? live.find((t) => t.tabId === currentTabId) : null;
    $("startBtn").style.display = mine ? "none" : "block";
    $("endBtn").style.display = mine ? "block" : "none";
    $("startBtn").style.flex = mine ? "" : "1";
    $("endBtn").style.flex = mine ? "1" : "";
    if (mine && mine.unhealthy) {
      showActionMsg("Không đọc được dữ liệu phòng họp — thử mở panel People/Chat trong Meet và bật phụ đề (CC).", true);
    }
  }

  $("consentBtn").addEventListener("click", () => {
    chrome.runtime.sendMessage(
      { type: "CN_SET_SETTINGS", consent: true, autoStart: $("autoStart").checked, appOrigin: $("appOrigin").value.trim() || undefined },
      () => refresh()
    );
  });

  $("saveBtn").addEventListener("click", () => {
    chrome.runtime.sendMessage(
      {
        type: "CN_SET_SETTINGS",
        consent: true,
        autoStart: $("autoStart").checked,
        appOrigin: $("appOrigin").value.trim(),
      },
      () => refresh()
    );
  });

  const REASONS = {
    no_consent: "Chưa đồng ý — bấm nút đồng ý ở trên trước.",
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

  $("startBtn").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;
      chrome.runtime.sendMessage({ type: "CN_MANUAL_START", tabId: tab.id }, (res) => {
        if (res && !res.ok) {
          const extra = res.status ? ` (HTTP ${res.status})` : "";
          showActionMsg((REASONS[res.reason] || REASONS.error) + extra, true);
        } else if (res && res.ok) {
          showActionMsg("Đã bắt đầu ghi phiên này.", false);
        }
        refresh();
      });
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
      showActionMsg("Đang kết thúc và kết xuất...", false);
      chrome.runtime.sendMessage({ type: "CN_MANUAL_END", tabId: tab.id }, (res) => {
        if (res && res.ok) {
          showActionMsg(
            res.meetingId
              ? `Đã kết thúc. Biên bản: /meeting/${res.meetingId} (mở từ dashboard).`
              : "Đã kết thúc phiên ghi.",
            false
          );
        } else {
          showActionMsg((res && END_REASONS[res.reason]) || END_REASONS.error, true);
        }
        refresh();
      });
    });
  });

  refresh();
})();
