import { NextResponse } from "next/server";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { AiAccountError, getAiAccountStatus, removeGeminiKey, saveGeminiKey } from "@/app/lib/ai-account";
import { checkRateLimit } from "@/app/lib/rate-limit";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;
  try { return json(await getAiAccountStatus(auth.uid)); }
  catch { return json({ error: "Không tải được thiết lập AI. Vui lòng thử lại." }, 503); }
}
export async function PUT(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!checkRateLimit(`ai-key:${auth.uid}`, 5, 60_000).allowed) return json({ error: "Vui lòng đợi một phút trước khi kiểm tra key tiếp." }, 429);
  try {
    const body = await req.json();
    if (body.paidServiceConfirmed !== true) return json({ error: "Hãy xác nhận project API key đã bật Cloud Billing để xử lý dữ liệu cuộc họp bằng Gemini Paid Services." }, 400);
    const key = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!/^AIza[A-Za-z0-9_-]{30,100}$/.test(key)) return json({ error: "Gemini API key không đúng định dạng." }, 400);
    // A tiny, fixed prompt checks actual generation access without sending any meeting content.
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "gemini-3.7-flash", messages: [{ role: "user", content: "Reply OK." }], max_tokens: 256 }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return json({ error: "Không kiểm tra được key: hãy kiểm tra quyền dùng Gemini, hạn mức và billing của project. Key cũ vẫn được giữ." }, 422);
    const result = await response.json();
    if (!result.choices?.[0]?.message?.content) return json({ error: "Gemini chưa trả kết quả kiểm tra. Key cũ vẫn được giữ." }, 422);
    await saveGeminiKey(auth.uid, key);
    return json(await getAiAccountStatus(auth.uid));
  } catch (error) {
    return json({ error: error instanceof AiAccountError ? error.message : "Không lưu được key. Vui lòng thử lại; key cũ vẫn được giữ." }, 503);
  }
}
export async function DELETE(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;
  try { await removeGeminiKey(auth.uid); return json(await getAiAccountStatus(auth.uid)); }
  catch { return json({ error: "Không xóa được key. Vui lòng thử lại." }, 503); }
}
