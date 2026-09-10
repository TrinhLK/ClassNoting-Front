import JSZip from "jszip";

export const MAX_DOCX_SIZE = 5 * 1024 * 1024;

export interface PlaceholderInfo {
  name: string;
  count: number;
}

export interface DocxParseResult {
  placeholders: PlaceholderInfo[];
  documentXml: string;
}

export interface DocxMarker {
  marker: string;
  value: string;
}

const PLACEHOLDER_REGEX = /\{\{([^{}]+)\}\}/g;

const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const validateFile = (file: File): void => {
  if (file.size > MAX_DOCX_SIZE) {
    throw new Error("File quá lớn. Giới hạn 5MB.");
  }
  const isDocx =
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx");
  if (!isDocx) {
    throw new Error("Chỉ hỗ trợ file .docx");
  }
};

const readDocumentXml = async (file: File): Promise<string> => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const doc = zip.file("word/document.xml");
  if (!doc) {
    throw new Error("File .docx không hợp lệ (thiếu word/document.xml)");
  }
  return doc.async("string");
};

/**
 * Trả về danh sách file XML trong docx có chứa nội dung văn bản
 * (document, header*, footer*, footnotes, endnotes, comments, etc.).
 * Tránh các file config (styles, settings, theme, fontTable, numbering, webSettings).
 */
const getTextXmlFiles = async (file: File): Promise<{ name: string; xml: string }[]> => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const results: { name: string; xml: string }[] = [];
  const targets: string[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    if (!path.startsWith("word/") || !path.endsWith(".xml")) return;
    const name = path.slice("word/".length);
    // Bỏ qua file config (không chứa <w:p> thường)
    if (/(^styles\.|^settings\.|^theme\/|^fontTable\.|^numbering\.|^webSettings\.|^theme\.xml$)/i.test(name)) {
      return;
    }
    targets.push(path);
  });
  for (const path of targets) {
    const entry = zip.file(path);
    if (!entry) continue;
    const xml = await entry.async("string");
    if (xml.includes("<w:p") || xml.includes("<w:p>")) {
      results.push({ name: path, xml });
    }
  }
  return results;
};

const writeXmlFiles = async (file: File, updated: { name: string; xml: string }[]): Promise<Blob> => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  for (const { name, xml } of updated) {
    zip.file(name, xml);
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
};

/**
 * Fill replacements vào TẤT CẢ XML chứa văn bản trong docx
 * (document + header + footer + footnotes + endnotes + comments).
 * Trả về tập các marker đã match (dùng cho cross-paragraph).
 */
const fillAllTextXmls = async (
  file: File,
  replacements: { from: string; to: string }[]
): Promise<Blob> => {
  const files = await getTextXmlFiles(file);
  if (files.length === 0) {
    throw new Error("File .docx không hợp lệ (không có document.xml)");
  }
  const updated: { name: string; xml: string }[] = [];
  for (const { name, xml } of files) {
    const doc = parseXml(xml);
    const paragraphs = getParagraphs(doc);
    const paraTextEls = paragraphs.map((p) => getTextElements(p));

    // Bước 1: Fill từng paragraph riêng
    const matched = new Set<string>();
    for (const textEls of paraTextEls) {
      const m = applyReplacements(textEls, replacements);
      m.forEach((x) => matched.add(x));
    }

    // Bước 2: Với marker chưa match, thử xuyên 2 paragraph liền kề
    const unmatched = replacements.filter((r) => !matched.has(r.from));
    if (unmatched.length > 0) {
      for (let i = 0; i < paraTextEls.length - 1; i++) {
        applyCrossParagraphFill(paraTextEls[i], paraTextEls[i + 1], unmatched);
      }
    }

    updated.push({ name, xml: new XMLSerializer().serializeToString(doc) });
  }
  return writeXmlFiles(file, updated);
};

/**
 * Thử fill marker xuyên 2 paragraph liền kề (label ở para i, chỗ trống ở para i+1).
 * Nối text 2 para (cách bằng \n\n), tìm marker (đã normalize). Nếu match xuyên 2 para,
 * xóa label ở para i và thay chỗ trống ở para i+1 bằng value.
 */
const applyCrossParagraphFill = (
  textElsA: Element[],
  textElsB: Element[],
  replacements: { from: string; to: string }[]
): void => {
  if (textElsA.length === 0 || textElsB.length === 0) return;

  const textA = normalizeForXml(paragraphText(textElsA));
  const textB = normalizeForXml(paragraphText(textElsB));
  if (!textA || !textB) return;

  // joined = textA + " \n\n " + textB (sau normalize: textA + " " + textB)
  const joinedDisplay = normalizeForXml(`${textA} \n\n ${textB}`);

  for (const r of replacements) {
    if (!r.from) continue;
    const fromNorm = normalizeForXml(r.from);
    const idx = joinedDisplay.indexOf(fromNorm);
    if (idx === -1) continue;

    const matchEnd = idx + r.from.length;
    // joinedDisplay = textA + " \n\n " + textB
    const separator = " \n\n ";
    const aLenActual = textA.length + separator.length;

    // Marker nằm hoàn toàn trong para A
    if (matchEnd <= aLenActual) continue;
    // Marker nằm hoàn toàn trong para B
    if (idx >= aLenActual) continue;

    // Xuyên 2 para
    const endInBActual = matchEnd - aLenActual;
    if (endInBActual <= 0) continue;

    // Phần đầu ở para A: từ idx đến cuối textA
    // Phần sau ở para B: từ 0 đến endInBActual

    // Xóa label ở para A: replaceRange từ idx đến textA.length -> ""
    if (idx < textA.length) {
      replaceRange(textElsA, idx, textA.length, "");
    }
    // Thay chỗ trống ở para B: replaceRange từ 0 đến endInBActual -> value
    if (endInBActual > 0) {
      replaceRange(textElsB, 0, endInBActual, r.to);
    }
  }
};

const parseXml = (xml: string): Document => {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("File .docx không hợp lệ (lỗi XML)");
  }
  return doc;
};

const getParagraphs = (doc: Document): Element[] =>
  Array.from(doc.getElementsByTagName("w:p"));

const getTextElements = (p: Element): Element[] =>
  Array.from(p.getElementsByTagName("w:t"));

const paragraphText = (textEls: Element[]): string =>
  textEls.map((el) => el.textContent || "").join("");

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Chuẩn hóa text để match giữa mammoth text (có \n giữa các dòng) và
 * DOM paragraph text (đã gộp w:t, không có \n giữa runs).
 * Thay mọi \r\n bằng space và trim.
 */
const normalizeForXml = (s: string): string =>
  s.replace(/\r?\n+/g, " ").replace(/[ \t]+/g, " ").trim();

/**
 * Gộp text của các w:t trong một đoạn w:p, tìm các chỗ khớp "from",
 * thay thế bằng "to" TRÊN NHIỀU RUN (xử lý placeholder bị Word tách run).
 * Quét toàn bộ text một lần, áp dụng các match từ phải -> trái để offset không bị dịch.
 * Trả về tập các `from` đã match (dùng cho cross-paragraph fallback).
 */
const applyReplacements = (
  textEls: Element[],
  replacements: { from: string; to: string }[]
): Set<string> => {
  const matched = new Set<string>();
  if (textEls.length === 0 || replacements.length === 0) return matched;

  const full = normalizeForXml(paragraphText(textEls));
  if (!full) return matched;

  const clean = replacements
    .map((r) => ({ from: normalizeForXml(r.from), to: r.to, originalFrom: r.from }))
    .filter((r) => r.from)
    .sort((a, b) => b.from.length - a.from.length);

  if (clean.length === 0) return matched;

  const pattern = clean.map((r) => `(${escapeRegExp(r.from)})`).join("|");
  const regex = new RegExp(pattern, "g");

  const matches: { start: number; end: number; to: string; originalFrom: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(full)) !== null) {
    let to = "";
    let originalFrom = "";
    for (let i = 0; i < clean.length; i++) {
      if (match[i + 1] !== undefined) {
        to = clean[i].to;
        originalFrom = clean[i].originalFrom;
        break;
      }
    }
    matches.push({ start: match.index, end: match.index + match[0].length, to, originalFrom });
  }
  if (matches.length === 0) return matched;

  // Thay từ phải -> trái để không làm lệch offset
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end, to, originalFrom } = matches[i];
    replaceRange(textEls, start, end, to);
    matched.add(originalFrom);
  }
  return matched;
};

const replaceRange = (
  textEls: Element[],
  startOffset: number,
  endOffset: number,
  value: string
): void => {
  const lens = textEls.map((el) => (el.textContent || "").length);
  const start = findRunByOffset(lens, startOffset);
  const end = findRunByOffset(lens, endOffset);

  const startEl = textEls[start.run];
  const startText = startEl.textContent || "";
  const prefix = startText.slice(0, start.local);

  let suffix = "";
  if (end.run === start.run) {
    suffix = startText.slice(end.local);
  } else {
    suffix = (textEls[end.run].textContent || "").slice(end.local);
  }

  startEl.textContent = prefix + value + suffix;
  for (let i = start.run + 1; i <= end.run; i++) {
    textEls[i].textContent = "";
  }
};

const findRunByOffset = (lens: number[], offset: number): { run: number; local: number } => {
  let acc = 0;
  for (let i = 0; i < lens.length; i++) {
    if (offset <= acc + lens[i] || i === lens.length - 1) {
      return { run: i, local: Math.max(0, offset - acc) };
    }
    acc += lens[i];
  }
  return { run: lens.length - 1, local: lens[lens.length - 1] };
};

export async function extractPlaceholders(file: File): Promise<PlaceholderInfo[]> {
  validateFile(file);
  const documentXml = await readDocumentXml(file);
  const doc = parseXml(documentXml);
  const counts = new Map<string, number>();

  for (const p of getParagraphs(doc)) {
    const text = paragraphText(getTextElements(p));
    for (const match of text.matchAll(PLACEHOLDER_REGEX)) {
      const name = match[1].trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
}

export async function fillDocx(file: File, values: Record<string, string>): Promise<Blob> {
  validateFile(file);
  const replacements = Object.entries(values)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([name, value]) => ({ from: `{{${name.trim()}}}`, to: escapeXml(normalizeForXml(String(value))) }));
  return fillAllTextXmls(file, replacements);
}

export async function fillDocxMarkers(file: File, markers: DocxMarker[]): Promise<Blob> {
  validateFile(file);
  const replacements = markers
    .filter((m) => m.marker && m.marker.trim())
    .map((m) => ({ from: m.marker, to: escapeXml(normalizeForXml(m.value ?? "")) }));
  return fillAllTextXmls(file, replacements);
}

export async function parseDocx(file: File): Promise<DocxParseResult> {
  const documentXml = await readDocumentXml(file);
  const placeholders = await extractPlaceholders(file);
  return { placeholders, documentXml };
}

export async function extractPlainText(file: File): Promise<string> {
  validateFile(file);
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}
