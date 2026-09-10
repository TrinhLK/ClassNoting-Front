import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  inlineMarkdownToHtml,
  summaryToHtml,
  renderHtmlSummary,
} from "@/app/lib/docx/pdfRenderer";

describe("escapeHtml", () => {
  it("escape &, <, >, \", '", () => {
    expect(escapeHtml("<script>alert('x')&\"y\"</script>")).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&amp;&quot;y&quot;&lt;/script&gt;"
    );
  });

  it("text bình thường không bị ảnh hưởng", () => {
    expect(escapeHtml("Xin chào")).toBe("Xin chào");
  });
});

describe("inlineMarkdownToHtml", () => {
  it("**bold** → <strong>", () => {
    expect(inlineMarkdownToHtml("a **b** c")).toBe("a <strong>b</strong> c");
  });

  it("*italic* → <em>", () => {
    expect(inlineMarkdownToHtml("a *b* c")).toBe("a <em>b</em> c");
  });

  it("***bold-italic*** → <strong><em>", () => {
    expect(inlineMarkdownToHtml("***b***")).toBe("<strong><em>b</em></strong>");
  });

  it("escape HTML trước khi áp dụng markdown", () => {
    expect(inlineMarkdownToHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("`code` → <code>", () => {
    expect(inlineMarkdownToHtml("Use `npm` lệnh")).toBe("Use <code>npm</code> lệnh");
  });
});

describe("summaryToHtml — Markdown", () => {
  it("input rỗng trả chuỗi rỗng", () => {
    expect(summaryToHtml("")).toBe("");
  });

  it("render heading 1, 2, 3", () => {
    const html = summaryToHtml("# H1\n## H2\n### H3");
    expect(html).toContain("<h1");
    expect(html).toContain("H1");
    expect(html).toContain("<h2");
    expect(html).toContain("H2");
    expect(html).toContain("<h3");
    expect(html).toContain("H3");
  });

  it("render bullet list ul", () => {
    const html = summaryToHtml("- A\n- B");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("A");
    expect(html).toContain("B");
    expect(html).toContain("</ul>");
  });

  it("render bảng markdown thành <table> HTML", () => {
    const md = "| Tên | Trạng thái |\n|---|---|\n| An | Xong |\n| Bình | Đang làm |";
    const html = summaryToHtml(md);
    expect(html).toContain("<table");
    expect(html).toContain("<thead>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("An");
    expect(html).toContain("Bình");
    expect(html).toContain("</table>");
  });

  it("header cell có styling bold/background", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const html = summaryToHtml(md);
    expect(html).toMatch(/<th[^>]*style="[^"]*font-weight:600/);
  });

  it("bảng xen giữa heading và paragraph", () => {
    const md = "## Báo cáo\n\n| Cột 1 | Cột 2 |\n|---|---|\n| A | B |\n\nGhi chú cuối.";
    const html = summaryToHtml(md);
    expect(html).toContain("<h2");
    expect(html).toContain("<table");
    expect(html).toContain("Ghi chú cuối.");
  });

  it("bảng liên tiếp nhau", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |\n\n| C | D |\n|---|---|\n| 3 | 4 |";
    const html = summaryToHtml(md);
    const tableCount = (html.match(/<table/g) || []).length;
    expect(tableCount).toBe(2);
  });

  it("**bold** trong cell bảng được giữ", () => {
    const md = "| Mục | Giá trị |\n|---|---|\n| Tên | **An** |";
    const html = summaryToHtml(md);
    expect(html).toContain("<strong>An</strong>");
  });

  it("không tạo bảng nếu thiếu dòng phân cách", () => {
    const md = "| A | B |\nKhông có dòng phân cách";
    const html = summaryToHtml(md);
    expect(html).not.toContain("<table");
  });

  it("regression — summary không có bảng render giống bản cũ", () => {
    const md = "## Tiêu đề\nĐoạn văn thường.";
    const html = summaryToHtml(md);
    expect(html).toContain("<h2");
    expect(html).toContain("<p");
    expect(html).not.toContain("<table");
  });
});

describe("renderHtmlSummary — HTML input", () => {
  it("input rỗng trả chuỗi rỗng", () => {
    expect(renderHtmlSummary("")).toBe("");
  });

  it("render <p>, <h1>, <ul>", () => {
    const html = renderHtmlSummary("<h1>Tiêu đề</h1><p>Đoạn văn.</p><ul><li>A</li></ul>");
    expect(html).toContain("<h1");
    expect(html).toContain("<p");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
  });

  it("render <table> thành bảng HTML có border", () => {
    const html = renderHtmlSummary(
      "<table><tr><th>Tên</th><th>Trạng thái</th></tr><tr><td>An</td><td>Xong</td></tr></table>"
    );
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("An");
    expect(html).toContain("Xong");
    expect(html).toContain("border");
  });

  it("hỗ trợ <thead> và <tbody>", () => {
    const html = renderHtmlSummary(
      "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>"
    );
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("A");
    expect(html).toContain("1");
  });

  it("sanitize script tag", () => {
    const html = renderHtmlSummary("<p>An toàn</p><script>alert(1)</script>");
    expect(html).not.toContain("<script");
    expect(html).toContain("An toàn");
  });

  it("regression — html không có bảng", () => {
    const html = renderHtmlSummary("<h2>Tiêu đề</h2><p>Đoạn văn.</p>");
    expect(html).not.toContain("<table");
  });
});

describe("summaryToHtml — dispatcher", () => {
  it("input bắt đầu bằng < → renderHtmlSummary", () => {
    const html = summaryToHtml("<p>Hello</p>");
    expect(html).toContain("<p");
    expect(html).toContain("Hello");
  });

  it("input markdown → xử lý markdown", () => {
    const html = summaryToHtml("## Tiêu đề");
    expect(html).toContain("<h2");
  });
});
