import { describe, expect, it } from "vitest";
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell } from "docx";
import JSZip from "jszip";
import { readWordTemplate, templateHtmlToMarkdown, MAX_TEMPLATE_FILE_BYTES } from "@/app/lib/docx/templateReader";
import { meetingTemplateInstruction, DEFAULT_TEMPLATES } from "@/app/lib/templates";

async function word(children: (Paragraph | Table)[], name = "mau.docx") {
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children }] }));
  return new File([new Uint8Array(buffer)], name);
}

describe("Word summary templates", () => {
  it("reads a real headings-only Word file, preserving hierarchy and order", async () => {
    const result = await readWordTemplate(await word([
      new Paragraph({ text: "BÁO CÁO", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: "1. Tình hình", heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: "2. Kiến nghị", heading: HeadingLevel.HEADING_2 }),
    ]));
    expect(result).toBe("# BÁO CÁO\n\n## 1. Tình hình\n\n## 2. Kiến nghị");
  });

  it("retains sample prose and tables from a populated Word file for style reference", async () => {
    const result = await readWordTemplate(await word([
      new Paragraph({ text: "BÁO CÁO THÁNG 5", heading: HeadingLevel.HEADING_1 }),
      new Paragraph("Trên cơ sở ý kiến của các thành viên, đơn vị ghi nhận doanh thu 25 tỷ đồng."),
      new Table({ rows: [
        new TableRow({ children: [new TableCell({children:[new Paragraph("Nhiệm vụ")]}), new TableCell({children:[new Paragraph("Người thực hiện")]})] }),
        new TableRow({ children: [new TableCell({children:[new Paragraph("Rà soát hồ sơ")]}), new TableCell({children:[new Paragraph("Ông An")]})] }),
      ] }),
    ], "bao-cao.dotx"));
    expect(result).toContain("# BÁO CÁO THÁNG 5");
    expect(result).toContain("doanh thu 25 tỷ đồng");
    expect(result).toContain("| Nhiệm vụ | Người thực hiện |");
    expect(result).toContain("| Rà soát hồ sơ | Ông An |");
  });

  it("does not preserve executable markup or external link/image targets", () => {
    const result = templateHtmlToMarkdown('<h2>Mục</h2><p><a href="https://evil.test">Nội dung</a><img src="https://evil.test/pixel"><script>alert(1)</script></p><ol><li>Việc A<ul><li>Việc con</li></ul></li></ol>');
    expect(result).toContain("## Mục");
    expect(result).toContain("1. Việc A\n  - Việc con");
    expect(result).not.toMatch(/evil|script|alert|<img/);
  });

  it("rejects empty, corrupt, unsupported and oversized files with actionable errors", async () => {
    await expect(readWordTemplate(await word([new Paragraph("")]))).rejects.toThrow("không có văn bản");
    await expect(readWordTemplate(new File(["invalid"], "mau.docx"))).rejects.toThrow("Không đọc được tài liệu");
    await expect(readWordTemplate(new File(["legacy"], "mau.doc"))).rejects.toThrow(".docx trước");
    await expect(readWordTemplate({ name: "large.docx", size: MAX_TEMPLATE_FILE_BYTES + 1 } as File)).rejects.toThrow("5 MB");
  });

  it("rejects large extracted text and oversized ZIP contents before conversion", async () => {
    await expect(readWordTemplate(await word([new Paragraph("a".repeat(40_001))]))).rejects.toThrow("40.000");
    const zip = new JSZip();
    zip.file("word/document.xml", "a");
    zip.file("padding", "a".repeat(20 * 1024 * 1024));
    await expect(readWordTemplate(new File([await zip.generateAsync({type:"arraybuffer",compression:"DEFLATE"})], "zip.docx"))).rejects.toThrow("quá lớn");
  });

  it("keeps old templates compatible and separates examples from meeting facts", () => {
    expect(meetingTemplateInstruction(DEFAULT_TEMPLATES[0])).toBe(DEFAULT_TEMPLATES[0].structure);
    const example = meetingTemplateInstruction({...DEFAULT_TEMPLATES[0], structure:"## Kết quả\nÔng A đạt 25 tỷ.", sourceMode:"example"});
    expect(example).toContain("thay toàn bộ nội dung ví dụ");
    expect(example).toContain("nếu cuộc họp hiện tại không xác nhận");
    const outline = meetingTemplateInstruction({...DEFAULT_TEMPLATES[0], structure:"## Kết quả", sourceMode:"outline"});
    expect(outline).toContain("kể cả khi mẫu không có placeholder");
    expect(meetingTemplateInstruction({...DEFAULT_TEMPLATES[0],sourceMode:"auto"})).toContain("Với mẫu pha trộn");
  });
});
