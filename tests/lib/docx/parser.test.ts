import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
} from "docx";
import {
  parseInline,
  parseMarkdownToDocx,
  parseHtmlToDocx,
  parseSummaryToDocx,
  buildSummaryDocx,
} from "@/app/lib/docx/parser";

type DocxNode = Paragraph | Table;

const packAndReadXml = async (nodes: DocxNode[]): Promise<string> => {
  const doc = new Document({
    sections: [{ children: [...nodes] }],
  });
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Missing document.xml");
  return docFile.async("string");
};

const extractVisibleText = (xml: string): string =>
  xml
    .replace(/<w:t[^>]*>/g, "")
    .replace(/<\/w:t>/g, "")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<[^>]+>/g, "");

const countTables = (xml: string): number => (xml.match(/<w:tbl>/g) || []).length;

const countRows = (xml: string): number => (xml.match(/<w:tr[\s>]/g) || []).length;

const hasCellText = (xml: string, text: string): boolean =>
  new RegExp(`<w:t[^>]*>\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</w:t>`).test(xml);

describe("parseInline", () => {
  it("trả về 1 token cho text thường", () => {
    const tokens = parseInline("Xin chào");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].text).toBe("Xin chào");
  });

  it("nhận **bold**", () => {
    const tokens = parseInline("a **b** c");
    expect(tokens).toHaveLength(3);
    expect(tokens[1].bold).toBe(true);
    expect(tokens[1].text).toBe("b");
  });

  it("nhận *italic*", () => {
    const tokens = parseInline("a *b* c");
    expect(tokens[1].italic).toBe(true);
    expect(tokens[1].text).toBe("b");
  });

  it("nhận ***bold-italic***", () => {
    const tokens = parseInline("a ***b*** c");
    expect(tokens[1].bold).toBe(true);
    expect(tokens[1].italic).toBe(true);
  });
});

describe("parseMarkdownToDocx — markdown thông thường", () => {
  it("trả mảng rỗng khi input rỗng", () => {
    expect(parseMarkdownToDocx("")).toEqual([]);
  });

  it("render heading 1, 2, 3", async () => {
    const nodes = parseMarkdownToDocx("# H1\n## H2\n### H3");
    expect(nodes).toHaveLength(3);
    expect(nodes.every((n) => n instanceof Paragraph)).toBe(true);
    const xml = await packAndReadXml(nodes);
    expect(extractVisibleText(xml)).toContain("H1");
    expect(extractVisibleText(xml)).toContain("H2");
    expect(extractVisibleText(xml)).toContain("H3");
  });

  it("render bullet list", async () => {
    const nodes = parseMarkdownToDocx("- A\n- B");
    expect(nodes).toHaveLength(2);
    const xml = await packAndReadXml(nodes);
    expect(extractVisibleText(xml)).toContain("A");
    expect(extractVisibleText(xml)).toContain("B");
  });

  it("render paragraph thường", async () => {
    const nodes = parseMarkdownToDocx("Đoạn văn thường");
    expect(nodes).toHaveLength(1);
    const xml = await packAndReadXml(nodes);
    expect(extractVisibleText(xml)).toContain("Đoạn văn thường");
  });

  it("đảm bảo tương thích ngược: summary không có bảng vẫn ra Paragraph", () => {
    const nodes = parseMarkdownToDocx("## Tiêu đề\nĐoạn văn.");
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n instanceof Paragraph)).toBe(true);
  });
});

describe("parseMarkdownToDocx — bảng markdown", () => {
  it("chuyển bảng 2 cột 2 hàng thành 1 Table (1 header + 2 data)", async () => {
    const md = "| Tên | Trạng thái |\n|-----|------------|\n| An  | Xong       |\n| Bình| Đang làm   |";
    const nodes = parseMarkdownToDocx(md);
    expect(nodes).toHaveLength(1);
    const table = nodes[0];
    expect(table).toBeInstanceOf(Table);
    const xml = await packAndReadXml(nodes);
    expect(countTables(xml)).toBe(1);
    expect(countRows(xml)).toBe(3);
    expect(extractVisibleText(xml)).toContain("Tên");
    expect(extractVisibleText(xml)).toContain("Trạng thái");
    expect(extractVisibleText(xml)).toContain("An");
    expect(extractVisibleText(xml)).toContain("Xong");
    expect(extractVisibleText(xml)).toContain("Bình");
    expect(extractVisibleText(xml)).toContain("Đang làm");
  });

  it("hỗ trợ dòng phân cách căn lề :---:, ---:, :---", async () => {
    const md = "| A | B | C |\n|:---|:---:|---:|\n| 1 | 2 | 3 |";
    const nodes = parseMarkdownToDocx(md);
    expect(nodes).toHaveLength(1);
    const xml = await packAndReadXml(nodes);
    expect(countTables(xml)).toBe(1);
    expect(countRows(xml)).toBe(2);
  });

  it("bảng xen giữa heading và paragraph thường", async () => {
    const md = "## Báo cáo\n\n| Cột 1 | Cột 2 |\n|---|---|\n| A | B |\n\nGhi chú cuối.";
    const nodes = parseMarkdownToDocx(md);
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toBeInstanceOf(Paragraph);
    expect(nodes[1]).toBeInstanceOf(Table);
    expect(nodes[2]).toBeInstanceOf(Paragraph);
    const xml = await packAndReadXml(nodes);
    expect(extractVisibleText(xml)).toContain("Báo cáo");
    expect(extractVisibleText(xml)).toContain("A");
    expect(extractVisibleText(xml)).toContain("Ghi chú cuối");
  });

  it("hai bảng liên tiếp tách rời", async () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |\n\n| C | D |\n|---|---|\n| 3 | 4 |";
    const nodes = parseMarkdownToDocx(md);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toBeInstanceOf(Table);
    expect(nodes[1]).toBeInstanceOf(Table);
    const xml = await packAndReadXml(nodes);
    expect(countTables(xml)).toBe(2);
  });

  it("không tạo bảng nếu thiếu dòng phân cách", () => {
    const md = "| A | B |\nKhông có dòng phân cách";
    const nodes = parseMarkdownToDocx(md);
    expect(nodes.every((n) => n instanceof Paragraph)).toBe(true);
  });
});

describe("parseHtmlToDocx", () => {
  it("render <h1>, <h2>, <p>", async () => {
    const nodes = parseHtmlToDocx("<h1>Tiêu đề</h1><p>Đoạn văn.</p>");
    expect(nodes).toHaveLength(2);
    const xml = await packAndReadXml(nodes);
    expect(extractVisibleText(xml)).toContain("Tiêu đề");
    expect(extractVisibleText(xml)).toContain("Đoạn văn");
  });

  it("render <ul><li>", async () => {
    const nodes = parseHtmlToDocx("<ul><li>A</li><li>B</li></ul>");
    expect(nodes).toHaveLength(2);
    const xml = await packAndReadXml(nodes);
    expect(extractVisibleText(xml)).toContain("A");
    expect(extractVisibleText(xml)).toContain("B");
  });

  it("render <strong> trong <p>", async () => {
    const nodes = parseHtmlToDocx("<p>Xin chào <strong>anh</strong>.</p>");
    const xml = await packAndReadXml(nodes);
    expect(xml).toContain("<w:b/>");
    expect(extractVisibleText(xml)).toContain("Xin chào");
    expect(extractVisibleText(xml)).toContain("anh");
  });

  it("render <table> thành Table với header in đậm", async () => {
    const html = "<table><tr><th>Tên</th><th>Trạng thái</th></tr><tr><td>An</td><td>Xong</td></tr></table>";
    const nodes = parseHtmlToDocx(html);
    expect(nodes).toHaveLength(1);
    const table = nodes[0];
    expect(table).toBeInstanceOf(Table);
    const xml = await packAndReadXml(nodes);
    expect(countTables(xml)).toBe(1);
    expect(countRows(xml)).toBe(2);
    expect(extractVisibleText(xml)).toContain("Tên");
    expect(extractVisibleText(xml)).toContain("Trạng thái");
    expect(extractVisibleText(xml)).toContain("An");
    expect(extractVisibleText(xml)).toContain("Xong");
  });

  it("kiểm tra <th> có shading fill F1F5F9", async () => {
    const html = "<table><tr><th>A</th></tr><tr><td>1</td></tr></table>";
    const nodes = parseHtmlToDocx(html);
    const xml = await packAndReadXml(nodes);
    expect(xml).toContain("F1F5F9");
  });

  it("hỗ trợ <thead> và <tbody> riêng", async () => {
    const html = "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>";
    const nodes = parseHtmlToDocx(html);
    expect(nodes).toHaveLength(1);
    const xml = await packAndReadXml(nodes);
    expect(countRows(xml)).toBe(2);
    expect(extractVisibleText(xml)).toContain("A");
    expect(extractVisibleText(xml)).toContain("1");
  });

  it("bảng lồng nhau (table trong td) — outer row vẫn render", async () => {
    const html = "<table><tr><th>Outer</th></tr><tr><td><table><tr><td>Inner</td></tr></table></td></tr></table>";
    const nodes = parseHtmlToDocx(html);
    expect(nodes).toHaveLength(1);
    const xml = await packAndReadXml(nodes);
    expect(extractVisibleText(xml)).toContain("Outer");
  });

  it("đảm bảo tương thích ngược: html không có bảng vẫn render đúng", () => {
    const nodes = parseHtmlToDocx("<h2>Tiêu đề</h2><p>Đoạn văn.</p>");
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n instanceof Paragraph)).toBe(true);
  });
});

describe("parseSummaryToDocx — dispatcher", () => {
  it("input rỗng trả về mảng rỗng", () => {
    expect(parseSummaryToDocx("")).toEqual([]);
  });

  it("input bắt đầu bằng < → parseHtml", async () => {
    const nodes = parseSummaryToDocx("<p>Hello</p>");
    expect(nodes).toHaveLength(1);
    const xml = await packAndReadXml(nodes);
    expect(extractVisibleText(xml)).toContain("Hello");
  });

  it("input thường → parseMarkdown", async () => {
    const nodes = parseSummaryToDocx("## Tiêu đề");
    expect(nodes).toHaveLength(1);
    const xml = await packAndReadXml(nodes);
    expect(extractVisibleText(xml)).toContain("Tiêu đề");
  });
});

describe("buildSummaryDocx — tích hợp", () => {
  it("tạo blob docx hợp lệ", async () => {
    const blob = await buildSummaryDocx("Họp tuần", "Ngày: 2026-08-05", [
      new Paragraph({ children: [new TextRun({ text: "Nội dung" })] }),
    ]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("summary rỗng → tạo blob với body hợp lệ", async () => {
    const blob = await buildSummaryDocx("Tiêu đề", "Meta", []);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("bảng markdown trong summary xuất hiện trong XML docx", async () => {
    const nodes = parseSummaryToDocx("| A | B |\n|---|---|\n| 1 | 2 |");
    const blob = await buildSummaryDocx("Tiêu đề", "Meta", nodes);
    expect(blob).toBeInstanceOf(Blob);
    const buf = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const docFile = zip.file("word/document.xml");
    expect(docFile).not.toBeNull();
    const xml = await docFile!.async("string");
    expect(xml).toContain("<w:tbl");
    expect(hasCellText(xml, "1"));
    expect(hasCellText(xml, "2"));
  });

  it("cell header có shading fill F1F5F9 trong XML", async () => {
    const nodes = parseSummaryToDocx("| A | B |\n|---|---|\n| 1 | 2 |");
    const blob = await buildSummaryDocx("Tiêu đề", "Meta", nodes);
    const buf = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const docFile = zip.file("word/document.xml");
    const xml = await docFile!.async("string");
    expect(xml).toContain("F1F5F9");
  });
});

describe("regression — không vỡ summary không có bảng", () => {
  it("summary chỉ có heading + bullet — bảng không xuất hiện", async () => {
    const md = "## Mục lục\n- Mục 1\n- Mục 2\n";
    const nodes = parseSummaryToDocx(md);
    expect(nodes.every((n) => n instanceof Paragraph)).toBe(true);
    const xml = await packAndReadXml(nodes);
    expect(xml).not.toContain("<w:tbl");
  });

  it("summary chỉ có paragraph thường", async () => {
    const nodes = parseSummaryToDocx("Đây là đoạn văn bình thường.");
    const xml = await packAndReadXml(nodes);
    expect(extractVisibleText(xml)).toContain("Đây là đoạn văn bình thường");
  });

  it("summary html không có bảng — không có <w:tbl>", async () => {
    const nodes = parseHtmlToDocx("<h1>Tiêu đề</h1><p>Đoạn văn.</p>");
    const xml = await packAndReadXml(nodes);
    expect(xml).not.toContain("<w:tbl");
  });
});
