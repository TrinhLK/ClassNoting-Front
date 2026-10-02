/* eslint-disable */
/**
 * platforms.js — Bộ scrape DOM Google Meet (best-effort, nhiều lớp fallback).
 * PHẠM VI: chỉ Google Meet (Zoom/MS Teams đã loại khỏi sản phẩm).
 * Platform expose: scrapeRoster(), observeChat(cb), observeCaptions(cb),
 * sampleActiveSpeaker(), kèm selfCheck() đếm selector trúng để báo hỏng về backend.
 * Ghi chú: Google đổi DOM thường xuyên — khi selfCheck rớt 0,
 * content.js gửi sự kiện {kind:'health'} để backend cảnh báo.
 */
(function (global) {
  "use strict";

  function visibleText(el) {
    if (!el) return "";
    const t = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
    return t;
  }

  function firstMatch(selectors, root) {
    const doc = root || document;
    for (const sel of selectors) {
      try {
        const el = doc.querySelector(sel);
        if (el) return { el, sel };
      } catch (e) { /* selector lỗi — thử cái tiếp */ }
    }
    return { el: null, sel: null };
  }

  function allMatches(selectors, root) {
    const doc = root || document;
    const out = [];
    for (const sel of selectors) {
      try {
        doc.querySelectorAll(sel).forEach((el) => {
          if (!out.includes(el)) out.push(el);
        });
      } catch (e) { /* bỏ qua */ }
    }
    return out;
  }

  // ================= GOOGLE MEET =================
  const meet = {
    id: "meet",
    scrapeRoster() {
      // data-participant-id là hook ổn định nhất của Meet.
      const tiles = allMatches(["[data-participant-id]"]);
      const names = [];
      const seen = new Set();
      for (const t of tiles) {
        // Tên thường nằm ở overlay dưới tile hoặc aria-label.
        const label = t.getAttribute("aria-label") || "";
        const overlay = t.querySelector("[data-self-name], [class*='name' i]");
        const name = (overlay ? visibleText(overlay) : label).trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          names.push({ name, id: t.getAttribute("data-participant-id") });
        }
      }
      return names;
    },
    chatRoot() {
      // Panel chat (label VI + EN).
      return firstMatch([
        '[aria-label*="tin nhắn trong cuộc gọi" i]',
        '[aria-label*="in-call messages" i]',
        '[aria-label*="Chat" i]',
      ]).el;
    },
    parseChatNode(node) {
      // Tin nhắn Meet: thử data-message-text rồi fallback text chung.
      const textEl =
        node.querySelector?.("[data-message-text]") || node;
      const text = visibleText(textEl);
      if (!text || text.length > 2000) return null;
      // Sender: node anh em/phần tử tên gần nhất.
      const scope = node.parentElement || node;
      const senderEl = scope.querySelector?.("[data-sender-name]");
      const sender = senderEl ? visibleText(senderEl) : "";
      return { text, sender: sender || "Khách" };
    },
    captionRoot() {
      return firstMatch([
        '[aria-label*="Phụ đề" i]',
        '[aria-label*="Captions" i]',
        '[aria-live="polite"]',
      ]).el;
    },
    parseCaptionNode(node) {
      const text = visibleText(node);
      if (!text) return null;
      // Meet render "Tên: nội dung" trong caption.
      const m = text.match(/^([^:]{1,60}):\s+(.+)$/s);
      if (m) return { name: m[1].trim(), text: m[2].trim() };
      return { name: "", text };
    },
    sampleActiveSpeaker() {
      // Tile đang nói của Meet có chỉ báo âm lượng/border — thử nhiều dấu hiệu.
      const speaking = allMatches([
        "[data-participant-id][data-speaking='true']",
        "[data-active-speaker='true']",
      ]);
      if (speaking.length > 0) {
        const label = speaking[0].getAttribute("aria-label") || "";
        if (label.trim()) return label.trim();
      }
      return "";
    },
  };

  global.ClassNotingPlatforms = { meet };
})(typeof globalThis !== "undefined" ? globalThis : this);
