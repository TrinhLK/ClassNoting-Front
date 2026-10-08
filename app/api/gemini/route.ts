// app/api/gemini/route.ts
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { stripCjk, stripEvidenceReferences, stripThinking } from "@/app/lib/text";
import { parseAiJson } from "@/app/lib/json-parser";
import { isValidAiSessionId } from "@/app/lib/ai-session";

const API_KEY = process.env.GOOGLE_AI_API_KEY || "";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const MODELS = {
  segment: "gemini-3.7-flash",
  full: "gemini-3.7-flash",
  qa: "gemini-3.7-flash",
  fill_placeholders: "gemini-3.7-flash",
  detect_fill: "gemini-3.7-flash",
  extract_json: "gemini-3.7-flash",
};
const DEFAULT_MODEL = "gemini-3.7-flash";
const FALLBACK_MODELS = ["gemini-3.6-flash"];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

type DiagnosticContext = { requestId: string; mode: string };

function logDiagnostic(event: string, context: DiagnosticContext, metadata: Record<string, unknown> = {}) {
  console.info("[gemini]", { event, ...context, ...metadata });
}

function tokenUsage(usage: any) {
  const result: Record<string, number> = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens", "reasoning_tokens"]) {
    const value = key === "reasoning_tokens"
      ? usage?.completion_tokens_details?.reasoning_tokens ?? usage?.reasoning_tokens
      : usage?.[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) result[key] = value;
  }
  return result;
}

async function generateWithRetry(prompt: string, model: string, mode: string, sessionId: string, diagnostic: DiagnosticContext, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const startedAt = performance.now();
    const metadata = { requestedModel: model, attempt };
    let reason = "response";
    const logRetry = (retryReason: string, status?: number) => logDiagnostic("retry", diagnostic, {
      ...metadata, reason: retryReason, ...(status === undefined ? {} : { status }),
      backoffMs: 1000 * Math.pow(2, attempt - 1),
    });
    logDiagnostic("attempt_start", diagnostic, metadata);
    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 32768,
        }),
      });
      logDiagnostic("headers", diagnostic, { ...metadata, status: response.status, headersMs: performance.now() - startedAt });
      if (!response.ok) {
        reason = "http";
        let bodyReadFailed = false;
        const errorBody = await response.text().catch(() => { bodyReadFailed = true; return ""; });
        logDiagnostic(bodyReadFailed ? "body_failure" : "body_complete", diagnostic, { ...metadata, status: response.status, durationMs: performance.now() - startedAt });
        if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
          logRetry("http", response.status);
          await delay(1000 * Math.pow(2, attempt - 1));
          continue;
        }
        throw new Error(`API error: ${response.status} ${response.statusText} — ${errorBody}`);
      }
      const data = await response.json();
      logDiagnostic("body_complete", diagnostic, { ...metadata, status: response.status, durationMs: performance.now() - startedAt });
      const message = data.choices?.[0]?.message;
      const raw = (message?.content || message?.reasoning_content || "").trim();
      const content = stripThinking(raw);
      if (content) {
        logDiagnostic("attempt_success", diagnostic, {
          ...metadata, durationMs: performance.now() - startedAt,
          ...(typeof data.model === "string" ? { returnedModel: data.model } : {}),
          usage: tokenUsage(data.usage),
        });
        return content;
      }
      reason = "empty";
      if (attempt < retries) {
        logRetry("empty");
        await delay(1000 * Math.pow(2, attempt - 1));
        continue;
      }
      throw new Error("Model trả về nội dung rỗng sau " + retries + " lần thử");
    } catch (error: any) {
      const isNetworkErr = error?.name === "AbortError"
        || error?.code === "ECONNRESET"
        || error?.code === "ETIMEDOUT"
        || error?.code === "ENOTFOUND"
        || error?.cause?.code === "ECONNRESET";
      if (attempt < retries && isNetworkErr) {
        logRetry("network");
        await delay(1000 * Math.pow(2, attempt - 1));
        continue;
      }
      logDiagnostic("attempt_failure", diagnostic, { ...metadata, reason: isNetworkErr ? "network" : reason, durationMs: performance.now() - startedAt });
      throw error;
    }
  }
  throw new Error("Retry failed");
}

async function generateWithFallback(prompt: string, models: string[], mode: string, sessionId: string, requestId: string) {
  const startedAt = performance.now();
  // Never log arbitrary client mode values or upstream error messages/bodies.
  const diagnostic = { requestId, mode: Object.prototype.hasOwnProperty.call(MODELS, mode) ? mode : "unknown" };
  logDiagnostic("pipeline_start", diagnostic, { requestedModel: models[0], models });
  let lastError: unknown;
  for (const [index, model] of models.entries()) {
    try {
      const content = await generateWithRetry(prompt, model, mode, sessionId, diagnostic);
      logDiagnostic("pipeline_complete", diagnostic, { outcome: "success", requestedModel: model, durationMs: performance.now() - startedAt });
      return content;
    } catch (error) {
      lastError = error;
      const fallback = models[index + 1];
      if (fallback) {
        logDiagnostic("fallback", diagnostic, { requestedModel: model, fallbackModel: fallback });
      }
    }
  }
  logDiagnostic("pipeline_complete", diagnostic, { outcome: "failure", durationMs: performance.now() - startedAt });
  throw lastError;
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { allowed } = checkRateLimit(`gemini:${ip}`, 20, 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const { text, mode, sessionId, dateContext, previousSummary, departments, teams, question, history, templateStructure, meetingObjectives, placeholders, context, duration, createdAt } = await req.json();

    // Legacy clients have no reliable conversation key. Fail closed rather than
    // merge unrelated users or invent a new provider conversation on every turn.
    if (!isValidAiSessionId(sessionId)) {
      return NextResponse.json({ error: "Invalid or missing sessionId. Refresh the page and try again." }, { status: 400 });
    }

    if (mode !== "fill_placeholders" && mode !== "detect_fill" && !text) {
      return NextResponse.json({ error: "Thiếu nội dung text" }, { status: 400 });
    }

    const primaryModel = (MODELS as Record<string, string>)[mode] || DEFAULT_MODEL;
    const chosenModels = (MODELS as Record<string, string>)[mode]
      ? [...new Set([primaryModel, ...FALLBACK_MODELS])]
      : [primaryModel];

    let prompt = "";

    if (mode === "extract_json") {
      const deptListStr = departments?.join(", ") || "";
      const teamListStr = teams?.join(", ") || "";
      prompt = `
      Bạn là trợ lý AI chuyên trích xuất công việc (Action Item) từ biên bản cuộc họp.
      THÔNG TIN NGỮ CẢNH:
      - Thời gian diễn ra cuộc họp: ${dateContext || "Hôm nay"} (Hãy dùng ngày này làm mốc để tính toán các từ chỉ thời gian như 'ngày mai', 'thứ 6 tới').
      - Danh sách Phòng ban (Department): [${deptListStr}]
      - Danh sách Nhóm (Team): [${teamListStr}]
      NHIỆM VỤ: Phân tích đoạn hội thoại (Transcript) dưới đây và trích xuất danh sách các nhiệm vụ/công việc cần thực hiện SAU CUỘC HỌP (Action Items).
      
      ⚠️ QUAN TRỌNG - CHỈ TRÍCH XUẤT CÔNG VIỆC SAU CUỘC HỌP:
      - ✅ BẮT BUỘC bao gồm: Các nhiệm vụ cần làm SAU KHI cuộc họp kết thúc (Ví dụ: "Tôi sẽ gửi báo cáo vào thứ 2", "Anh X hãy chuẩn bị tài liệu cho buổi họp tiếp theo", "Tuần sau phải hoàn thành...")
      - ❌ LOẠI TRỪ hoàn toàn: Các hoạt động ĐANG DIỄN RA TRONG cuộc họp (Ví dụ: "Chúng ta đang thảo luận về...", "Tôi đang trình bày...", "Hãy cùng xem qua...", "Bây giờ chúng ta sẽ nói về...")
      
      QUY TẮC MAPPING (Ưu tiên từ trên xuống dưới):
      1. Nếu nhắc đến TÊN RIÊNG -> Điền "assignee".
      2. Nếu nhắc đến TEAM/Phòng cụ thể (VD: "Team Mobile", "Đội Web", ...) -> Điền field "team" (phải khớp chính xác danh sách Team ở trên).
      3. Nếu chỉ nhắc đến PHÒNG BAN chung (VD: "Phòng IT", "Kế toán") -> Điền field "department".(phải khớp chính xác danh sách Phòng ở trên).
      
      VĂN BẢN ĐẦU VÀO:
      "${text}"

      YÊU CẦU XỬ LÝ:
        1. CHỈ tìm các công việc cần làm SAU cuộc họp: lời hứa, cam kết, kế hoạch hành động (Ví dụ: "Tôi sẽ gửi...", "Bạn hãy làm...", "Tuần sau phải xong...", "Deadline là...").
        2. BỎ QUA hoàn toàn:
           - Các hoạt động đang diễn ra TRONG cuộc họp (thảo luận, trình bày, chia sẻ ý kiến...)
           - Câu chào hỏi, giới thiệu, cảm xúc chung chung
           - Các câu mô tả tình trạng hiện tại không kèm cam kết hành động
        3. Nếu không tìm thấy bất kỳ nhiệm vụ SAU CUỘC HỌP nào, hãy trả về mảng rỗng [].
      
      CẤU TRÚC JSON:
      [
        {
          "task": "Mô tả công việc ngắn gọn",
          "assignee": "Tên người được giao (Nếu không rõ ghi 'Chưa rõ')",
          "team": "Tên Team (nếu có) hoặc null",
          "department": "Tên Phòng (nếu có) hoặc null",
          "deadline": "YYYY-MM-DDTHH:mm (Hãy quy đổi các cụm từ như 'chiều nay 5h', 'thứ 2 tuần sau' thành định dạng ngày giờ cụ thể dựa trên mốc thời gian trên. Nếu không xác định được giờ thì để cuối ngày. Nếu không có deadline thì ghi 'Chưa rõ')"
        }
      ]
      QUAN TRỌNG: Chỉ trả về JSON Array thuần túy, không dùng Markdown \`\`\`json.
      `;
      const rawText = await generateWithFallback(prompt, chosenModels, mode, sessionId, requestId);
      const parsed = parseAiJson(rawText, "extract_json", "array");
      const cleanText = Array.isArray(parsed)
        ? JSON.stringify(parsed, (_k, v) => typeof v === "string" ? stripCjk(v) : v)
        : "[]";
      return NextResponse.json({ summary: cleanText });
    } else if (mode === "segment") {
      prompt = `
      Bạn là chuyên gia ghi chép biên bản cuộc họp theo thời gian thực (Live-taker).
      Nhiệm vụ: Tóm tắt đoạn hội thoại mới nhất ("VĂN BẢN MỚI") để nối tiếp vào biên bản ("NGỮ CẢNH").

      ⚠️ QUAN TRỌNG: TUYỆT ĐỐI CHỈ TRẢ LỜI BẰNG TIẾNG VIỆT. KHÔNG được dùng tiếng Anh hay bất kỳ ngôn ngữ nào khác.

      QUY TRÌNH TƯ DUY (Không in ra):
      1. So sánh "VĂN BẢN MỚI" với "NGỮ CẢNH" xem có thông tin gì thực sự mới không.
      2. Nếu "VĂN BẢN MỚI" chỉ là lặp lại ý cũ, lời ậm ừ, hoặc các câu đệm vô nghĩa -> Bỏ qua.
      3. Nếu có ý mới -> Viết lại súc tích, ngắn gọn nhất có thể.

      YÊU CẦU ĐẦU RA (BẮT BUỘC):
      - Tuyệt đối KHÔNG nhắc lại những gì đã có trong "NGỮ CẢNH".
      - Chỉ xuất ra thông tin mới (Incremental Update).
      - Nếu đoạn văn bản vô nghĩa hoặc lặp hoàn toàn -> Trả về rỗng hoặc câu cực ngắn.
      - Không dùng các từ nối rườm rà như "Tiếp theo", "Sau đó", "Ông ấy nói rằng". Đi thẳng vào nội dung.
      - Giữ nguyên thuật ngữ chuyên ngành hoặc tên gọi.
      - CHỈ SỬ DỤNG TIẾNG VIỆT trong toàn bộ output.

      -----
      NGỮ CẢNH (Những gì đã diễn ra trước đó):
      "${previousSummary || "Chưa có thông tin."}"
      
      VĂN BẢN MỚI (Cần xử lý):
      "${text}"
      -----
      `;
    } else if (mode === "fill_placeholders") {
      const placeholderList = Array.isArray(placeholders) ? placeholders : [];
      if (placeholderList.length === 0) {
        return NextResponse.json({ summary: "{}" });
      }

      const contextSummary = context?.summary?.trim() || "";
      const contextSpeakers = Array.isArray(context?.speakers) ? context.speakers.join(", ") : "";
      const contextObjectives = context?.objectives?.trim() || "";

      const contextBlock = [
        contextSummary ? `- Tóm tắt cuộc họp:\n${contextSummary}` : "",
        contextSpeakers ? `- Người tham gia: ${contextSpeakers}` : "",
        contextObjectives ? `- Mục tiêu cuộc họp: ${contextObjectives}` : "",
      ].filter(Boolean).join("\n") || "- Không có ngữ cảnh bổ sung.";

      prompt = `
      Bạn là trợ lý AI chuyên điền giá trị cho các biểu mẫu hợp đồng, văn bản, tài liệu Word có chứa placeholder.

      DANH SÁCH PLACEHOLDER CẦN ĐIỀN:
      ${placeholderList.map((p: string) => `- {{${p}}}`).join("\n")}

      NGỮ CẢNH CUỘC HỌP (nếu có, hãy dựa vào đó để điền chính xác):
      ${contextBlock}

      NHIỆM VỤ:
      Với mỗi placeholder, hãy đưa ra giá trị hợp lý nhất dựa trên tên placeholder và ngữ cảnh được cung cấp. Sử dụng tiếng Việt nếu placeholder không chỉ định ngôn ngữ khác.

      QUY TẮC:
      1. Trả về MỘT JSON object duy nhất, key = chính xác tên placeholder (giữ nguyên cách viết), value = giá trị điền.
      2. Không thêm bất kỳ placeholder nào không có trong danh sách.
      3. Giá trị phải ngắn gọn, phù hợp với tên field. Ví dụ: TEN_KHACH_HANG -> tên người; NGAY_KY -> ngày/tháng/năm; SO_TIEN -> con số có đơn vị.
      4. Nếu không chắc chắn, đưa ra giá trị hợp lý theo mặc định (ví dụ NGAY -> hôm nay, SO -> số 0, TEN -> [Chưa có]).
      5. CHỈ trả về JSON thuần túy, không dùng Markdown code block.
      `;
    } else if (mode === "detect_fill") {
      const contextSummary = context?.summary?.trim() || "";
      const contextSpeakers = Array.isArray(context?.speakers) ? context.speakers.join(", ") : "";
      const contextObjectives = context?.objectives?.trim() || "";

      const contextBlock = [
        contextSummary ? `- Tóm tắt cuộc họp:\n${contextSummary}` : "",
        contextSpeakers ? `- Người tham gia: ${contextSpeakers}` : "",
        contextObjectives ? `- Mục tiêu cuộc họp: ${contextObjectives}` : "",
      ].filter(Boolean).join("\n") || "- Không có ngữ cảnh bổ sung.";

      prompt = `
      Bạn là trợ lý AI chuyên điền giá trị cho các biểu mẫu, hợp đồng, văn bản Word.

      NỘI DUNG FILE WORD (text đã trích xuất):
      """
      ${text}
      """

      NHIỆM VỤ:
      Đọc nội dung file và xác định TẤT CẢ các vị trí cần điền thông tin, gồm:
      1. Các chuỗi trống thể hiện chỗ cần điền: gạch dưới (____, ___), dấu chấm lửng (......, .........), khoảng trống dài (   ), dấu gạch ngang đơn sau nhãn field.
      2. Các field có nhãn nhưng chưa có giá trị, ví dụ "Tên khách hàng:", "Ngày ký:", "Số tiền:" (nếu phía sau trống).
      3. Các ô/trường rõ ràng cần điền theo văn cảnh.

      Với mỗi vị trí cần điền, trả về:
      - "marker": chuỗi ký tự GỐC chính xác trong văn bản cần thay thế (VD: "______", "............", hoặc "Tên khách hàng:" nếu là field). Đây là chuỗi sẽ được tìm và thay thế.
      - "value": giá trị hợp lý điền vào (dựa trên tên field / nhãn / ngữ cảnh). Nếu có NGỮ CẢNH CUỘC HỌP thì dựa vào đó để chính xác.

      QUY TẮC:
      1. CHỈ thêm các vị trí thực sự cần điền. Không thêm thông tin đã có sẵn giá trị.
      2. Mỗi marker phải là chuỗi gốc duy nhất tìm thấy được trong văn bản (đủ dài để không nhầm lẫn).
      3. Nếu không tìm thấy chỗ trống nào, trả mảng rỗng [].
      4. Trả về JSON Array thuần túy dạng [{"marker": "...", "value": "..."}], không dùng Markdown code block.

      NGỮ CẢNH CUỘC HỌP (nếu có):
      ${contextBlock}
      `;
      const rawText = await generateWithFallback(prompt, chosenModels, mode, sessionId, requestId);
      const cleanText = stripCjk(rawText.replace(/```json|```/g, "").trim());
      return NextResponse.json({ summary: cleanText });
    } else if (mode === "qa") {
      const historyStr = history?.map((m: any) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join("\n") || "";

      prompt = `
      Bạn là trợ lý AI thông minh, chuyên trả lời câu hỏi dựa trên biên bản cuộc họp.
      
      NGỮ CẢNH (Nội dung các cuộc họp đã chọn):
      ---------------------
      ${text}
      ---------------------

      LỊCH SỬ TRÒ CHUYỆN TRƯỚC ĐÓ:
      ${historyStr}

      CÂU HỎI MỚI NHẤT CỦA NGƯỜI DÙNG:
      "${question}"

      YÊU CẦU TRẢ LỜI:
      1. Trả lời chính xác, ngắn gọn, súc tích dựa trên ngữ cảnh được cung cấp.
      2. Nếu thông tin không có trong ngữ cảnh, hãy nói "Tôi không tìm thấy thông tin này trong các biên bản đã chọn."
      3. TRÍCH DẪN (BẮT BUỘC): 
         - Khi tham khảo thông tin, hãy chèn link trích dẫn ngay sau câu đó.
         - Cú pháp BẮT BUỘC: [[ID_CUỘC_HỌP|Đoạn văn bản trích dẫn ngắn]].
         - ID lấy từ dòng header "DOCUMENT ID: ...".
         - Ví dụ: "Theo báo cáo, doanh thu tăng trưởng mạnh [[meeting-id-123|doanh thu tăng 20%]]."
         - ⚠️ LƯU Ý QUAN TRỌNG: Đoạn trích dẫn (phần sau dấu |) phải COPY-PASTE CHÍNH XÁC 100% từ văn bản gốc, không được thay đổi bất kỳ ký tự nào, kể cả dấu câu. Nếu sửa đổi, tính năng tìm kiếm sẽ bị lỗi.
      4. Sử dụng format Markdown cho câu trả lời dễ đọc (bold, list...).
      `;
    } else {
      const structureInstruction = templateStructure || `
      # BIÊN BẢN TÓM TẮT CUỘC HỌP

      ## 1. TỔNG QUAN
      - **Mục đích:** (Tóm tắt mục tiêu chính của cuộc họp trong 1-2 dòng)
      - **Thành phần tham gia:** (Liệt kê tên/vai trò người tham gia nếu có trong transcript)

      ## 2. TÓM TẮT TỪNG CHỦ ĐỀ
      *(Liệt kê và diễn giải TẤT CẢ các chủ đề đã được thảo luận. Cuộc họp dài phải có nhiều mục con, mỗi mục chứa nội dung chi tiết)*
      - [mm:ss] **[Chủ đề 1]:**
        - Ai nói / trình bày: ...
        - Nội dung chi tiết: ...
        - Số liệu / dữ kiện cụ thể (nếu có): ...
        - Kết luận của chủ đề này: ...
      - [mm:ss] **[Chủ đề 2]:**
        - ...

      ## 3. QUYẾT ĐỊNH ĐÃ CHỐT
      *(Liệt kê TẤT CẢ các quyết định cuối cùng, ghi rõ ai quyết định và thời gian)*
      - [mm:ss] **[Quyết định 1]:** ... (người quyết định: ...)
      - [mm:ss] **[Quyết định 2]:** ...

      ## 4. PHÂN CÔNG NHIỆM VỤ (ACTION ITEMS)
      *(Ghi rõ ai làm gì, deadline khi nào — nếu transcript có nhắc đến)*
      - [ ] **[Tên người]** - [Nhiệm vụ cụ thể] - [Deadline (nếu có)]

      ## 5. VẤN ĐỀ CHƯA GIẢI QUYẾT / RỦI RO
      *(Các điểm còn bỏ ngỏ, chưa thống nhất, hoặc rủi ro được nhắc đến trong cuộc họp)*
      - ...

      ## 6. GHI CHÚ BỔ SUNG
      *(Số liệu quan trọng, câu nói đáng chú ý, hoặc thông tin khác worth noting)*
      - ...
      `;

      const durationMinutes = duration ? Math.floor(duration / 60) : 0;
      const isLongMeeting = durationMinutes >= 20;
      const isVeryLongMeeting = durationMinutes >= 45;

      const durationHint = isVeryLongMeeting
        ? `\n📌 CUỘC HỌP DÀI (${durationMinutes} PHÚT): Bao quát các chủ đề chính và quyết định có bằng chứng trong transcript. Giữ nội dung đủ để người đọc hiểu, nhưng không lặp ý hoặc bổ sung chi tiết không được nêu.`
        : isLongMeeting
          ? `\n📌 CUỘC HỌP DÀI (${durationMinutes} PHÚT): Tóm tắt đầy đủ các chủ đề chính, phân biệt rõ nội dung trao đổi với kết luận đã thống nhất; không lặp ý hoặc suy diễn.`
        : "";

      const objectivesPrompt = meetingObjectives
        ? `\n🎯 MỤC TIÊU CUỘC HỌP (TRỌNG TÂM CẦN BÁM SÁT):\nNgười dùng yêu cầu bạn đặc biệt tập trung tóm tắt và làm nổi bật các nội dung/thảo luận/quyết định có liên quan đến các mục tiêu dưới đây:\n"""\n${meetingObjectives}\n"""\n`
        : "";

      const pad2 = (n: number) => n.toString().padStart(2, "0");
      const startTs = typeof createdAt === "number" && !isNaN(createdAt) ? createdAt : null;
      const startDate = startTs ? new Date(startTs) : (dateContext ? new Date(dateContext) : null);
      const startTimeStr = startDate && !isNaN(startDate.getTime())
        ? `${pad2(startDate.getHours())}:${pad2(startDate.getMinutes())}`
        : "không rõ";
      const dateStr = startDate && !isNaN(startDate.getTime())
        ? `${pad2(startDate.getDate())}/${pad2(startDate.getMonth() + 1)}/${startDate.getFullYear()}`
        : "";
      const endDate = startDate && duration && !isNaN(startDate.getTime())
        ? new Date(startDate.getTime() + duration * 1000)
        : null;
      const endTimeStr = endDate
        ? `${pad2(endDate.getHours())}:${pad2(endDate.getMinutes())}`
        : "không rõ";
      const fullTimeStr = startDate && !isNaN(startDate.getTime())
        ? `${startTimeStr} - ${endTimeStr}, ngày ${dateStr}`
        : "không rõ";
      const startDateContextStr = startDate && !isNaN(startDate.getTime())
        ? startDate.toLocaleString("vi-VN")
        : dateContext || "không rõ";

      prompt = `
      Bạn là thư ký cuộc họp. Hãy lập biên bản tóm tắt bằng tiếng Việt theo văn phong hành chính: khách quan, rõ ý, mạch lạc, tiết chế; không cường điệu hoặc đưa nhận định chủ quan.
      ${durationHint}
      ${objectivesPrompt}
      THÔNG TIN CUỘC HỌP:
      - Thời gian bắt đầu: ${startDateContextStr}.
      - Thời lượng: ${duration ? `${Math.floor(duration / 60)} phút ${duration % 60} giây` : "không rõ"}.
      - Thời gian kết thúc: ${endTimeStr}.
      - Chuỗi thời gian chuẩn để fill vào template (nếu template có dòng "- **Thời gian:** HH:mm - HH:mm, ngày dd/mm/yyyy"): "${fullTimeStr}".
      (Dùng thời gian bắt đầu để quy đổi các cụm từ chỉ thời gian tương đối trong transcript như "ngày mai", "thứ 2 tới", "tuần sau" thành ngày cụ thể.)

      NGUYÊN TẮC TƯ DUY (KHÔNG IN RA):
      1. Đọc transcript và xác định các chủ đề chính, ý kiến, kết luận và việc cần làm có căn cứ.
      2. Phân biệt nội dung được đề xuất, đang xem xét và đã thống nhất; không biến trao đổi thành quyết định.
      3. Kiểm tra số liệu, đơn vị và mốc thời gian trực tiếp với transcript; nếu không rõ, ghi là chưa xác định.

      YÊU CẦU CỐT LÕI (XỬ LÝ DỮ LIỆU):
      1.  **Bảo toàn nguyên vẹn số liệu:** Mọi dữ kiện định lượng (con số, ngày tháng, thời gian, chi phí, số lượng, phần trăm...) phải được trích xuất CHÍNH XÁC TUYỆT ĐỐI như trong transcript.
        Lưu ý: Transcript là dạng văn nói (speech-to-text), nên các số thường bị viết thành từ ngữ âm tiếng Việt.
        Ví dụ: năm hai không hai tư -> nên chuyển thành 2024; phiên bản vê một -> nên chuyển thành phiên bản v1.
          * *Tuyệt đối không* tự ý làm tròn số (trừ khi được yêu cầu trong văn bản).
          * *Tuyệt đối không* suy đoán hay tự điền số liệu nếu transcript không nhắc đến.
      2.  **Viết khách quan, có mức độ:** Chỉ nêu thông tin có căn cứ trong transcript. Không phóng đại mức độ đồng thuận, kết quả, tác động hoặc tính chắc chắn; không lặp lại cùng một ý ở nhiều mục. Nếu không thể xác minh, ghi "Chưa xác định" hoặc "Chưa có kết luận".
      3.  **Gắn mốc thời gian (Timestamp):** Đây là yêu cầu BẮT BUỘC. Hãy chèn mốc thời gian bắt đầu của ý kiến hoặc chủ đề đó theo định dạng [mm:ss] (ví dụ: [01:23], [10:05]) vào đầu mỗi gạch đầu dòng hoặc tiêu đề mục lục nếu có thể. Điều này giúp người dùng dễ dàng đối chiếu với bản ghi âm.
      4.  **Ghi rõ người nói:** Khi một ý kiến hoặc quyết định được đưa ra, PHẢI ghi rõ ai là người nói (nếu transcript có tên/vai trò). Ví dụ: "[Anh Minh]: Dự án sẽ hoàn thành vào tháng 3."
      5.  **Bảo vệ dữ liệu nguồn:** Không đưa mã kỹ thuật như [segment:...], [seg_...], [chat:...] hoặc ID nội bộ vào biên bản.
      6.  **Phân cấp nội dung:** Mỗi chủ đề là một gạch đầu dòng cấp chính; nội dung, số liệu, kết luận và người trình bày là gạch đầu dòng con. Dùng chữ đậm cho nhãn ngắn cần định hướng, không bôi đậm cả đoạn.
      ${meetingObjectives ? `7.  **Định hướng nội dung theo mục tiêu:** Ưu tiên làm rõ các chi tiết liên quan trực tiếp đến "MỤC TIÊU CUỘC HỌP" đã nêu trên.` : ""}

      DỮ LIỆU ĐẦU VÀO:
      "${text}"

      YÊU CẦU ĐỊNH DẠNG ĐẦU RA (Markdown):
      Hãy viết biên bản dựa trên cấu trúc (Template) sau đây:

      ${structureInstruction}

      ⚠️ QUY TẮC BẮT BUỘC KHI ÁP DỤNG TEMPLATE:
      1. **Giữ nguyên 100% cấu trúc template**: heading, bullet, **bảng markdown** (nếu có).
         Nếu template chứa bảng Markdown (có dòng phân cách dạng | --- | --- |), BẮT BUỘC xuất bảng ở đúng vị trí đó — KHÔNG được thay bằng bullet hay danh sách.
      2. **Dòng "Thời gian:" trong template**: Nếu template có dòng bắt đầu bằng "- **Thời gian:**", BẮT BUỘC thay bằng đúng chuỗi thời gian đã chuẩn bị ở THÔNG TIN CUỘC HỌP (đã có sẵn trong prompt). KHÔNG giữ nguyên giá trị ví dụ/placeholder trong template. KHÔNG tự ý bịa thời gian.
      3. **Chỉ thay nội dung placeholder**: thay các chỗ có ngoặc vuông [...] hoặc chỗ trống (...) bằng nội dung thực tế từ transcript. Không tự ý thêm/bớt heading hay bullet ngoài template.
      4. **Ngôn ngữ:** Viết bằng tiếng Việt, giữ nguyên tên riêng và thuật ngữ chuyên ngành cần thiết.
      5. **Không tự điền nội dung mẫu:** Chỉ ghi mục có thông tin được transcript hỗ trợ; nếu template bắt buộc có mục nhưng transcript không đề cập, ghi "Không có thông tin trong bản ghi".

      LƯU Ý TRÌNH BÀY:
      - Văn phong hành chính, trung tính, chuyên nghiệp; câu ngắn vừa phải, tránh khẩu ngữ, từ cảm thán và nhận định cường điệu.
      - Tuân thủ chặt chẽ cấu trúc đề bài (các mục H1, H2...).
      - Mỗi ý chính hoặc mục thảo luận nên có mốc thời gian [mm:ss] đi kèm.
      - Nếu transcript có thông tin mâu thuẫn (VD: Lúc đầu nói A, sau sửa thành B), hãy ghi nhận thông tin cuối cùng đã được chốt lại (B).
      - Sắp xếp ý theo chủ đề; tách đoạn và dùng gạch đầu dòng con cho nội dung chi tiết, không dồn nhiều ý độc lập vào một đoạn.
      `;
    }

    const generated = stripCjk(await generateWithFallback(prompt, chosenModels, mode, sessionId, requestId));
    const summary = mode === "full" ? stripEvidenceReferences(generated) : generated;
    return NextResponse.json({ summary });

  } catch (error: any) {
    console.error("[gemini]", { event: "route_failure", requestId });
    const errorMessage = error.status === 503
      ? "Hệ thống AI đang quá tải, vui lòng thử lại sau."
      : (error.message || "Lỗi xử lý AI.");
    return NextResponse.json({ error: errorMessage, detail: error.message }, { status: 500 });
  }
}
