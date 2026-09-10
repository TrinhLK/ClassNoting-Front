import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { fillDocx, extractPlaceholders, fillDocxMarkers } from "@/app/lib/docx/filler";

const readXmlFromBlob = async (blob: Blob): Promise<string> => {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Missing document.xml");
  return docFile.async("string");
};

const xmlToVisibleText = (xml: string): string =>
  xml
    .replace(/<w:t[^>]*>/g, "")
    .replace(/<\/w:t>/g, "")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<[^>]+>/g, "");

const buildDocxWithSplitRuns = async (): Promise<File> => {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          children: [
            new TextRun("Ten: "),
            new TextRun("{{TEN_KHACH_HANG}}"),
            new TextRun(" | Ngay: "),
            new TextRun("{{NGAY_KY}}"),
          ],
        }),
        new Paragraph({ children: [new TextRun("Ghi chu: ______ ket thuc")] }),
        new Paragraph({ children: [new TextRun("1. Muc dich: ...... noi dung")] }),
        new Paragraph({ children: [new TextRun("ABC")] }),
        new Paragraph({ children: [new TextRun("DEFGHIJ")] }),
      ],
    }],
  });
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Missing document.xml");
  let xml = await docFile.async("string");

  // Mô phỏng Word tách placeholder thành nhiều runs
  xml = xml.replace(
    "<w:t>{{TEN_KHACH_HANG}}</w:t>",
    "<w:t>{{TE</w:t></w:r><w:r><w:t>N_KHACH_HANG}}</w:t>"
  );
  xml = xml.replace(
    "<w:t>{{NGAY_KY}}</w:t>",
    "<w:t>{{NG</w:t></w:r><w:r><w:t>AY_KY}}</w:t>"
  );
  xml = xml.replace(
    "<w:t>______</w:t>",
    "<w:t>__</w:t></w:r><w:r><w:t>____</w:t>"
  );
  zip.file("word/document.xml", xml);
  const out = await zip.generateAsync({ type: "blob" });
  return new File([out], "template.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
};

describe("docx filler with split runs", () => {
  let file: File;

  beforeAll(async () => {
    file = await buildDocxWithSplitRuns();
  });

  it("extractPlaceholders tìm được placeholder bị tách runs", async () => {
    const found = await extractPlaceholders(file);
    const names = found.map((p) => p.name).sort();
    expect(names).toEqual(["NGAY_KY", "TEN_KHACH_HANG"]);
  });

  it("fillDocx thay placeholder bị tách runs", async () => {
    const blob = await fillDocx(file, {
      TEN_KHACH_HANG: "Nguyen Van A",
      NGAY_KY: "15/03/2026",
    });
    const xml = await readXmlFromBlob(blob);
    const text = xmlToVisibleText(xml);
    expect(text).toContain("Ten: Nguyen Van A");
    expect(text).toContain("Ngay: 15/03/2026");
    expect(text).not.toContain("{{");
  });

  it("fillDocxMarkers thay marker gạch chân bị tách runs", async () => {
    const blob = await fillDocxMarkers(file, [
      { marker: "______", value: "da dien" },
    ]);
    const xml = await readXmlFromBlob(blob);
    const text = xmlToVisibleText(xml);
    expect(text).toContain("Ghi chu: da dien ket thuc");
    expect(text).not.toContain("______");
  });

  it("fillDocxMarkers xử lý marker có xuống dòng (mammoth text)", async () => {
    const blob = await fillDocxMarkers(file, [
      { marker: "1. Muc dich:\n\n......", value: "1. Muc dich: noi dung" },
    ]);
    const xml = await readXmlFromBlob(blob);
    const text = xmlToVisibleText(xml);
    expect(text).toContain("1. Muc dich: noi dung");
    expect(text).not.toContain("......");
  });

  it("fillDocxMarkers xử lý marker xuyên 2 paragraph (label ở para1, chỗ trống ở para2)", async () => {
    const blob = await fillDocxMarkers(file, [
      { marker: "BC\n\nDEFGHIJ", value: "VALUE" },
    ]);
    const xml = await readXmlFromBlob(blob);
    const text = xmlToVisibleText(xml);
    expect(text).toContain("VALUE");
    expect(text).not.toContain("BC");
    expect(text).not.toContain("DEFGHIJ");
    // Debug: xác nhận p4 và p5 đã được fill
    expect(text).toMatch(/A\s*VALUE/);
  });
});

const buildDocxWithHeaderFooter = async (): Promise<File> => {
  const doc = new Document({
    sections: [{
      headers: {
        default: {
          options: { children: [
            new Paragraph({ children: [new TextRun("HEADER: {{HEADER_FIELD}}")] }),
          ] },
        },
      },
      footers: {
        default: {
          options: { children: [
            new Paragraph({ children: [new TextRun("FOOTER: {{FOOTER_FIELD}}")] }),
          ] },
        },
      },
      children: [
        new Paragraph({ children: [new TextRun("Body: {{BODY_FIELD}}")] }),
      ],
    }],
  });
  const buf = await Packer.toBuffer(doc);
  return new File([new Uint8Array(buf)], "with-hf.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
};

const readXmlByName = async (blob: Blob, name: string): Promise<string> => {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const f = zip.file(name);
  if (!f) throw new Error(`Missing ${name}`);
  return f.async("string");
};

describe("docx filler fills header/footer (not just document.xml)", () => {
  it("fillDocx thay placeholder trong header, footer và document", async () => {
    const file = await buildDocxWithHeaderFooter();
    const blob = await fillDocx(file, {
      HEADER_FIELD: "Hop dong so 1",
      FOOTER_FIELD: "Trang 1",
      BODY_FIELD: "Noi dung chinh",
    });
    const headerXml = await readXmlByName(blob, "word/header1.xml");
    const footerXml = await readXmlByName(blob, "word/footer1.xml");
    const docXml = await readXmlByName(blob, "word/document.xml");
    expect(xmlToVisibleText(headerXml)).toContain("Hop dong so 1");
    expect(xmlToVisibleText(footerXml)).toContain("Trang 1");
    expect(xmlToVisibleText(docXml)).toContain("Noi dung chinh");
    expect(headerXml).not.toContain("{{");
    expect(footerXml).not.toContain("{{");
  });
});
