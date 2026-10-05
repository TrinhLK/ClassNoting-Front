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
    // Bóc tên từ node item: duyệt từng con theo thứ tự, con nào sạch thì lấy.
    // (textContent gộp "Tên"+"Role" thành một chuỗi không tách được — test bắt được.)
    firstNameIn(el) {
      if (!el || el.nodeType !== 1) return "";
      const kids = el.childNodes;
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        if (k.nodeType === 3) {
          const lines = String(k.textContent || "").split("\n");
          for (const line of lines) {
            const c = meet.cleanRosterName(line);
            if (c) return c;
          }
        } else if (k.nodeType === 1) {
          try {
            if (k.matches('input, button, [role="button"], svg, img, video')) continue;
          } catch (e) { /* tiếp tục */ }
          const c = meet.cleanRosterName(k.textContent || "");
          if (c) return c;
        }
      }
      return "";
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
            push(meet.firstNameIn(it) || visibleText(it));
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
      if (candidates[0]) return candidates[0];
      // Tuyến cuối: tìm panel từ ô nhập tin nhắn (neo aria-label ổn định).
      // Ca diag thật: panel "In-call messages" mở mà mọi selector trên đều trượt.
      return meet.chatRootFromAnchor();
    },
    // Token UI của Meet — không bao giờ là nội dung tin nhắn.
    CHAT_UI_TOKENS: [
      "chat", "chat_bubble", "chat_bubble_outline", "chat_off",
      "send", "close", "chat_options", "more", "reply", "react",
    ],
    // Tìm root panel chat từ ô nhập tin nhắn (neo aria-label ổn định hơn class
    // sinh tự động của Meet). Leo từ textbox lên, chọn ancestor thấp nhất vừa
    // chứa nhánh composer vừa chứa nhánh text đáng kể (khu vực list tin nhắn).
    // Có cache + validate isConnected. Pure theo DOM — test được.
    // Tìm ô nhập tin nhắn (neo để leo lên panel chat). Dùng chung cho
    // chatRootFromAnchor và diag — khỏi lệch nhau.
    findChatAnchor() {
      try {
        const all = document.querySelectorAll("textarea, input, [role='textbox'], [contenteditable='true'], *");
        for (const el of all) {
          if (!el.getAttribute) continue;
          const label = el.getAttribute("aria-label") || "";
          const holder = el.getAttribute("placeholder") || "";
          const title = el.getAttribute("title") || "";
          if (/send a message|gửi tin nhắn/i.test(label + " " + holder + " " + title)) return el;
        }
      } catch (e) { /* bỏ qua */ }
      return null;
    },
    chatRootFromAnchor() {
      try {
        if (meet._anchor && !meet._anchor.isConnected) meet._anchor = null;
        if (meet._chatPanel && meet._chatPanel.isConnected) return meet._chatPanel;
        let anchor = meet._anchor && meet._anchor.isConnected ? meet._anchor : null;
        if (!anchor) {
          anchor = meet.findChatAnchor();
          meet._anchor = anchor || null;
        }
        if (!anchor) return null;
        let el = anchor.parentElement;
        for (let i = 0; i < 8 && el && el.tagName && el.tagName !== "BODY"; i++) {
          let composerKid = null;
          let listKid = null;
          const kids = el.children || [];
          for (const k of kids) {
            try {
              if (k.contains && k.contains(anchor)) {
                composerKid = k;
                continue;
              }
              if (visibleText(k).length >= 10) listKid = k;
            } catch (e) { /* bỏ qua */ }
          }
          if (composerKid && listKid) {
            meet._chatPanel = el;
            return el;
          }
          el = el.parentElement;
        }
      } catch (e) { /* bỏ qua */ }
      return null;
    },
    parseChatNode(node, root, rosterNames) {
      if (!node || node.nodeType !== 1) return null;
      // Bỏ qua nút/menu/tooltip — nguồn rác "chat"/"chat_bubble" đã thấy thực tế.
      try {
        if (node.closest('button, [role="button"], [role="menu"], [role="menuitem"], [role="tooltip"], [aria-hidden="true"]')) return null;
      } catch (e) { /* closest lỗi — tiếp tục */ }
      // Cấp block khi biết root: leo từ leaf lên tới con trực tiếp của root.
      // Không root (đường cũ) thì parse ngay tại node.
      let block = node;
      if (root) {
        let el = node;
        let depth = 0;
        while (el && el.parentElement && el.parentElement !== root && depth < 8) {
          el = el.parentElement;
          depth++;
        }
        if (el && el !== root) block = el;
      }
      // Tin nhắn Meet: thử data-message-text rồi fallback text chung.
      const textEl =
        block.querySelector?.("[data-message-text]") || block;
      const text = visibleText(textEl);
      if (!text || text.length < 2 || text.length > 2000) return null;
      if (meet.CHAT_UI_TOKENS.includes(text.toLowerCase())) return null;
      // Sender trong block trước.
      let sender = "";
      try {
        const se = block.querySelector?.("[data-sender-name]");
        sender = se ? visibleText(se) : "";
      } catch (e) { /* bỏ qua */ }
      let body = text;
      if (sender) {
        // Bỏ phần tên khỏi body (ưu tiên tiền tố, rồi lần xuất hiện đầu).
        if (text.toLowerCase().startsWith(sender.toLowerCase())) {
          body = text.slice(sender.length).trim().replace(/^:\s*/, "");
        } else {
          const idx = text.indexOf(sender);
          body = idx >= 0 ? (text.slice(0, idx) + " " + text.slice(idx + sender.length)).trim() : text;
        }
      } else if (root) {
        // Ở cấp block thì BẮT BUỘC có sender (ô composer "Send a message"
        // không sender → rớt đúng). Đường cũ không root giữ fallback "Khách".
        sender = meet.senderOfChatText(text, rosterNames);
        if (!sender) return null;
        body = text.slice(sender.length).trim().replace(/^:\s*/, "");
      } else {
        // Đường cũ: giữ tương thích.
        const scope = node.closest?.('[data-message-id], [role="listitem"], li') || node.parentElement || node;
        let senderEl = null;
        try {
          senderEl = scope.querySelector?.("[data-sender-name]");
        } catch (e) { /* bỏ qua */ }
        const s2 = senderEl ? visibleText(senderEl) : "";
        if (!s2 && /^[a-z][a-z0-9_]{1,40}$/.test(text)) return null;
        if (s2 && text === s2) return null;
        return { text, sender: s2 || "Khách" };
      }
      // Bỏ timestamp đuôi ("10:38 PM") và kiểm tra rác cuối.
      body = body.replace(/\s+\d{1,2}:\d{2}(\s*[AP]M)?\s*$/i, "").trim();
      if (!body || meet.CHAT_UI_TOKENS.includes(body.toLowerCase())) return null;
      if (/^\((you|bạn)\)$/i.test(body)) return null;
      if (sender && body === sender) return null;
      return { text: body, sender: sender || "Khách" };
    },
    captionRoot() {
      // Loại nút bấm (nút toggle CC có aria-label "Captions" — từng vớ nhầm
      // BUTTON khiến observer sống giả), ưu tiên vùng có chữ thật phi-status.
      const candidates = allMatches([
        '[aria-label*="Phụ đề" i]',
        '[aria-label*="Captions" i]',
        '[aria-live="polite"]',
      ]).filter((el) => {
        try {
          if (el.matches('button, [role="button"]')) return false;
          if (el.closest('button, [role="button"]')) return false;
        } catch (e) { /* giữ lại xét tiếp */ }
        return true;
      });
      for (const el of candidates) {
        try {
          const t = visibleText(el);
          if (t && !meet.CAPTION_STATUS_PATTERNS.some((re) => re.test(t))) return el;
        } catch (e) { /* bỏ qua */ }
      }
      return candidates[0] || null;
    },
    // Text hệ thống của Meet — không phải lời nói (đã thấy "closed_caption_off" lọt vào transcript).
    CAPTION_STATUS_PATTERNS: [
      /closed.?captions?/i,
      /captions?\s+(off|disabled|unavailable)/i,
      /phụ đề.*(tắt|không khả dụng)/i,
      /live captions?/i,
      /turn (on|off) captions?/i,
    ],
    parseCaptionNode(node, rosterNames) {
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
      // Meet mới render "Tên nội dung" KHÔNG dấu hai chấm (thấy thực tế:
      // "You Giữ lại nha..."). Khớp tiền tố tên trong roster (lấy khớp dài nhất).
      const stripped = meet.stripSpeakerPrefix(text, rosterNames);
      if (stripped.name) return { name: stripped.name, text: stripped.body };
      // Không bóc được tên mà text lại nhắc tới caption → status, bỏ.
      if (/caption/i.test(text)) return null;
      return { name: "", text };
    },
    // Key để so gộp caption: tước prefix tên roster + "You"/"Bạn".
    // Pure — test được.
    captionMergeKey(text, rosterNames) {
      const s = meet.stripSpeakerPrefix(String(text || ""), rosterNames);
      let body = s.name ? s.body : String(text || "");
      const m = body.match(/^(you|bạn)\s+(.+)$/i);
      if (m) body = m[2];
      return body.trim();
    },
    // Tên người gửi trong block chat: roster-prefix dài nhất → "Name:" → You/Bạn.
    // Trả "" khi không xác định được (block chat BẮT BUỘC có sender, nếu không là UI).
    // Pure — test được.
    senderOfChatText(text, rosterNames) {
      const t = String(text || "").trim();
      if (!t) return "";
      const stripped = meet.stripSpeakerPrefix(t, rosterNames);
      if (stripped.name) return stripped.name;
      const m = t.match(/^([^:]{1,60}):\s+.+$/s);
      if (m && m[1].trim()) return m[1].trim();
      const y = t.match(/^(you|bạn)\b\s+.+/i);
      if (y) return y[1];
      return "";
    },
    // Tước prefix "Tên " ở đầu câu (khớp dài nhất trong roster).
    // Trả { name, body }. Pure — test được.
    stripSpeakerPrefix(text, rosterNames) {
      const t = String(text || "");
      let best = "";
      if (Array.isArray(rosterNames)) {
        const low = t.toLowerCase();
        for (const n of rosterNames) {
          const nn = String(n || "").trim();
          if (!nn) continue;
          const nl = nn.toLowerCase();
          if ((low === nl || low.startsWith(nl + " ")) && nn.length > best.length) best = nn;
        }
      }
      if (best) {
        const rest = t.slice(best.length).trim();
        if (rest) return { name: best, body: rest };
      }
      return { name: "", body: t };
    },
    // Hai mảnh caption có gộp thành một câu không? So PHẦN THÂN (đã tước tên)
    // vì element tên của Meet nhấp nháy (có/không) giữa chừng — so cả tên như
    // cũ là mỗi lần nhấp nháy ngắt câu, stack từng mảnh (thấy thực tế).
    // Pure — test được.
    shouldMergeCaption(prev, next) {
      if (!prev || !next) return false;
      const a = String(prev.body || "").trim();
      const b = String(next.body || "").trim();
      if (!a || !b) return false;
      return a === b || b.startsWith(a) || a.startsWith(b);
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
      probe("chat:anchor-chain", () => {
        // Root không thấy mà panel đang mở: leo từ ô "Send a message" lên 5 tầng
        // (chỉ tag#id.class, không HTML đầy) để viết selector tới đúng node tin nhắn.
        const anchor = meet.findChatAnchor();
        if (!anchor) return { found: false };
        const chain = [];
        let el = anchor;
        for (let i = 0; i < 6 && el && el.tagName; i++) {
          chain.push(
            el.tagName +
              (el.id ? "#" + el.id : "") +
              (el.className && typeof el.className === "string"
                ? "." + el.className.trim().split(/\s+/).slice(0, 4).join(".")
                : "")
          );
          el = el.parentElement;
        }
        return { found: true, chain: chain.join(" < ") };
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
