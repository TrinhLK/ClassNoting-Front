import JSZip from "jszip";
import { MAX_TEMPLATE_CHARACTERS } from "../templates";

export const MAX_TEMPLATE_FILE_BYTES = 5 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 20 * 1024 * 1024;

function inline(node: Node): string {
  if (node.nodeType === 3) return node.textContent || "";
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  if (["SCRIPT", "STYLE", "IMG", "IFRAME", "OBJECT"].includes(element.tagName)) return "";
  const text = Array.from(element.childNodes).map(inline).join("");
  if (element.tagName === "BR") return "\n";
  if (element.tagName === "STRONG" || element.tagName === "B") return text.trim() ? `**${text}**` : text;
  if (element.tagName === "EM" || element.tagName === "I") return text.trim() ? `*${text}*` : text;
  return text;
}

/** Convert Mammoth's semantic HTML to inert Markdown, preserving source order. */
export function templateHtmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  function block(element: Element, depth = 0): string {
    const tag = element.tagName;
    if (/^H[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${inline(element).trim()}\n\n`;
    if (tag === "TABLE") {
      const rows = Array.from(element.querySelectorAll("tr"))
        .filter(row => row.closest("table") === element)
        .map(row => Array.from(row.children).filter(cell => /^(TD|TH)$/.test(cell.tagName))
          .map(cell => inline(cell).trim().replace(/\|/g, "\\|").replace(/\n+/g, "<br>")));
      if (!rows.length) return "";
      const columns = Math.max(...rows.map(row => row.length));
      const line = (row: string[]) => `| ${Array.from({length: columns}, (_, i) => row[i] || " ").join(" | ")} |`;
      return [line(rows[0]), line(Array(columns).fill("---")), ...rows.slice(1).map(line)].join("\n") + "\n\n";
    }
    if (tag === "UL" || tag === "OL") {
      return Array.from(element.children).map((item, index) => {
        const content = Array.from(item.childNodes).filter(n => !(n.nodeType === 1 && /^(UL|OL)$/.test((n as Element).tagName)))
          .map(inline).join("").trim();
        const nested = Array.from(item.children).filter(e => /^(UL|OL)$/.test(e.tagName)).map(e => block(e, depth + 1)).join("");
        return `${"  ".repeat(depth)}${tag === "OL" ? `${index + 1}.` : "-"} ${content}\n${nested}`;
      }).join("") + (depth === 0 ? "\n" : "");
    }
    if (["SCRIPT", "STYLE", "IMG", "IFRAME", "OBJECT"].includes(tag)) return "";
    if (tag === "P") return inline(element).trim() + "\n\n";
    return Array.from(element.children).map(e => block(e, depth)).join("");
  }
  return Array.from(doc.body.children).map(e => block(e)).join("").trim();
}

/** Files stay in the browser. Only reviewed extracted text is saved as a template. */
export async function readWordTemplate(file: File): Promise<string> {
  if (!/\.(docx|dotx)$/i.test(file.name)) throw new Error("Chọn file Word .docx hoặc .dotx. Với .doc, hãy lưu lại thành .docx trước.");
  if (file.size > MAX_TEMPLATE_FILE_BYTES) throw new Error("File mẫu tối đa 5 MB. Hãy bỏ bớt hình ảnh hoặc nội dung không cần thiết.");
  let buffer: ArrayBuffer;
  try { buffer = await file.arrayBuffer(); } catch { throw new Error("Không đọc được file. Hãy chọn lại file Word."); }
  try {
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files);
    if (entries.length > 2000) throw new Error("TEMPLATE_TOO_LARGE");
    let unpacked = 0;
    for (const entry of entries) {
      // JSZip reads these sizes from the central directory before decompression.
      unpacked += (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
      if (unpacked > MAX_UNPACKED_BYTES) throw new Error("TEMPLATE_TOO_LARGE");
    }
    if (!zip.file("word/document.xml")) throw new Error("INVALID_WORD_DOCUMENT");
    const mammoth = (await import("mammoth/mammoth.browser")).default;
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer }, {
      externalFileAccess: false,
      includeEmbeddedStyleMap: false,
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })),
    });
    const markdown = templateHtmlToMarkdown(result.value);
    if (!markdown.trim()) throw new Error("TEMPLATE_EMPTY");
    if (markdown.length > MAX_TEMPLATE_CHARACTERS) throw new Error("TEMPLATE_TOO_LARGE");
    return markdown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "TEMPLATE_EMPTY") throw new Error("File không có văn bản đọc được. Hãy dùng mẫu có tiêu đề hoặc nội dung dạng chữ, thay vì ảnh scan.");
    if (message === "TEMPLATE_TOO_LARGE") throw new Error("Mẫu quá dài hoặc quá lớn sau khi giải nén. Hãy rút gọn còn tối đa 40.000 ký tự và bỏ hình ảnh không cần thiết.");
    throw new Error("Không đọc được tài liệu Word. File có thể bị lỗi hoặc được bảo vệ bằng mật khẩu; hãy lưu lại thành .docx rồi thử lại.");
  }
}
