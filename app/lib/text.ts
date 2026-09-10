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
