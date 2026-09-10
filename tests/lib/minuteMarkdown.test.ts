import { describe, it, expect } from "vitest";
import { parseMarkdown } from "@/app/lib/minuteMarkdown";

describe("parseMarkdown — markdown thông thường", () => {
  it("input rỗng trả về chuỗi rỗng", () => {
    expect(parseMarkdown("")).toBe("");
  });

  it("render heading 1, 2, 3", () => {
    const html = parseMarkdown("# H1\n## H2\n### H3");
    expect(html).toContain("<h1>H1</h1>");
    expect(html).toContain("<h2>H2</h2>");
    expect(html).toContain("<h3>H3</h3>");
  });

  it("render bullet list ul", () => {
    const html = parseMarkdown("- A\n- B");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>A</li>");
    expect(html).toContain("<li>B</li>");
    expect(html).toContain("</ul>");
  });

  it("render numbered list ol", () => {
    const html = parseMarkdown("1. A\n2. B");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>A</li>");
    expect(html).toContain("<li>B</li>");
    expect(html).toContain("</ol>");
  });

  it("render paragraph thường", () => {
    const html = parseMarkdown("Đoạn văn thường");
    expect(html).toContain("<p>Đoạn văn thường</p>");
  });

  it("render bold, italic, code inline", () => {
    const html = parseMarkdown("**bold** *italic* `code`");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>code</code>");
  });

  it("escape HTML trong input", () => {
    const html = parseMarkdown("Có thẻ <script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("parseMarkdown — bảng markdown", () => {
  it("render bảng 2 cột 2 hàng thành <table>", () => {
    const md = "| Tên | Trạng thái |\n|---|---|\n| An | Xong |\n| Bình | Đang làm |";
    const html = parseMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<th>Tên</th>");
    expect(html).toContain("<th>Trạng thái</th>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<td>An</td>");
    expect(html).toContain("<td>Xong</td>");
    expect(html).toContain("<td>Bình</td>");
    expect(html).toContain("<td>Đang làm</td>");
    expect(html).toContain("</table>");
  });

  it("hỗ trợ dòng phân cách căn lề :---, :---:, ---:", () => {
    const md = "| A | B | C |\n|:---|:---:|---:|\n| 1 | 2 | 3 |";
    const html = parseMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  it("render **bold** trong cell", () => {
    const md = "| Mục | Giá trị |\n|---|---|\n| Tên | **An** |";
    const html = parseMarkdown(md);
    expect(html).toContain("<td>");
    expect(html).toContain("<strong>An</strong>");
  });

  it("bảng xen giữa heading và paragraph", () => {
    const md = "## Báo cáo\n\n| Cột 1 | Cột 2 |\n|---|---|\n| A | B |\n\nGhi chú cuối.";
    const html = parseMarkdown(md);
    expect(html).toContain("<h2>Báo cáo</h2>");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>A</td>");
    expect(html).toContain("<p>Ghi chú cuối.</p>");
  });

  it("không render bảng nếu thiếu dòng phân cách", () => {
    const md = "| A | B |\nKhông có dòng phân cách";
    const html = parseMarkdown(md);
    expect(html).not.toContain("<table>");
  });

  it("escape HTML trong cell", () => {
    const md = "| A | B |\n|---|---|\n| <x> | y |";
    const html = parseMarkdown(md);
    expect(html).toContain("&lt;x&gt;");
    expect(html).not.toContain("<x>");
  });
});

describe("parseMarkdown — backward compatible", () => {
  it("markdown không có bảng → render như cũ", () => {
    const md = "## Tiêu đề\nĐoạn văn thường.";
    const html = parseMarkdown(md);
    expect(html).toContain("<h2>Tiêu đề</h2>");
    expect(html).toContain("<p>Đoạn văn thường.</p>");
    expect(html).not.toContain("<table>");
  });
});
