import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { sanitizeHtml } from "../sanitizeHtml";

export type SummaryNode = Paragraph | Table;

export interface InlineToken {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export const parseInline = (text: string): InlineToken[] => {
  const tokens: InlineToken[] = [];
  const regex = /(\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|__([^_]+)__|_([^_]+)_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, match.index) });
    }
    if (match[2] !== undefined) tokens.push({ text: match[2], bold: true, italic: true });
    else if (match[3] !== undefined) tokens.push({ text: match[3], bold: true });
    else if (match[4] !== undefined) tokens.push({ text: match[4], italic: true });
    else if (match[5] !== undefined) tokens.push({ text: match[5], bold: true });
    else if (match[6] !== undefined) tokens.push({ text: match[6], italic: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex) });
  }
  return tokens;
};

export const tokensToRuns = (tokens: InlineToken[]): TextRun[] =>
  tokens.map((t) => new TextRun({ text: t.text, bold: t.bold, italics: t.italic }));

export const stripMarkdownMarkers = (text: string): string =>
  text.replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1");

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

const isTableRow = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|");
};

const splitTableRow = (line: string): string[] => {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((c) => c.trim());
};

const buildTableCell = (text: string, isHeader: boolean): TableCell =>
  new TableCell({
    children: [
      new Paragraph({
        children: tokensToRuns(parseInline(stripMarkdownMarkers(text))),
      }),
    ],
    ...(isHeader ? { shading: { fill: "F1F5F9" } } : {}),
  });

const buildTable = (headerCells: string[], dataRows: string[][]): Table => {
  const headerRow = new TableRow({
    children: headerCells.map((c) => buildTableCell(c, true)),
    tableHeader: true,
  });
  const bodyRows = dataRows.map(
    (row) =>
      new TableRow({
        children: row.map((c) => buildTableCell(c, false)),
      })
  );

  const border = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
  };

  return new Table({
    rows: [headerRow, ...bodyRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: border,
  });
};

export const parseMarkdownToDocx = (md: string): SummaryNode[] => {
  const lines = md.split(/\r?\n/);
  const children: SummaryNode[] = [];
  let listBuffer: Paragraph[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      children.push(...listBuffer);
      listBuffer = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.replace(/\s+$/, "");

    if (!line.trim()) {
      flushList();
      i++;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      flushList();
      const headerCells = splitTableRow(line);
      const dataRows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]) && !TABLE_SEPARATOR.test(lines[i])) {
        dataRows.push(splitTableRow(lines[i]));
        i++;
      }
      children.push(buildTable(headerCells, dataRows));
      continue;
    }

    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    const bullet = line.match(/^\s*([-*+])\s+(.*)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);

    if (h1) {
      flushList();
      children.push(
        new Paragraph({
          children: tokensToRuns(parseInline(stripMarkdownMarkers(h1[1]))),
          heading: HeadingLevel.HEADING_1,
        })
      );
    } else if (h2) {
      flushList();
      children.push(
        new Paragraph({
          children: tokensToRuns(parseInline(stripMarkdownMarkers(h2[1]))),
          heading: HeadingLevel.HEADING_2,
        })
      );
    } else if (h3) {
      flushList();
      children.push(
        new Paragraph({
          children: tokensToRuns(parseInline(stripMarkdownMarkers(h3[1]))),
          heading: HeadingLevel.HEADING_3,
        })
      );
    } else if (bullet) {
      listBuffer.push(
        new Paragraph({
          children: tokensToRuns(parseInline(stripMarkdownMarkers(bullet[2]))),
          bullet: { level: 0 },
        })
      );
    } else if (numbered) {
      listBuffer.push(
        new Paragraph({
          children: tokensToRuns(parseInline(stripMarkdownMarkers(numbered[1]))),
          numbering: { reference: "summary-list", level: 0 },
        })
      );
    } else {
      flushList();
      children.push(
        new Paragraph({
          children: tokensToRuns(parseInline(stripMarkdownMarkers(line))),
        })
      );
    }
    i++;
  }

  flushList();
  return children;
};

const INLINE_TAGS = new Set([
  "strong", "b", "em", "i", "u", "code", "br", "span", "mark", "small", "sub", "sup",
]);

const collectInlineRuns = (node: Node): TextRun[] => {
  const runs: TextRun[] = [];
  const walk = (n: Node): void => {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = (n.textContent || "");
      if (text) runs.push(new TextRun({ text }));
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as HTMLElement;
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case "strong":
      case "b":
        runs.push(new TextRun({ text: el.textContent || "", bold: true }));
        return;
      case "em":
      case "i":
        runs.push(new TextRun({ text: el.textContent || "", italics: true }));
        return;
      case "code":
        runs.push(new TextRun({ text: el.textContent || "", font: "Consolas" }));
        return;
      case "br":
        runs.push(new TextRun({ break: 1 }));
        return;
      default:
        if (INLINE_TAGS.has(tag)) {
          el.childNodes.forEach(walk);
        } else {
          el.childNodes.forEach(walk);
        }
        return;
    }
  };
  walk(node);
  return runs;
};

const BLOCK_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "ul", "ol", "li", "blockquote", "hr",
  "div", "section", "article", "table", "thead", "tbody", "tr", "td", "th",
]);

const flattenCellChildren = (el: HTMLElement, bold: boolean): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  const collect = (node: ChildNode): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").trim();
      if (text) {
        const tokens = parseInline(stripMarkdownMarkers(text)).map((t) =>
          bold ? { ...t, bold: true } : t
        );
        paragraphs.push(new Paragraph({ children: tokensToRuns(tokens) }));
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const child = node as HTMLElement;
    const tag = child.tagName.toLowerCase();
    if (tag === "p" || /^h[1-6]$/.test(tag)) {
      const text = child.textContent?.trim() || "";
      if (text) {
        const tokens = parseInline(stripMarkdownMarkers(text)).map((t) =>
          bold ? { ...t, bold: true } : t
        );
        paragraphs.push(new Paragraph({ children: tokensToRuns(tokens) }));
      }
      return;
    }
    if (tag === "br") {
      paragraphs.push(new Paragraph({ text: "" }));
      return;
    }
    child.childNodes.forEach(collect);
  };
  el.childNodes.forEach(collect);
  if (paragraphs.length === 0) {
    const text = el.textContent?.trim() || "";
    if (text) {
      const tokens = parseInline(stripMarkdownMarkers(text)).map((t) =>
        bold ? { ...t, bold: true } : t
      );
      paragraphs.push(new Paragraph({ children: tokensToRuns(tokens) }));
    }
  }
  return paragraphs;
};

const buildHtmlTable = (tableEl: HTMLElement): Table => {
  const rows: TableRow[] = [];

  const renderRows = (parent: HTMLElement, isHeader: boolean): void => {
    const trs = Array.from(parent.children).filter(
      (c) => c.tagName.toLowerCase() === "tr"
    );
    for (const tr of trs) {
      const cells = Array.from(tr.children).filter((c) =>
        ["td", "th"].includes(c.tagName.toLowerCase())
      );
      const rowIsHeader =
        isHeader || cells.some((c) => c.tagName.toLowerCase() === "th");
      const rowChildren = cells.map((cell) => {
        const cellIsHeader = cell.tagName.toLowerCase() === "th";
        const shouldBold = rowIsHeader || cellIsHeader;
        const inner = flattenCellChildren(cell as HTMLElement, shouldBold);
        const paragraphs =
          inner.length > 0
            ? inner
            : [new Paragraph({ children: [new TextRun({ text: "" })] })];
        return new TableCell({
          children: paragraphs,
          ...(rowIsHeader ? { shading: { fill: "F1F5F9" } } : {}),
        });
      });
      rows.push(
        new TableRow({ children: rowChildren, tableHeader: rowIsHeader })
      );
    }
  };

  const thead = tableEl.querySelector(":scope > thead") as HTMLElement | null;
  const tbody = tableEl.querySelector(":scope > tbody") as HTMLElement | null;
  if (thead) {
    renderRows(thead, true);
  } else {
    const directTrs = Array.from(tableEl.children).filter(
      (c) => c.tagName.toLowerCase() === "tr"
    );
    const syntheticThead = document.createElement("thead");
    let hasHeader = false;
    directTrs.forEach((tr) => {
      const allTh = Array.from(tr.children).every((cc) =>
        ["th"].includes(cc.tagName.toLowerCase())
      );
      if (allTh) {
        syntheticThead.appendChild(tr.cloneNode(true));
        hasHeader = true;
      }
    });
    if (hasHeader) {
      renderRows(syntheticThead, true);
    }
  }
  if (tbody) {
    renderRows(tbody, false);
  } else {
    const directTrs = Array.from(tableEl.children).filter(
      (c) => c.tagName.toLowerCase() === "tr"
    );
    const syntheticTbody = document.createElement("tbody");
    directTrs.forEach((tr) => {
      const allTh = Array.from(tr.children).every((cc) =>
        ["th"].includes(cc.tagName.toLowerCase())
      );
      if (!allTh) {
        syntheticTbody.appendChild(tr.cloneNode(true));
      }
    });
    if (syntheticTbody.children.length > 0) {
      renderRows(syntheticTbody, false);
    }
  }

  const border = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
  };

  if (rows.length === 0) {
    return new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ text: "" })],
            }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: border,
    });
  }

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: border,
  });
};

export const parseHtmlToDocx = (html: string): SummaryNode[] => {
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), "text/html");
  const body = doc.body;
  const children: SummaryNode[] = [];

  const walk = (node: ChildNode): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").trim();
      if (text) {
        children.push(
          new Paragraph({
            children: tokensToRuns(parseInline(stripMarkdownMarkers(text))),
          })
        );
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim() || "";

    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const levelMap: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
          h1: HeadingLevel.HEADING_1,
          h2: HeadingLevel.HEADING_2,
          h3: HeadingLevel.HEADING_3,
          h4: HeadingLevel.HEADING_4,
          h5: HeadingLevel.HEADING_5,
          h6: HeadingLevel.HEADING_6,
        };
        const inlineRuns = collectInlineRuns(el);
        if (inlineRuns.length > 0) {
          children.push(new Paragraph({ children: inlineRuns, heading: levelMap[tag] }));
        }
        return;
      }
      case "p":
        if (text) {
          children.push(new Paragraph({ children: collectInlineRuns(el) }));
        }
        return;
      case "li": {
        const parentTag = el.parentElement?.tagName.toLowerCase();
        const prefix = parentTag === "ol" ? "1. " : "• ";
        if (text) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: prefix }),
                ...collectInlineRuns(el),
              ],
              bullet: parentTag === "ul" ? { level: 0 } : undefined,
            })
          );
        }
        return;
      }
      case "blockquote":
        if (text) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text, italics: true }),
              ],
              indent: { left: 400 },
            })
          );
        }
        return;
      case "hr":
      case "br":
        children.push(new Paragraph({ text: "" }));
        return;
      case "ul":
      case "ol":
        el.childNodes.forEach(walk);
        return;
      case "table":
        children.push(buildHtmlTable(el));
        return;
      case "thead":
      case "tbody":
      case "tr":
      case "td":
      case "th":
        return;
      default: {
        const hasBlockChild = Array.from(el.children).some((c) =>
          BLOCK_TAGS.has(c.tagName.toLowerCase())
        );
        if (hasBlockChild) {
          el.childNodes.forEach(walk);
        } else if (text) {
          children.push(
            new Paragraph({
              children: tokensToRuns(parseInline(stripMarkdownMarkers(text))),
            })
          );
        }
        return;
      }
    }
  };

  body.childNodes.forEach(walk);
  return children;
};

export const parseSummaryToDocx = (summary: string): SummaryNode[] => {
  if (!summary.trim()) return [];
  if (summary.trimStart().startsWith("<")) {
    return parseHtmlToDocx(summary);
  }
  return parseMarkdownToDocx(summary);
};

export const buildSummaryDocx = async (
  title: string,
  meta: string,
  nodes: SummaryNode[],
  emptyMessage = "Chưa có biên bản tóm tắt."
): Promise<Blob> => {
  const children: SummaryNode[] = nodes.length > 0
    ? nodes
    : [new Paragraph({ children: [new TextRun({ text: emptyMessage, italics: true, color: "64748B" })] })];

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "summary-list",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: meta, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: "" }),
          ...children,
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
};
