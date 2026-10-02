/* eslint-disable */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function refresh() {
    chrome.runtime.sendMessage({ type: "CN_GET_STATE" }, (st) => {
      if (!st) return;
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
        liveEl.innerHTML = live.map((t) => `<span class="live">● ${t.provider}</span>`).join(" ");
      } else {
        liveEl.textContent = "Không có";
      }
    });
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
    api_failed: "Không tạo được phiên — kiểm tra mạng và địa chỉ web app.",
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
        if (res && !res.ok) showActionMsg(REASONS[res.reason] || REASONS.error, true);
        else if (res && res.ok) showActionMsg("Đã bắt đầu ghi phiên này.", false);
        refresh();
      });
    });
  });

  $("endBtn").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;
      chrome.runtime.sendMessage({ type: "CN_MANUAL_END", tabId: tab.id }, () => refresh());
    });
  });

  refresh();
})();
