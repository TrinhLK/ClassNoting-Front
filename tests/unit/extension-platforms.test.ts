import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("extension — version đồng bộ manifest/background/content", () => {
  it("CODE_VERSION 3 nơi trùng nhau (hết cảnh không biết đang chạy bản nào)", () => {
    const manifest = JSON.parse(readFileSync(path.join(EXT, "../manifest.json"), "utf-8")) as {
      version: string;
      permissions: string[];
    };
    const bg = readFileSync(path.join(EXT, "background.js"), "utf-8");
    const content = readFileSync(path.join(EXT, "content.js"), "utf-8");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(bg).toContain(`const CODE_VERSION = "${manifest.version}"`);
    expect(content).toContain(`const CODE_VERSION = "${manifest.version}"`);
    expect(manifest.permissions).toContain("scripting");
  });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(__dirname, "../../extension/src");

function loadPlatforms() {
  const shared = readFileSync(path.join(EXT, "shared.js"), "utf-8");
  const platforms = readFileSync(path.join(EXT, "platforms.js"), "utf-8");
  // Chạy trong global scope để IIFE gắn vào globalThis (giống content script).
  (0, eval)(shared);
  (0, eval)(platforms);
  const g = globalThis as unknown as {
    ClassNotingPlatforms: { meet: Record<string, (...a: never[]) => unknown> };
    ClassNotingShared: Record<string, (...a: never[]) => unknown>;
  };
  return g.ClassNotingPlatforms.meet;
}

function loadShared() {
  const g = globalThis as unknown as {
    ClassNotingShared: Record<string, (...a: never[]) => unknown>;
  };
  return g.ClassNotingShared;
}

let meet: ReturnType<typeof loadPlatforms>;

beforeAll(() => {
  meet = loadPlatforms();
});

const setBody = (html: string) => {
  document.body.innerHTML = html;
};

describe("extension shared.js — gộp câu ASR (chống vụn đây/đây/đây)", () => {
  it("uses local caption evidence for mic and never assigns remote audio to a local caption", () => {
    const resolve = loadShared().resolveAudioSpeaker as (...args: any[]) => any;
    const ctx = { fallbackName: 'Chưa xác định', activeSpans: [], captionLines: [
      {name: 'Chủ phòng', text: 'Xin chào', start: 1, end: 4, isSelf: true},
      {name: 'Khách', text: 'Chào bạn', start: 5, end: 8, isSelf: false},
    ] };
    expect(resolve('mic', 2, 3, ctx)).toMatchObject({name: 'Chủ phòng', uncertain: true, speakerSource: 'caption'});
    expect(resolve('tab', 2, 3, ctx).name).toBe('Chưa xác định');
    expect(resolve('mic', 6, 7, ctx).name).toBe('Chủ phòng');
    expect(resolve('tab', 6, 7, ctx).name).toBe('Khách');
    expect(resolve('mic', 9, 10, ctx).name).toBe('Chủ phòng');
  });
  it("shouldMergeSeg: cùng người + gap nhỏ thì gộp, khác người/gap lớn thì tách", () => {
    const shared = loadShared();
    const shouldMergeSeg = shared.shouldMergeSeg as (
      p: { speaker: string; start: number; end: number },
      n: { speaker: string; start: number; end: number },
      g?: number
    ) => boolean;
    const seg = (speaker: string, start: number, end: number) => ({ speaker, start, end });
    // Ca thật: "đây", "đây", "đây" cùng người, gap nhỏ → gộp
    expect(shouldMergeSeg(seg("Lê Khánh Trịnh", 0, 1), seg("Lê Khánh Trịnh", 1.2, 2))).toBe(true);
    expect(shouldMergeSeg(seg("Lê Khánh Trịnh", 0, 2), seg("Someone Else", 2.5, 4))).toBe(false);
    expect(shouldMergeSeg(seg("A", 0, 2), seg("A", 10, 12))).toBe(false);
    expect(shouldMergeSeg(seg("", 0, 1), seg("A", 1, 2))).toBe(false);
    expect(shouldMergeSeg(seg("A", 0, 1), seg("A", 1, 2), 0.5)).toBe(true);
    expect(shouldMergeSeg(seg("A", 0, 1), seg("A", 1.5, 2), 0.5)).toBe(false);
  });

  it("mergeText nối chồng lấp, không lặp từ", () => {
    const shared = loadShared();
    const mergeText = shared.mergeText as (a: string, b: string) => string;
    expect(mergeText("đây", "đây")).toBe("đây");
    expect(mergeText("năm mười", "mười triệu")).toBe("năm mười triệu");
    expect(mergeText("xin chào", "chào bạn")).toBe("xin chào bạn");
  });
});

describe("extension platforms.js — roster (Meet)", () => {
  it("cleanRosterName rút tên nhân đôi, bỏ hậu tố, chặn header", () => {
    const clean = meet.cleanRosterName as (s: string) => string;
    expect(clean("Trình Lê Khánh Trình Lê Khánh")).toBe("Trình Lê Khánh");
    expect(clean("Trịnh Lê Khánh (You)")).toBe("Trịnh Lê Khánh");
    expect(clean("Contributors")).toBe("");
    expect(clean("Waiting to be admitted")).toBe("");
    expect(clean("123")).toBe("");
    expect(clean("Nguyễn Văn A")).toBe("Nguyễn Văn A");
  });

  it("scrapeRoster: tile có overlay tên (ca chuẩn)", () => {
    setBody(`
      <div data-participant-id="spaces/x/devices/1">
        <div data-self-name>Trịnh Lê Khánh</div>
      </div>`);
    const names = meet.scrapeRoster() as { name: string }[];
    expect(names.map((r) => r.name)).toEqual(["Trịnh Lê Khánh"]);
  });

  it("scrapeRoster: tile không tên, tên nằm ở container cha (ca diag thật)", () => {
    setBody(`
      <div class="tile-wrap">
        <div data-participant-id="spaces/x/devices/2" aria-label=""></div>
        <div class="name-row">Trịnh Lê Khánh</div>
      </div>`);
    const names = meet.scrapeRoster() as { name: string }[];
    expect(names.map((r) => r.name)).toEqual(["Trịnh Lê Khánh"]);
  });

  it("scrapeRoster: bỏ qua ô search trong people-panel", () => {
    setBody(`
      <div aria-label="People panel">
        <input aria-label="Search for people" placeholder="Search for people" />
        <div role="listitem">Trịnh Lê Khánh\nMeeting host</div>
      </div>`);
    const names = meet.scrapeRoster() as { name: string }[];
    expect(names.map((r) => r.name)).toEqual(["Trịnh Lê Khánh"]);
  });

  it("scrapeRoster: item gộp tên+role không khoảng trắng vẫn tách được", () => {
    setBody(`
      <div aria-label="People panel">
        <div role="listitem"><span>Trịnh Lê Khánh</span><span>Meeting host</span></div>
      </div>`);
    const names = meet.scrapeRoster() as { name: string }[];
    expect(names.map((r) => r.name)).toEqual(["Trịnh Lê Khánh"]);
  });
});

describe("extension platforms.js — chat (Meet)", () => {
  it("waits for ownership metadata on an optimistic native Meet message", () => {
    setBody('<div data-message-id="temporary"><div jsname="dTKtvb">Xin chào</div></div>');
    expect(meet.parseChatBlock(document.querySelector('[data-message-id]')!, [], 'An')).toBeNull();
    document.querySelector('[data-message-id]')!.innerHTML = '<div class="chmVPb"><div jsname="dTKtvb">Xin chào</div></div>';
    expect(meet.parseChatBlock(document.querySelector('[data-message-id]')!, [], 'An')).toEqual({sender:'An',text:'Xin chào'});
  });
  it("reads microphone controls after Meet moves them to Picture-in-Picture", () => {
    setBody('');
    const pip = document.implementation.createHTMLDocument('Meet PiP');
    pip.body.innerHTML = '<button aria-label="Turn off microphone"></button>';
    vi.stubGlobal('documentPictureInPicture', {window:{document:pip}});
    try {
      expect(meet.microphoneMuted()).toBe(false);
      pip.querySelector('button')!.setAttribute('aria-label', 'Turn on microphone');
      expect(meet.microphoneMuted()).toBe(true);
    } finally { vi.unstubAllGlobals(); }
    expect(meet.microphoneMuted()).toBeNull();
  });
  it("does not emit empty-panel UI or partially rendered anonymous bubbles in current Meet", () => {
    setBody(`<div class="WUFI9b"><h2>In-call messages</h2><button><div>arrow_backBack</div></button>
      <div>No chat messages yet</div><div class="beTDc"><div jsname="dTKtvb">Tin đang render</div></div>
      <textarea aria-label="Send a message"></textarea></div>`);
    expect(meet.findChatBlocks(document.querySelector('.WUFI9b')!)).toEqual([]);
  });
  it("parses caption speaker and content from the same row, excluding neighboring speakers and controls", () => {
    setBody(`<div aria-label="Captions"><div class="nMcdL"><span class="NWpY1d">An</span><div class="ygicle">Chào Bình</div></div>
      <div class="nMcdL"><span class="NWpY1d">Bình</span><div class="ygicle" id="words">Chào An</div></div><button>Jump to bottom</button></div>`);
    expect(meet.parseCaptionNode(document.querySelector('#words')!, [])).toEqual({name:'Bình',text:'Chào An'});
    expect(meet.parseCaptionNode(document.querySelector('[aria-label="Captions"]')!, [])).toEqual({name:'Bình',text:'Chào An'});
  });
  it("reads current Meet records instead of nested pin buttons and keeps grouped senders", () => {
    setBody(`<section id="live-chat">
      <div class="aops0b"><div class="HNucUd">9:26 PM</div><div>
        <div data-message-id="own"><div class="chmVPb"><div jsname="dTKtvb">Xin chào</div>
          <div>Hover over a message to pin it</div><button data-message-id="own">keep</button></div></div>
      </div></div>
      <div class="aops0b"><div class="HNucUd">Nguyễn An 9:27 PM</div><div>
        <div data-message-id="remote"><div jsname="dTKtvb">Kế hoạch: kiểm thử</div><button data-message-id="remote">keep</button></div>
        <div data-message-id="remote2"><div jsname="dTKtvb">Kế hoạch: kiểm thử</div></div>
      </div></div></section>`);
    const blocks = meet.findChatBlocks(document.querySelector('#live-chat')!) as Element[];
    expect(blocks.map(el => el.getAttribute('data-message-id'))).toEqual(['own', 'remote', 'remote2']);
    const parse = meet.parseChatBlock as (el: Element, roster: string[], self: string) => unknown;
    expect(parse(blocks[0], [], 'Chủ phòng')).toEqual({sender: 'Chủ phòng', text: 'Xin chào'});
    expect(parse(blocks[1], [], 'Chủ phòng')).toEqual({sender: 'Nguyễn An', text: 'Kế hoạch: kiểm thử'});
    expect(parse(blocks[2], [], 'Chủ phòng')).toEqual({sender: 'Nguyễn An', text: 'Kế hoạch: kiểm thử'});
  });

  it("reads the current Meet name overlay while excluding hidden icons", () => {
    setBody(`<div data-participant-id="p1"><button>More options</button>
      <span class="notranslate" aria-hidden="true">mic_off</span>
      <span class="notranslate">Nguyễn An</span></div>`);
    expect(meet.scrapeRoster()).toEqual([{id:'p1', name:'Nguyễn An'}]);
  });
  it("chatRoot: bỏ qua nút mở panel, ưu tiên container có tin nhắn", () => {
    setBody(`
      <button aria-label="Chat with everyone">Chat</button>
      <div role="log" aria-label="In-call messages">
        <div role="listitem"><span data-sender-name>Nguyen A</span><span data-message-text>Xin chào</span></div>
      </div>`);
    const root = meet.chatRoot() as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root!.tagName).not.toBe("BUTTON");
    expect(root!.getAttribute("role")).toBe("log");
  });

  it("chatRoot: ưu tiên panel In-call messages khi Meet hiển thị notice Continuous chat off", () => {
    setBody(`
      <div role="log" id="other-log"><div>Caption update 2:46 PM</div></div>
      <aside class="call-chat-panel" aria-label="In-call messages">
        <div class="notice">Continuous chat is turned off</div>
        <div class="message-list">
          <div class="message" id="own-message">
            <span>Đức Anh có nghe không?</span><span>2:47 PM</span>
          </div>
        </div>
        <div class="composer"><div role="textbox" aria-label="Send a message">Send a message</div></div>
      </aside>`);
    const root = meet.chatRoot() as HTMLElement | null;
    expect(root?.className).toBe("call-chat-panel");
    const blocks = meet.findChatBlocks(root!) as Element[];
    expect(blocks.map((block) => block.id)).toContain("own-message");
    const parse = meet.parseChatBlock as (
      block: Element,
      roster?: string[],
      self?: string
    ) => { text: string; sender: string } | null;
    expect(parse(document.querySelector("#own-message")!, [], "Lê Khánh Trinh")).toEqual({
      text: "Đức Anh có nghe không?",
      sender: "Chưa xác định",
    });
  });

  it("chatRoot: bỏ qua composer bị ẩn còn sót lại khi mở panel mới", () => {
    setBody(`
      <section id="old-panel" style="display:none">
        <div class="messages">tin cũ trong panel</div>
        <div role="textbox" aria-label="Send a message"></div>
      </section>
      <aside id="current-panel" aria-label="In-call messages">
        <div class="messages"><div class="message" id="current-message">tin mới 3:09 PM</div></div>
        <div role="textbox" aria-label="Send a message"></div>
      </aside>`);
    const root = meet.chatRoot() as HTMLElement | null;
    expect(root?.id).toBe("current-panel");
  });

  it("parseChatNode: loại rác UI, giữ tin nhắn thật", () => {
    const parse = meet.parseChatNode as (n: Element) => { text: string; sender: string } | null;
    setBody(`
      <button aria-label="Chat">chat_bubble</button>
      <div id="m1"><span data-sender-name>Nguyen A</span><span data-message-text>giờ thì chat đây</span></div>`);
    const btn = document.querySelector("button")!;
    expect(parse(btn)).toBeNull();
    const msg = document.querySelector("#m1")!;
    expect(parse(msg)).toEqual({ text: "giờ thì chat đây", sender: "Nguyen A" });
  });

  it("parseChatNode: text dạng snake_case không sender thì loại", () => {
    const parse = meet.parseChatNode as (n: Element) => unknown;
    setBody(`<div id="x">chat_bubble_outline</div>`);
    expect(parse(document.querySelector("#x")!)).toBeNull();
  });
});

describe("extension platforms.js — caption (Meet)", () => {
  it("parseCaptionNode: loại status, bóc Tên: nội dung", () => {
    const parse = meet.parseCaptionNode as (
      n: Element,
      roster?: string[]
    ) => { name: string; text: string } | null;
    setBody(`
      <div id="st">closed_caption_off</div>
      <div id="cap">You: Giữ lại nha bắt cc này</div>
      <div id="short">Ok</div>`);
    expect(parse(document.querySelector("#st")!)).toBeNull();
    expect(parse(document.querySelector("#cap")!)).toEqual({
      name: "You",
      text: "Giữ lại nha bắt cc này",
    });
    expect(parse(document.querySelector("#short")!)).toBeNull();
  });

  it("parseCaptionNode: không dấu hai chấm thì khớp tiền tố tên roster (ca diag thật)", () => {
    const parse = meet.parseCaptionNode as (
      n: Element,
      roster?: string[]
    ) => { name: string; text: string } | null;
    setBody(`<div id="cap2">You Giữ lại nha bắt cc này</div>`);
    expect(parse(document.querySelector("#cap2")!, ["You", "Trịnh Lê Khánh"])).toEqual({
      name: "You",
      text: "Giữ lại nha bắt cc này",
    });
    // Không roster → giữ nguyên text, tên rỗng (uncertain)
    expect(parse(document.querySelector("#cap2")!)).toEqual({
      name: "",
      text: "You Giữ lại nha bắt cc này",
    });
  });

  it("captionRoot: khớp container aria-live", () => {
    setBody(`<div aria-live="polite" class="vNKgIf">You Alo 1 2 3</div>`);
    const root = meet.captionRoot() as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root!.className).toContain("vNKgIf");
  });
});

describe("extension platforms.js — caption merge key + gộp câu", () => {
  it("captionMergeKey tước tên roster và You/Bạn", () => {
    const key = meet.captionMergeKey as (t: string, r?: string[]) => string;
    expect(key("Trình Lê Khánh Khác nhau không?", ["Trình Lê Khánh"])).toBe("Khác nhau không?");
    expect(key("You Khác nhau không?", ["Trình Lê Khánh"])).toBe("Khác nhau không?");
    expect(key("Khác nhau không?", ["Trình Lê Khánh"])).toBe("Khác nhau không?");
  });

  it("shouldMergeCaption gộp khi thân trùng nhau dù tên nhấp nháy (ca stack thật)", () => {
    const merge = meet.shouldMergeCaption as (a: { body: string }, b: { body: string }) => boolean;
    expect(merge({ body: "Khác nhau không" }, { body: "Khác nhau không, anh đang nói" })).toBe(true);
    expect(merge({ body: "Khác nhau không, anh đang nói" }, { body: "Khác nhau không" })).toBe(true);
    expect(merge({ body: "Xin chào" }, { body: "Tạm biệt" })).toBe(false);
    expect(merge({ body: "" }, { body: "abc" })).toBe(false);
  });

  it("senderOfChatText bóc sender nhiều dạng", () => {
    const senderOf = meet.senderOfChatText as (t: string, r?: string[]) => string;
    expect(senderOf("Trình Lê Khánh tutewt 10:38 PM", ["Trình Lê Khánh"])).toBe("Trình Lê Khánh");
    expect(senderOf("You: hello", [])).toBe("You");
    expect(senderOf("You tutewt", [])).toBe("You");
    expect(senderOf("Send a message", [])).toBe("");
    expect(senderOf("In-call messages", [])).toBe("");
  });
});

describe("extension platforms.js — chat root từ anchor + parse cấp block", () => {
  it("chatRoot tìm panel từ ô Send a message khi selector chính trượt", () => {
    // DOM thật: block tách dòng + timestamp nên text nhánh đủ dài (như Meet render).
    setBody(`
      <div class="side-panel">
        <div class="msg-list">
          <div class="msg">
            <span>You</span>
            <span>tutewt</span>
            <span>10:38 PM</span>
          </div>
        </div>
        <div class="composer"><div role="textbox" aria-label="Send a message"></div></div>
      </div>`);
    const root = meet.chatRoot() as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root!.className).toContain("side-panel");
  });

  it("parseChatNode cấp block: giữ tin thật, loại composer", () => {
    const parse = meet.parseChatNode as (
      n: Element,
      root?: Element | null,
      roster?: string[]
    ) => { text: string; sender: string } | null;
    setBody(`
      <div id="panel">
        <div class="msg" id="m1">
          <span>You</span>
          <span>tutewt</span>
          <span>10:38 PM</span>
        </div>
        <div class="composer" id="c1"><div role="textbox" aria-label="Send a message">Send a message</div></div>
      </div>`);
    const panel = document.querySelector("#panel")!;
    const leaf = document.querySelector("#m1 span")!;
    expect(parse(leaf, panel, [])).toEqual({ text: "tutewt", sender: "You" });
    const composerLeaf = document.querySelector("#c1 div")!;
    expect(parse(composerLeaf, panel, [])).toBeNull();
  });
});

describe("extension platforms.js — chat blocks theo timestamp", () => {
  const PANEL = `
    <div id="chatpanel">
      <div class="msg" id="m1">
        <span>Trình Lê Khánh</span>
        <span>có ok không</span>
        <span>10:39 AM</span>
      </div>
      <div class="msg" id="m2">
        <span>test</span>
        <span>10:49 AM</span>
      </div>
      <div class="composer"><div role="textbox" aria-label="Send a message">Send a message</div></div>
    </div>`;

  it("findChatBlocks tìm đúng 2 block tin nhắn", () => {
    setBody(PANEL);
    const blocks = meet.findChatBlocks(document.querySelector("#chatpanel")!) as Element[];
    expect(blocks.map((b) => b.id).sort()).toEqual(["m1", "m2"]);
  });

  it("vẫn lấy bubble khi thông báo Continuous chat nằm chung row với timestamp", () => {
    setBody(`
      <aside id="chatpanel">
        <div class="row" id="own-row">
          <div class="notice">Continuous chat is turned off. Messages will not be saved for meeting participants when the call ends.</div>
          <div class="time">3:08 PM</div>
          <div class="bubble">alo tôi đây</div>
        </div>
        <div class="composer"><div role="textbox" aria-label="Send a message">Send a message</div></div>
      </aside>`);
    const panel = document.querySelector("#chatpanel")!;
    const blocks = meet.findChatBlocks(panel) as Element[];
    expect(blocks.map((b) => b.id)).toContain("own-row");
    const parse = meet.parseChatBlock as (
      b: Element,
      roster?: string[],
      self?: string
    ) => { text: string; sender: string } | null;
    expect(parse(document.querySelector("#own-row")!, [], "Trịnh Lê Khánh")).toEqual({
      text: "alo tôi đây",
      sender: "Chưa xác định",
    });
  });

  it("parseChatBlock: tin có tên + tin của mình (không tên) + loại composer", () => {
    const parse = meet.parseChatBlock as (
      b: Element,
      roster?: string[],
      self?: string
    ) => { text: string; sender: string } | null;
    setBody(PANEL);
    const panel = document.querySelector("#chatpanel")!;
    expect(parse(document.querySelector("#m1")!, ["Trình Lê Khánh"], "Bạn")).toEqual({
      text: "có ok không",
      sender: "Trình Lê Khánh",
    });
    // Thiếu tên không đủ bằng chứng để gán cho chủ tài khoản
    expect(parse(document.querySelector("#m2")!, ["Trình Lê Khánh"], "Bạn")).toEqual({
      text: "test",
      sender: "Chưa xác định",
    });
    // Composer không bao giờ thành tin nhắn
    expect(parse(document.querySelector(".composer")!, ["Trình Lê Khánh"], "Bạn")).toBeNull();
  });
});

describe("extension platforms.js — chat blocks không timestamp (ca bubble trơn)", () => {
  const PANEL_NO_TIME = `
    <div id="chatpanel2">
      <div class="notice">Continuous chat is turned off</div>
      <div class="bubble" id="b1"><span>tes thử</span></div>
      <div class="bubble" id="b2"><span>chưa thấy gì hết</span></div>
      <div class="composer"><div role="textbox" aria-label="Send a message">Send a message</div></div>
    </div>`;

  it("findChatBlocks tuyến cấu trúc vẫn bắt được bubble", () => {
    setBody(PANEL_NO_TIME);
    const blocks = meet.findChatBlocks(document.querySelector("#chatpanel2")!) as Element[];
    expect(blocks.map((b) => b.id).sort()).toEqual(["b1", "b2"]);
  });

  it("parseChatBlock bubble thiếu bằng chứng người gửi giữ Chưa xác định, loại notice/composer", () => {
    const parse = meet.parseChatBlock as (
      b: Element,
      roster?: string[],
      self?: string
    ) => { text: string; sender: string } | null;
    setBody(PANEL_NO_TIME);
    const panel = document.querySelector("#chatpanel2")!;
    expect(parse(document.querySelector("#b1")!, [], "Bạn")).toEqual({
      text: "tes thử",
      sender: "Chưa xác định",
    });
    expect(parse(panel.querySelector(".notice")!, [], "Bạn")).toBeNull();
    expect(parse(panel.querySelector(".composer")!, [], "Bạn")).toBeNull();
  });
});

describe("extension platforms.js — describe() (chẩn đoán)", () => {
  it("chat:anchor-chain leo từ ô Send a message khi root trượt", () => {
    setBody(`
      <div class="meet-chat-panel xyz">
        <div class="msg-list abc">
          <div class="msg">tutewt</div>
        </div>
        <div class="composer">
          <div role="textbox" aria-label="Send a message"></div>
        </div>
      </div>`);
    const describe = meet.describe as () => {
      checks: { label: string; found?: boolean; chain?: string }[];
    };
    const d = describe();
    const anchor = d.checks.find((c) => c.label === "chat:anchor-chain")!;
    expect(anchor.found).toBe(true);
    // Chuỗi leo từ textbox lên: composer → panel → body (đủ để viết selector
    // tới panel rồi query tin nhắn bên trong, không cần nhánh sibling msg-list).
    expect(anchor.chain).toContain("composer");
    expect(anchor.chain).toContain("meet-chat-panel");
  });

  it("findChatAnchor bắt ô nhập qua placeholder (ca thật: không có aria-label)", () => {
    const find = meet.findChatAnchor as () => Element | null;
    setBody(`
      <div class="panel">
        <div class="composer"><textarea placeholder="Send a message"></textarea></div>
      </div>`);
    const anchor = find();
    expect(anchor).not.toBeNull();
    expect(anchor!.tagName).toBe("TEXTAREA");
  });

  it("chat:anchor-chain found=false khi không có ô chat", () => {
    setBody(`<div><p>Không có gì</p></div>`);
    const describe = meet.describe as () => {
      checks: { label: string; found?: boolean }[];
    };
    const d = describe();
    const anchor = d.checks.find((c) => c.label === "chat:anchor-chain")!;
    expect(anchor.found).toBe(false);
  });
});

describe("Meet structured chat records", () => {
  it("reads sibling message body instead of stopping at sender/timestamp header", () => {
    document.body.innerHTML = `<aside id="panel"><div data-message-id="m1" data-sender-name="Lan"><div>Lan <span>14:30</span></div><div data-message-text>Xin chào</div></div><textarea aria-label="Message everyone"></textarea></aside>`;
    const platform = loadPlatforms() as any;
    const root = platform.chatRoot();
    expect(root.id).toBe("panel");
    const blocks = platform.findChatBlocks(root);
    expect(blocks).toHaveLength(1);
    expect(platform.parseChatBlock(blocks[0], [], "Bạn")).toEqual({ sender: "Lan", text: "Xin chào" });
    expect(platform.parseChatNode(blocks[0].querySelector("span"), root, [])).toEqual({ sender: "Lan", text: "Xin chào" });
  });
  it("preserves short and long messages and never reads the composer", () => {
    const message = "Nội dung ".repeat(300);
    document.body.innerHTML = `<aside><div data-message-id="1"><span data-sender-name="Minh"></span><div data-message-text>👍</div></div><div data-message-id="2"><span data-sender-name="Lan"></span><div data-message-text>${message}</div></div><textarea aria-label="Gửi một tin nhắn">chưa gửi</textarea></aside>`;
    const platform = loadPlatforms() as any;
    const root = platform.chatRoot();
    const parsed = platform.findChatBlocks(root).map((b: Element) => platform.parseChatBlock(b, [], "Bạn"));
    expect(parsed).toEqual([{ sender: "Minh", text: "👍" }, { sender: "Lan", text: message.trim() }]);
  });
});

describe("chat sender attribution regression", () => {
  it("does not treat a message prefix as a name or assume unnamed messages are mine", () => {
    const platform = loadPlatforms() as any;
    const block = document.createElement("div");
    block.textContent = "Chốt họp với VNExpress: 2h chiều thứ 2 ngày 19/10/2026";
    expect(platform.parseChatBlock(block, [], "Lê Khánh Trình")).toEqual({ sender: "Chưa xác định", text: block.textContent });
  });
  it("reads Lien's link and resolves explicit You to the owner without losing the colon", () => {
    const platform = loadPlatforms() as any;
    document.body.innerHTML = `<div id="chat"><div data-message-id="link" data-sender-name="Lien Nguyen"><div data-message-text>https://docs.google.com/document/d/example</div></div><div data-message-id="close" data-sender-name="You"><div data-message-text>Chốt họp với VNExpress: 2h chiều thứ 2 ngày 19/10/2026</div></div></div>`;
    const parsed = platform.findChatBlocks(document.querySelector("#chat")).map((block: Element) => platform.parseChatBlock(block, [], "Lê Khánh Trình"));
    expect(parsed).toEqual([{ sender: "Lien Nguyen", text: "https://docs.google.com/document/d/example" }, { sender: "Lê Khánh Trình", text: "Chốt họp với VNExpress: 2h chiều thứ 2 ngày 19/10/2026" }]);
  });
});


describe("Meet real UI chat panel regression", () => {
  it("ignores the send button and excludes the chat live region from captions", () => {
    const platform = loadPlatforms() as any;
    document.body.innerHTML = `<section id="panel"><h2>In-call messages</h2><div aria-live="polite"><div>1:55 PM <span>[TEST] Chốt họp: thứ hai</span></div></div><div><button aria-label="Send a message">Send a message</button><textarea aria-label="Send a message"></textarea></div></section>`;
    expect(platform.findChatAnchor().tagName).toBe("TEXTAREA");
    expect(platform.chatRoot().id).toBe("panel");
    expect(platform.findChatBlocks(platform.chatRoot()).length).toBeGreaterThan(0);
    expect(platform.captionRoot()).toBeNull();
  });
});

describe('caption delay and UI roster controls', () => {
  it('filters Meet icon ligatures without filtering actual names', () => {
    const clean = meet.cleanRosterName as (...args: any[]) => any;
    expect(clean('arrow_back')).toBe('');
    expect(clean('close')).toBe('');
    expect(clean('Closen An')).toBe('Closen An');
  });
  it('recovers opening words only from matching caption text and the correct audio source', () => {
    const resolve = loadShared().resolveCaptionPrefix as (...args: any[]) => any;
    const captions = [{name:'An', text:'Câu 1 chúng tôi bắt đầu kiểm thử', start:12.8,end:15,isSelf:false}];
    expect(resolve('tab',10,12.8,'câu một chúng tôi',captions)).toMatchObject({name:'An',uncertain:true});
    expect(resolve('mic',10,12.8,'câu một chúng tôi',captions)).toBeNull();
    expect(resolve('tab',10,12.8,'câu một nội dung khác',captions)).toBeNull();
    expect(resolve('tab',9,12.8,'câu một chúng tôi',captions)).toBeNull();
    expect(resolve('tab',10,12.8,'chúng tôi',captions)).toBeNull();
    expect(resolve('tab',10,12.8,'câu một chúng tôi',[...captions,{name:'Bình',text:'Câu trước',start:9,end:11,isSelf:false}])).toBeNull();
    expect(resolve('tab',10,12.8,'câu một chúng tôi',[...captions,{...captions[0],name:'Bình'}])).toBeNull();
  });
});

it('local mic requires a uniquely confirmed Meet account and never borrows a remote account', () => {
  const resolve = loadShared().resolveAudioSpeaker as (...args: any[]) => any;
  const ctx = {fallbackName:'Chưa xác định',activeSpans:[],captionLines:[
    {name:'Chủ phòng',start:10,end:12,isSelf:true},
    {name:'Khách',start:1,end:3,isSelf:false},
  ]};
  expect(resolve('mic',1,2,ctx).name).toBe('Chủ phòng');
  expect(resolve('mic',1,2,{...ctx,captionLines:[ctx.captionLines[1]]}).name).toBe('Chưa xác định');
  expect(resolve('mic',1,2,{...ctx,captionLines:[...ctx.captionLines,{name:'Tài khoản khác',start:15,end:16,isSelf:true}]}).name).toBe('Chưa xác định');
});

it('uses native participant IDs without appending People controls or visitor badges as accounts', () => {
  setBody(`<div data-participant-id="p1"><span class="notranslate">Chủ phòng</span></div>
    <div data-participant-id="p2"><span class="notranslate">Trình Lê Khánh</span></div>
    <aside aria-label="People panel"><h2>People</h2>
      ${['Back','mic_off','person_add','devicesmore_vertMore actions','more_vert','Trình Lê Khánhdomain_disabledVisitor','devices'].map(x=>`<button>${x}</button>`).join('')}
    </aside>`);
  expect(meet.scrapeRoster()).toEqual([{id:'p1',name:'Chủ phòng'},{id:'p2',name:'Trình Lê Khánh'}]);
});
