/**
 * CJK (Chinese/Japanese/Korean) — bao gồm Hiragana, Katakana,
 * CJK Unified Ideographs (BMP), CJK Extension A, CJK Compatibility,
 * và Hangul Syllables. Áp dụng để strip contamination
 * khi model AI (đặc biệt mimo-v2.5) lỡ trộn từ ngữ nước ngoài
 * vào output tiếng Việt.
 *
 * Không bao gồm:
 * - Emoji (U+1F300+)
 * - CJK Extension B-F (U+20000+) — surrogate pair, hiếm gặp
 * - Ký tự Latin có dấu (tiếng Việt: à, ế, ọ, …)
 * - Ký tự đặc biệt: ✓, ✗, →, …
 */
const CJK_REGEX = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]+/g;

export const stripCjk = (text: string): string => {
  if (!text) return "";
  return text
    .replace(CJK_REGEX, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+(?=\n)/g, "")
    .replace(/^[ \t]+/gm, "")
    .trim();
};

/**
 * Strip inline reasoning/thinking blocks khỏi output model.
 * Một số model (đặc biệt khi reasoning bật) nhúng reasoning vào `content`
 * thay vì tách riêng vào `reasoning_content`, làm response bị leak
 * cả chain-of-thought vào summary.
 *
 * Cover các variant phổ biến:
 * - `<!-- ... -->` (DeepSeek/MiMo style)
 * - `<|thinking|>...<|/thinking|>`, `<|reasoning|>...<|/reasoning|>` (Qwen/Kimi style)
 * - `<thinking>...</thinking>`, `<reasoning>...</reasoning>` (Qwen raw thinking style)
 * - `<thinking/>` (self-closing — Qwen sometimes uses `<think/>`)
 */
export const stripThinking = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\|thinking\|>[\s\S]*?<\|\/thinking\|>/gi, "")
    .replace(/<\|reasoning\|>[\s\S]*?<\|\/reasoning\|>/gi, "")
    .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<reasoning[^>]*>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<think\s*\/>/gi, "")
    .replace(/<think\s*>[^<]*<\/think\s*>/gi, "")
    .trim();
};

/**
 * Strip mốc thời gian dạng `[mm:ss]` hoặc `[hh:mm:ss]` khỏi text.
 * Áp dụng cho nội dung summary khi xuất DOCX/PDF — tránh in mốc
 * thời gian inline trong từng bullet heading trong khi đã có header
 * riêng (Ngày / Thời lượng) ở đầu trang.
 *
 * Chỉ match khi có digits:digit:digit; KHÔNG match `[đề xuất]`,
 * `[v3.0]` (có chữ cái/letters trong ngoặc).
 */
export const stripTimestamps = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+/gm, "")
    .trim();
};

/** Remove internal transcript/chat evidence IDs from reader-facing minutes. */
export const stripEvidenceReferences = (text: string): string => {
  if (!text) return "";
  const id = String.raw`(?:segment\s*:\s*seg(?:ment)?[_:-]?\d[A-Za-z0-9_-]*|chat\s*:\s*chat[_:-]?[A-Za-z0-9_-]+|seg(?:ment)?[_:-]?\d[A-Za-z0-9_-]*)`;
  return text
    // IDs can be emitted alone or as a comma-separated evidence list.
    .replace(new RegExp(String.raw`\[(?:\s*${id}\s*,?)+\]`, "gi"), "")
    // Also remove the machine-readable prefix when the model placed it outside brackets.
    .replace(new RegExp(String.raw`\b(?:segment\s*:\s*seg(?:ment)?[_:-]?\d[A-Za-z0-9_-]*|chat\s*:\s*chat[_:-]?[A-Za-z0-9_-]+)\b`, "gi"), "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]+(?=\n)/g, "")
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n")
    .trim();
};

/** Restore the topic → detail hierarchy when a model flattened Markdown bullets. */
export const normalizeMinuteMarkdown = (text: string): string => {
  if (!text || text.trimStart().startsWith("<")) return text;
  let topicIndent: number | null = null;
  return text.split(/\r?\n/).map((line) => {
    const topic = line.match(/^(\s*)[-*+]\s+\*\*?\[[^\]]+\]\s*:?\*\*?/);
    if (topic) {
      topicIndent = topic[1].replace(/\t/g, "  ").length;
      return line;
    }
    if (/^\s*#{1,6}\s+/.test(line)) {
      topicIndent = null;
      return line;
    }
    const bullet = line.match(/^(\s*)([-*+])\s+(.*)$/);
    if (topicIndent !== null && bullet) {
      const indent = bullet[1].replace(/\t/g, "  ").length;
      if (indent <= topicIndent) return `  ${line}`;
    }
    return line;
  }).join("\n");
};
