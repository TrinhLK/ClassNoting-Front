/**
 * Parse JSON từ response của AI, robust trước các trường hợp:
 * - Markdown code blocks: ```json\n{...}\n```
 * - Extra text trước/sau JSON
 * - Trailing commas
 * `prefer`: ưu tiên loại JSON khi có cả 2 (object/array) trong text.
 */
export const parseAiJson = (
  raw: string,
  context: string,
  prefer: "object" | "array" = "object"
): unknown => {
  const text = (raw || "").trim();
  if (!text) throw new Error(`AI trả về rỗng (${context})`);

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;

  const stripTrailing = (s: string) => s.replace(/,(\s*[}\]])/g, "$1");

  try {
    return JSON.parse(candidate);
  } catch {
    // Tiếp tục fallback
  }

  try {
    return JSON.parse(stripTrailing(candidate));
  } catch {
    // Tiếp tục fallback
  }

  const tryObj = (s: string) => {
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return undefined;
    try { return JSON.parse(stripTrailing(m[0])); } catch { return undefined; }
  };
  const tryArr = (s: string) => {
    const m = s.match(/\[[\s\S]*\]/);
    if (!m) return undefined;
    try { return JSON.parse(stripTrailing(m[0])); } catch { return undefined; }
  };

  const primary = prefer === "array" ? tryArr(candidate) : tryObj(candidate);
  if (primary !== undefined) return primary;
  const fallback = prefer === "array" ? tryObj(candidate) : tryArr(candidate);
  if (fallback !== undefined) return fallback;

  console.error(`[${context}] AI response không parse được:`, text.slice(0, 500));
  throw new Error(`AI trả về JSON không hợp lệ (${context})`);
};