import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("extension — version đồng bộ manifest/background/content", () => {
  it("CODE_VERSION 3 nơi trùng nhau (hết cảnh không biết đang chạy bản nào)", () => {
    const manifest = JSON.parse(readFileSync(path.join(EXT, "../manifest.json"), "utf-8")) as {
      version: string;
    };
    const bg = readFileSync(path.join(EXT, "background.js"), "utf-8");
    const content = readFileSync(path.join(EXT, "content.js"), "utf-8");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(bg).toContain(`const CODE_VERSION = "${manifest.version}"`);
    expect(content).toContain(`const CODE_VERSION = "${manifest.version}"`);
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
  };
  return g.ClassNotingPlatforms.meet;
}

let meet: ReturnType<typeof loadPlatforms>;

beforeAll(() => {
  meet = loadPlatforms();
});

const setBody = (html: string) => {
  document.body.innerHTML = html;
};

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
    // Tin của chính mình không hiện tên → gán selfName
    expect(parse(document.querySelector("#m2")!, ["Trình Lê Khánh"], "Bạn")).toEqual({
      text: "test",
      sender: "Bạn",
    });
    // Composer không bao giờ thành tin nhắn
    expect(parse(document.querySelector(".composer")!, ["Trình Lê Khánh"], "Bạn")).toBeNull();
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
