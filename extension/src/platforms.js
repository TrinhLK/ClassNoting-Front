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
    // Header/section trong panel People — không phải tên người.
    ROSTER_BLOCKLIST: [
      "in the meeting", "contributors", "waiting to join", "waiting to be admitted",
      "waiting for", "admit", "all muted", "muted", "presenting", "presentation",
      "people", "mọi người", "trong cuộc họp", "đang chờ", "chờ được duyệt",
      "tắt tiếng", "đang trình bày", "you", "search for people", "tìm kiếm",
    ],
    cleanRosterName(raw) {
      if (!raw) return "";
      // Lấy dòng đầu, bỏ hậu tố "(You)"/"(Bạn)".
      let name = String(raw).split("\n")[0].trim().replace(/\s*\((you|bạn)\)\s*$/i, "").trim();
      if (!name || name.length > 120) return "";
      if (/^\d+$/.test(name)) return "";
      // Tên bị nhân đôi do gộp text ("Trình Lê Khánh Trình Lê Khánh", độ dài lẻ
      // 2n+1 nên so nửa chuỗi không bao giờ khớp) → rút về một bằng regex.
      const doubled = name.match(/^(.+?)\s+\1$/i);
      if (doubled) name = doubled[1].trim();
      const low = name.toLowerCase();
      // "you" phải khớp nguyên từ (tránh loại tên chứa "you" như "Young").
      if (/\byou\b/.test(low)) return "";
      if (meet.ROSTER_BLOCKLIST.some((b) => b !== "you" && low.includes(b))) return "";
      return name;
    },
    scrapeRoster() {
      const names = [];
      const seen = new Set();
      const push = (name, id) => {
        const clean = meet.cleanRosterName(name);
        if (clean && !seen.has(clean.toLowerCase())) {
          seen.add(clean.toLowerCase());
          names.push(id ? { name: clean, id } : { name: clean });
        }
      };
      // Lớp 1: tile video (ổn định nhất khi không present).
      // Diag thực tế: tile [data-participant-id] tồn tại nhưng overlay/aria-label
      // trống — tên ("Trịnh Lê Khánh") nằm ở container cha, dưới video.
      try {
        const tiles = allMatches(["[data-participant-id]"]);
        for (const t of tiles) {
          const pid = t.getAttribute("data-participant-id");
          const label = t.getAttribute("aria-label") || "";
          const overlay = t.querySelector("[data-self-name], [class*='name' i]");
          let name = overlay ? visibleText(overlay) : label;
          if (!name.trim() && t.parentElement) {
            try {
              const sib = t.parentElement.querySelector("[data-self-name], [class*='name' i]");
              name = sib ? visibleText(sib) : "";
            } catch (e2) { /* bỏ qua */ }
          }
          if (!name.trim() && t.parentElement) {
            // Text gộp của container cha thường chỉ còn lại tên (đã qua blocklist);
            // chặn text dài (chứa cả control) để khỏi thành rác.
            const parentText = visibleText(t.parentElement);
            if (parentText && parentText.length <= 60) name = parentText;
          }
          push(name, pid);
        }
      } catch (e) { /* DOM lạ */ }
      // Lớp 2: panel People (sống sót khi đang present / tile thu gọn).
      // Diag thực tế: selector vớ nhầm ô search input — bỏ qua input/button.
      try {
        const panels = allMatches([
          '[aria-label*="People" i]',
          '[aria-label*="Mọi người" i]',
          '[data-panel-id*="people" i]',
          '[data-tab-id*="people" i]',
        ]).filter((el) => {
          try {
            return !el.matches('input, button, [role="button"]');
          } catch (e) { return true; }
        });
        for (const panel of panels) {
          const items = panel.querySelectorAll('[role="listitem"], li, [data-participant-id]');
          items.forEach((it) => {
            try {
              if (it.matches('input, button, [role="button"], [role="menuitem"]')) return;
            } catch (e) { /* tiếp tục */ }
            push(visibleText(it));
          });
          if (items.length === 0) {
            // Panel dạng flat text — tách theo dòng, lọc qua blocklist.
            visibleText(panel).split("\n").forEach((line) => push(line));
          }
        }
      } catch (e) { /* DOM lạ */ }
      return names;
    },
    chatRoot() {
      // Panel chat (label VI + EN). QUAN TRỌNG: loại nút bấm — selector
      // '[aria-label*="Chat"]' từng vớ nhầm nút mở panel (BUTTON.VYBDae...)
      // khiến observer gắn vào cái nút và không bao giờ thấy tin nhắn.
      const candidates = allMatches([
        '[role="log"]',
        '[aria-label*="tin nhắn trong cuộc gọi" i]',
        '[aria-label*="in-call messages" i]',
        '[aria-label*="Chat" i]',
      ]).filter((el) => {
        try {
          if (el.matches('button, [role="button"], [role="menuitem"]')) return false;
          if (el.closest('button, [role="button"]')) return false;
        } catch (e) { /* matches lỗi — giữ lại xét tiếp */ }
        return true;
      });
      // Ưu tiên container đang chứa tin nhắn thật.
      for (const el of candidates) {
        try {
          if (el.querySelector('[role="listitem"], li, [data-message-id]')) return el;
        } catch (e) { /* bỏ qua */ }
      }
      return candidates[0] || null;
    },
    // Token UI của Meet — không bao giờ là nội dung tin nhắn.
    CHAT_UI_TOKENS: [
      "chat", "chat_bubble", "chat_bubble_outline", "chat_off",
      "send", "close", "chat_options", "more", "reply", "react",
    ],
    parseChatNode(node) {
      if (!node || node.nodeType !== 1) return null;
      // Bỏ qua nút/menu/tooltip — nguồn rác "chat"/"chat_bubble" đã thấy thực tế.
      try {
        if (node.closest('button, [role="button"], [role="menu"], [role="menuitem"], [role="tooltip"], [aria-hidden="true"]')) return null;
      } catch (e) { /* closest lỗi — tiếp tục */ }
      // Tin nhắn Meet: thử data-message-text rồi fallback text chung.
      const textEl =
        node.querySelector?.("[data-message-text]") || node;
      const text = visibleText(textEl);
      if (!text || text.length < 2 || text.length > 2000) return null;
      if (meet.CHAT_UI_TOKENS.includes(text.toLowerCase())) return null;
      // Sender: node anh em/phần tử tên gần nhất. Không có tên mà text lại
      // là 1-2 từ viết thường kiểu tên icon (snake_case) → rác UI.
      const scope = node.closest?.('[data-message-id], [role="listitem"], li') || node.parentElement || node;
      let senderEl = null;
      try {
        senderEl = scope.querySelector?.("[data-sender-name]");
      } catch (e) { /* bỏ qua */ }
      const sender = senderEl ? visibleText(senderEl) : "";
      if (!sender && /^[a-z][a-z0-9_]{1,40}$/.test(text)) return null;
      if (sender && text === sender) return null;
      return { text, sender: sender || "Khách" };
    },
    captionRoot() {
      return firstMatch([
        '[aria-label*="Phụ đề" i]',
        '[aria-label*="Captions" i]',
        '[aria-live="polite"]',
      ]).el;
    },
    // Text hệ thống của Meet — không phải lời nói (đã thấy "closed_caption_off" lọt vào transcript).
    CAPTION_STATUS_PATTERNS: [
      /closed.?captions?/i,
      /captions?\s+(off|disabled|unavailable)/i,
      /phụ đề.*(tắt|không khả dụng)/i,
      /live captions?/i,
      /turn (on|off) captions?/i,
    ],
    parseCaptionNode(node) {
      if (!node || node.nodeType !== 1) return null;
      try {
        if (node.closest('button, [role="button"], [role="menu"], [aria-hidden="true"]')) return null;
      } catch (e) { /* tiếp tục */ }
      const text = visibleText(node);
      if (!text || text.length < 3 || text.length > 2000) return null;
      if (meet.CAPTION_STATUS_PATTERNS.some((re) => re.test(text))) return null;
      // Meet render "Tên: nội dung" trong caption.
      const m = text.match(/^([^:]{1,60}):\s+(.+)$/s);
      if (m) {
        const name = m[1].trim();
        // Tên chứa từ hệ thống → vẫn là status, bỏ.
        if (meet.CAPTION_STATUS_PATTERNS.some((re) => re.test(name))) return null;
        return { name, text: m[2].trim() };
      }
      // Không bóc được tên mà text lại nhắc tới caption → status, bỏ.
      if (/caption/i.test(text)) return null;
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
    // Chẩn đoán DOM: báo từng selector trúng/trượt + snippet thực tế để viết
    // selector khớp 100% thay vì đoán. Không thu nội dung nhạy cảm (cắt 300 ký tự).
    describe() {
      const out = {
        url: (typeof location !== "undefined" && location.href) || "",
        title: (typeof document !== "undefined" && document.title) || "",
        rosterNames: [],
        checks: [],
      };
      const snip = (el) => {
        if (!el || !el.outerHTML) return "";
        return el.outerHTML.slice(0, 300);
      };
      const probe = (label, fn) => {
        try {
          out.checks.push(Object.assign({ label }, fn()));
        } catch (e) {
          out.checks.push({ label, error: String((e && e.message) || e) });
        }
      };
      probe("tiles[data-participant-id]", () => {
        const els = allMatches(["[data-participant-id]"]);
        return { count: els.length, sample: snip(els[0]) };
      });
      probe("roster:scrapeRoster", () => {
        const names = meet.scrapeRoster() || [];
        out.rosterNames = names.map((r) => r.name);
        return { count: names.length };
      });
      probe("roster:people-panel", () => {
        const panels = allMatches([
          '[aria-label*="People" i]',
          '[aria-label*="Mọi người" i]',
          '[data-panel-id*="people" i]',
          '[data-tab-id*="people" i]',
        ]);
        return { count: panels.length, sample: snip(panels[0]) };
      });
      probe("chat:root", () => {
        const root = meet.chatRoot();
        return { matched: !!root, sample: root ? root.tagName + "#" + (root.id || "") + "." + (root.className || "").toString().slice(0, 80) : "" };
      });
      probe("chat:listitems", () => {
        const root = meet.chatRoot();
        if (!root) return { count: 0 };
        const items = root.querySelectorAll('[role="listitem"], li, [data-message-id]');
        const last = items[items.length - 1];
        return { count: items.length, sample: snip(last) };
      });
      probe("caption:root", () => {
        const root = meet.captionRoot();
        return { matched: !!root, sample: root ? root.tagName + "#" + (root.id || "") + "." + (root.className || "").toString().slice(0, 80) : "" };
      });
      probe("caption:text", () => {
        const root = meet.captionRoot();
        const text = root ? visibleText(root).slice(0, 200) : "";
        return { length: text.length, sample: text };
      });
      return out;
    },
  };

  global.ClassNotingPlatforms = { meet };
})(typeof globalThis !== "undefined" ? globalThis : this);
