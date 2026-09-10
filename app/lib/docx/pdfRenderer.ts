import { sanitizeHtml } from "../sanitizeHtml";

export const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const inlineMarkdownToHtml = (text: string): string =>
  escapeHtml(text)
    .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

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

const renderMarkdownTable = (lines: string[]): string => {
  if (lines.length < 2 || !TABLE_SEPARATOR.test(lines[1])) return "";
  const headerCells = splitTableRow(lines[0]);
  const dataRows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    if (!isTableRow(lines[i]) || TABLE_SEPARATOR.test(lines[i])) break;
    dataRows.push(splitTableRow(lines[i]));
  }
  const thead =
    '<thead><tr>' +
    headerCells.map((c) => `<th style="background:#F1F5F9;border:1px solid #CBD5E1;padding:6px 10px;text-align:left;font-weight:600;">${inlineMarkdownToHtml(c)}</th>`).join("") +
    "</tr></thead>";
  const tbody =
    "<tbody>" +
    dataRows
      .map(
        (row) =>
          "<tr>" +
          row
            .map(
              (c) =>
                `<td style="border:1px solid #CBD5E1;padding:6px 10px;">${inlineMarkdownToHtml(c)}</td>`
            )
            .join("") +
          "</tr>"
      )
      .join("") +
    "</tbody>";
  return `<table style="border-collapse:collapse;width:100%;margin:10px 0;font-size:12px;">${thead}${tbody}</table>`;
};

const renderHtmlTable = (tableEl: HTMLElement): string => {
  const rows: string[] = [];
  const collectRows = (parent: HTMLElement, isHeader: boolean): void => {
    const trs = Array.from(parent.children).filter(
      (c) => c.tagName.toLowerCase() === "tr"
    );
    for (const tr of trs) {
      const cells = Array.from(tr.children).filter((c) =>
        ["td", "th"].includes(c.tagName.toLowerCase())
      );
      const rowHasHeader = isHeader || cells.some((c) => c.tagName.toLowerCase() === "th");
      const cellsHtml = cells
        .map((cell) => {
          const tag = cell.tagName.toLowerCase();
          const inner = (cell as HTMLElement).innerHTML || "";
          const style = rowHasHeader
            ? "background:#F1F5F9;border:1px solid #CBD5E1;padding:6px 10px;text-align:left;font-weight:600;"
            : "border:1px solid #CBD5E1;padding:6px 10px;";
          return `<${tag} style="${style}">${inner}</${tag}>`;
        })
        .join("");
      rows.push(`<tr>${cellsHtml}</tr>`);
    }
  };

  const thead = tableEl.querySelector(":scope > thead") as HTMLElement | null;
  const tbody = tableEl.querySelector(":scope > tbody") as HTMLElement | null;
  if (thead) collectRows(thead, true);
  if (tbody) {
    collectRows(tbody, false);
  } else {
    const directTrs = Array.from(tableEl.children).filter(
      (c) => c.tagName.toLowerCase() === "tr"
    );
    if (directTrs.length > 0) {
      const syntheticTbody = document.createElement("tbody");
      directTrs.forEach((c) => syntheticTbody.appendChild(c));
      collectRows(syntheticTbody, false);
    }
  }

  return `<table style="border-collapse:collapse;width:100%;margin:10px 0;font-size:12px;">${rows.join("")}</table>`;
};

export const renderHtmlSummary = (html: string): string => {
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), "text/html");
  const body = doc.body;
  const out: string[] = [];

  const walk = (node: ChildNode): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").trim();
      if (text) {
        out.push(`<p style="margin:6px 0;">${escapeHtml(text)}</p>`);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim() || "";

    switch (tag) {
      case "h1":
        out.push(`<h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:20px 0 10px;border-bottom:2px solid #e2e8f0;padding-bottom:6px;">${el.innerHTML}</h1>`);
        return;
      case "h2":
        out.push(`<h2 style="font-size:16px;font-weight:700;color:#4338ca;margin:16px 0 8px;">${el.innerHTML}</h2>`);
        return;
      case "h3":
        out.push(`<h3 style="font-size:14px;font-weight:700;color:#1e293b;margin:14px 0 6px;">${el.innerHTML}</h3>`);
        return;
      case "h4":
      case "h5":
      case "h6":
        out.push(`<${tag} style="font-size:13px;font-weight:700;color:#1e293b;margin:12px 0 4px;">${el.innerHTML}</${tag}>`);
        return;
      case "p":
        if (text) {
          out.push(`<p style="margin:6px 0;">${el.innerHTML}</p>`);
        }
        return;
      case "ul":
      case "ol":
        out.push(`<${tag} style="margin:8px 0;padding-left:24px;">${el.innerHTML}</${tag}>`);
        return;
      case "li":
        out.push(`<li style="margin:3px 0;">${el.innerHTML}</li>`);
        return;
      case "blockquote":
        out.push(`<blockquote style="border-left:4px solid #cbd5e1;padding:4px 12px;margin:8px 0;color:#475569;font-style:italic;">${el.innerHTML}</blockquote>`);
        return;
      case "br":
        out.push("<br/>");
        return;
      case "table":
        out.push(renderHtmlTable(el));
        return;
      case "thead":
      case "tbody":
      case "tr":
      case "td":
      case "th":
        return;
      default:
        el.childNodes.forEach(walk);
        return;
    }
  };

  body.childNodes.forEach(walk);
  return out.join("\n");
};

export const summaryToHtml = (summary: string): string => {
  if (!summary.trim()) return "";
  if (summary.trimStart().startsWith("<")) {
    return renderHtmlSummary(summary);
  }

  const lines = summary.split(/\r?\n/);
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  const openList = (type: "ul" | "ol") => {
    if (listType !== type) {
      closeList();
      out.push(`<${type} style="margin:8px 0;padding-left:24px;">`);
      listType = type;
    }
  };

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.replace(/\s+$/, "");

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
      out.push(renderMarkdownTable(tableLines));
      continue;
    }

    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    const bullet = line.match(/^\s*([-*+])\s+(.*)/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)/);
    const quote = line.match(/^\s*>\s+(.*)/);

    if (h1) {
      closeList();
      out.push(`<h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:20px 0 10px;border-bottom:2px solid #e2e8f0;padding-bottom:6px;">${inlineMarkdownToHtml(h1[1])}</h1>`);
    } else if (h2) {
      closeList();
      out.push(`<h2 style="font-size:16px;font-weight:700;color:#4338ca;margin:16px 0 8px;">${inlineMarkdownToHtml(h2[1])}</h2>`);
    } else if (h3) {
      closeList();
      out.push(`<h3 style="font-size:14px;font-weight:700;color:#1e293b;margin:14px 0 6px;">${inlineMarkdownToHtml(h3[1])}</h3>`);
    } else if (bullet) {
      openList("ul");
      out.push(`<li style="margin:3px 0;">${inlineMarkdownToHtml(bullet[2])}</li>`);
    } else if (numbered) {
      openList("ol");
      out.push(`<li style="margin:3px 0;">${inlineMarkdownToHtml(numbered[2])}</li>`);
    } else if (quote) {
      closeList();
      out.push(`<blockquote style="border-left:4px solid #cbd5e1;padding:4px 12px;margin:8px 0;color:#475569;font-style:italic;">${inlineMarkdownToHtml(quote[1])}</blockquote>`);
    } else {
      closeList();
      out.push(`<p style="margin:6px 0;">${inlineMarkdownToHtml(line)}</p>`);
    }
    i++;
  }
  closeList();
  return out.join("\n");
};
