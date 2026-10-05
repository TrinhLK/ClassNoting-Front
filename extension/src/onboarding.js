/* eslint-disable */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function setStatus(text, cls) {
    const el = $("status");
    el.textContent = text;
    el.className = cls || "";
  }

  $("grantBtn").addEventListener("click", async () => {
    const btn = $("grantBtn");
    btn.disabled = true;
    btn.textContent = "Đang chờ bạn bấm Allow...";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setStatus("Đã cấp quyền micro. Từ giờ extension thu được cả giọng bạn.", "ok");
      $("doneBtn").style.display = "block";
    } catch (e) {
      setStatus(
        "Chưa cấp được (" + ((e && e.name) || "lỗi") + "). Nếu bạn bấm Block trước đây: mở chrome://settings/content/microphone, xóa extension khỏi danh sách chặn rồi bấm lại.",
        "err"
      );
      btn.disabled = false;
      btn.textContent = "Thử lại";
    }
  });

  $("doneBtn").addEventListener("click", () => {
    window.close();
  });
})();
