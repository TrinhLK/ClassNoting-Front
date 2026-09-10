/**
 * Loại bỏ các thẻ HTML nguy hiểm và event handlers để chống XSS.
 * Dùng trước khi render AI summary / minutes content dạng HTML.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, "")
    .replace(/<iframe\b[^>]*\/?>/gi, "")
    .replace(/<object\b[^>]*>[\s\S]*?<\/object\s*>/gi, "")
    .replace(/<object\b[^>]*\/?>/gi, "")
    .replace(/<embed\b[^>]*>[\s\S]*?<\/embed\s*>/gi, "")
    .replace(/<embed\b[^>]*\/?>/gi, "")
    .replace(/<link\b[^>]*\/?>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<style\b[^>]*\/?>/gi, "")
    .replace(/<meta\b[^>]*\/?>/gi, "")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi, "")
    .replace(/<base\b[^>]*\/?>/gi, "")
    .replace(/<[^>]*\s+on\w+\s*=\s*["'][^"']*["'][^>]*>/gi, (match) => match.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, ""))
    .replace(/<[^>]*\s+on\w+\s*=\s*[^\s>]+/gi, (match) => match.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, ""))
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "data:BLOCKED");
}
