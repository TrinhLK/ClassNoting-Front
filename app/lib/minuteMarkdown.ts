/**
 * Simple Markdown parser cho trang /minutes/[id].
 * Có hỗ trợ: heading, bold, italic, list, line break, table.
 * Không phụ thuộc react-markdown để giữ pipeline render HTML string
 * (cần thiết cho logic highlight regex bằng mark).
 */

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

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const inlineMarkdownToHtml = (text: string): string =>
  escapeHtml(text)
    .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

const renderTable = (lines: string[]): string => {
  if (lines.length < 2 || !TABLE_SEPARATOR.test(lines[1])) return "";
  const headerCells = splitTableRow(lines[0]);
  const dataRows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    if (!isTableRow(lines[i]) || TABLE_SEPARATOR.test(lines[i])) break;
    dataRows.push(splitTableRow(lines[i]));
  }
  const thead =
    "<thead><tr>" +
    headerCells.map((c) => `<th>${inlineMarkdownToHtml(c)}</th>`).join("") +
    "</tr></thead>";
  const tbody =
    "<tbody>" +
    dataRows
      .map(
        (row) =>
          "<tr>" +
          row.map((c) => `<td>${inlineMarkdownToHtml(c)}</td>`).join("") +
          "</tr>"
      )
      .join("") +
    "</tbody>";
  return `<table>${thead}${tbody}</table>`;
};

export const parseMarkdown = (text: string): string => {
  if (!text) return "";

  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let listOpen: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listOpen) {
      out.push(`</${listOpen}>`);
      listOpen = null;
    }
  };

  const openList = (type: "ul" | "ol") => {
    if (listOpen !== type) {
      closeList();
      out.push(`<${type}>`);
      listOpen = type;
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      closeList();
      i++;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      closeList();
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(renderTable(tableLines));
      continue;
    }

    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    const bullet = line.match(/^\s*[-*+]\s+(.*)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);

    if (h1) {
      closeList();
      out.push(`<h1>${inlineMarkdownToHtml(h1[1])}</h1>`);
    } else if (h2) {
      closeList();
      out.push(`<h2>${inlineMarkdownToHtml(h2[1])}</h2>`);
    } else if (h3) {
      closeList();
      out.push(`<h3>${inlineMarkdownToHtml(h3[1])}</h3>`);
    } else if (bullet) {
      openList("ul");
      out.push(`<li>${inlineMarkdownToHtml(bullet[1])}</li>`);
    } else if (numbered) {
      openList("ol");
      out.push(`<li>${inlineMarkdownToHtml(numbered[1])}</li>`);
    } else {
      closeList();
      out.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
    }
    i++;
  }
  closeList();
  return out.join("\n");
};
