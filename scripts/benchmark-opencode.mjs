// Live, quota-consuming benchmark: node scripts/benchmark-opencode.mjs
// Five sequential calls, no retries, 60s per call; synthetic data only.
// Opt-in: --full-minimax runs ONE full-summary call instead, with a 90s timeout.
import nextEnv from '@next/env';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
// Suppress env-loader diagnostics so neither paths nor raw errors are logged.
nextEnv.loadEnvConfig(root, true, { info() {}, error() {} });
const key = process.env.OPEN_CODE_GO_API_KEY;
const log = (value) => console.log(JSON.stringify(value));
const prompt = `Tóm tắt cuộc họp giả lập sau bằng đúng 3 gạch đầu dòng tiếng Việt ngắn, mỗi dòng tối đa 20 từ. Chỉ xuất bản tóm tắt, không giải thích.
[00:00] An: Nhóm thống nhất phát hành bản thử nghiệm vào ngày 15/09/2026.
[00:20] Bình: Tôi sẽ sửa lỗi đăng nhập trước ngày 10/09/2026.
[00:40] Chi: Tôi sẽ kiểm thử và gửi báo cáo trước ngày 12/09/2026. Ngân sách kiểm thử là 5 triệu đồng.`;
const trials = [
  { model: 'deepseek-v4-flash' },
  { model: 'minimax-m3' },
  { model: 'mimo-v2.5' },
  { model: 'deepseek-v4-flash', reasoning: false },
  { model: 'minimax-m3', reasoning: false },
];
// Only known error identifiers are emitted, never arbitrary upstream strings.
const safeErrors = new Set([
  'invalid_request_error', 'authentication_error', 'permission_error',
  'rate_limit_error', 'insufficient_quota', 'model_not_found',
  'server_error', 'api_error', 'overloaded_error', 'invalid_api_key',
]);
const safeError = (value) => safeErrors.has(value) ? value : null;
const identifier = (value) => typeof value === 'string' && /^[a-zA-Z0-9._:/-]{1,100}$/.test(value) && !value.includes(key) ? value : null;
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const chars = (value) => typeof value === 'string' ? [...value].length : 0;

async function fullPrompt() {
  // Read only source code, not meeting data. Reuse the actual default full template
  // without importing the route (which would execute server-only dependencies).
  const source = (await readFile(new URL('../app/api/gemini/route.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const structure = source.match(/const structureInstruction = templateStructure \|\| `([\s\S]*?)`;/)?.[1];
  let template = source.match(/prompt = `(\n      Bạn là Thư Ký[\s\S]*?)`;/)?.[1];
  if (!structure || !template) throw new Error('template_unavailable');
  const text = `[00:00] An: Đây là cuộc họp giả lập về bản thử nghiệm quản lý tài liệu. Mục tiêu hôm nay là chốt phạm vi, ngân sách và người chịu trách nhiệm. Ngày phát hành dự kiến là 15/09/2026, nhưng chỉ phát hành khi kiểm thử đạt yêu cầu.
[01:10] Bình: Đăng nhập hiện có ba lỗi, gồm hết hạn phiên, quên mật khẩu và chuyển trang sau đăng nhập. Tôi sẽ sửa cả ba trước 17 giờ ngày 10/09/2026. Chưa có bằng chứng lỗi làm mất dữ liệu, nên đừng ghi nhận mất dữ liệu như sự việc đã xảy ra.
[02:20] Chi: Bộ kiểm thử có 48 trường hợp, đã chạy 36, trong đó 32 đạt và 4 không đạt. Tôi sẽ chạy lại toàn bộ sau khi Bình bàn giao. Báo cáo cuối cùng gửi trước 12 giờ ngày 12/09/2026, kèm danh sách lỗi còn mở.
[03:30] Dũng: Tôi đề xuất ngân sách kiểm thử 8 triệu đồng để bổ sung thiết bị. Chi cho rằng có thể dùng thiết bị sẵn có. Sau trao đổi, chúng ta chốt 5 triệu đồng, không phải 8 triệu; khoản này không bao gồm chi phí máy chủ.
[04:40] An: Phạm vi bản thử nghiệm gồm tải tài liệu, tìm kiếm và phân quyền đọc. Chức năng xuất báo cáo tự động chuyển sang giai đoạn sau. Không được coi đề xuất xuất báo cáo là nhiệm vụ phải hoàn thành trước đợt phát hành này.
[05:50] Bình: Khi thử với 200 tài liệu, tìm kiếm mất trung bình 1,8 giây. Mục tiêu là dưới 2 giây với 500 tài liệu. Tôi sẽ bổ sung chỉ mục và gửi số đo mới ngày 11/09/2026; hiện chưa có kết quả ở quy mô 500 tài liệu.
[07:00] Chi: Tôi không đồng ý bỏ kiểm thử phân quyền để kịp lịch. Tài khoản chỉ đọc phải bị chặn khi sửa hoặc xóa. Nhóm thống nhất đây là điều kiện bắt buộc, nếu còn lỗi nghiêm trọng thì dời phát hành chứ không bỏ bước kiểm thử.
[08:10] Dũng: Hướng dẫn sử dụng cần ba phần: đăng nhập, tải tài liệu và tìm kiếm. Tôi nhận soạn bản nháp trước ngày 11/09/2026, sau đó nhờ Chi rà soát. Hình minh họa sẽ dùng dữ liệu giả, không dùng hồ sơ hay thông tin khách hàng.
[09:20] An: Nhóm hỗ trợ có hai người tham gia buổi hướng dẫn ngày 14/09/2026 lúc 9 giờ. Dũng gửi tài liệu trước buổi này. Nếu kiểm thử chưa đạt, buổi hướng dẫn vẫn diễn ra trên môi trường thử nghiệm, không mở quyền truy cập hệ thống thật.
[10:30] Bình: Kế hoạch khôi phục là quay về phiên bản trước và phục hồi cấu hình, không tự động xóa tài liệu mới. Tôi sẽ thử quy trình trên môi trường riêng trước ngày 12/09/2026. Thời gian khôi phục mục tiêu là 15 phút, chưa được xác nhận bằng đo đạc.
[11:40] Chi: Báo cáo sẽ tách kết quả thực tế khỏi mục tiêu. Bốn lỗi hiện tại chưa được xác định mức độ, tôi sẽ phân loại trong chiều nay. An chịu trách nhiệm quyết định phát hành sau khi đọc báo cáo, không mặc định phát hành chỉ vì đã tới ngày dự kiến.
[13:00] An: Chốt ngân sách 5 triệu đồng và giữ kiểm thử phân quyền. Bình phụ trách sửa lỗi, hiệu năng và khôi phục; Chi phụ trách kiểm thử; Dũng phụ trách hướng dẫn. Cuộc họp tiếp theo lúc 14 giờ ngày 12/09/2026 để rà soát điều kiện phát hành.`;
  const values = {
    objectivesPrompt: '', meetingObjectives: '', text, structureInstruction: structure,
    startDateContextStr: '09:00:00 6/9/2026', endTimeStr: '09:15',
    fullTimeStr: '09:00 - 09:15, ngày 06/09/2026',
  };
  template = template
    .replace('${duration ? `${Math.floor(duration / 60)} phút ${duration % 60} giây` : "không rõ"}', '15 phút 0 giây')
    .replace(/\$\{meetingObjectives \? `[^`]*` : ""\}/g, '');
  template = template.replace(/\$\{(\w+)\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error('template_binding_unavailable');
    return values[name];
  });
  if (template.includes('${')) throw new Error('template_binding_unavailable');
  return template;
}

async function runTrial(trial, index) {
  // One synthetic conversation per trial; its session stays stable for the call.
  const session = randomUUID();
  const timeoutMs = trial.timeoutMs ?? 60_000;
  const signal = AbortSignal.timeout(timeoutMs);
  const started = performance.now();
  const elapsed = () => Math.round((performance.now() - started) * 100) / 100;
  const result = {
    trial: index + 1, startedAt: new Date().toISOString(),
    requestedModel: trial.model, max_tokens: 16384,
    reasoning: trial.reasoning === false ? false : 'omitted',
    timeoutMs, status: null, headersMs: null,
  };
  log({ event: 'trial_start', ...result });
  try {
    const response = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
      method: 'POST', signal,
      headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${key}`,
        'x-opencode-session': session,
      },
      body: JSON.stringify({
        model: trial.model, messages: [{ role: 'user', content: trial.prompt ?? prompt }],
        max_tokens: 16384,
        ...(trial.reasoning === false ? { reasoning: false } : {}),
      }),
    });
    result.status = response.status;
    result.headersMs = elapsed();
    // Measure complete body arrival separately from JSON parsing.
    const raw = await response.text();
    result.durationMs = elapsed();
    let data;
    try { data = JSON.parse(raw); } catch {
      log({ event: 'trial_complete', ...result, outcome: 'invalid_json' });
      return;
    }
    if (!response.ok) {
      log({ event: 'trial_complete', ...result, outcome: 'http_error',
        errorCode: safeError(data?.error?.code), errorType: safeError(data?.error?.type) });
      return;
    }
    const choice = data?.choices?.[0];
    const usage = data?.usage;
    log({ event: 'trial_complete', ...result, outcome: 'success',
      returnedModel: identifier(data?.model),
      promptTokens: count(usage?.prompt_tokens),
      completionTokens: count(usage?.completion_tokens),
      totalTokens: count(usage?.total_tokens),
      reasoningTokens: count(usage?.completion_tokens_details?.reasoning_tokens ?? usage?.reasoning_tokens),
      finishReason: identifier(choice?.finish_reason),
      outputCharacters: chars(choice?.message?.content),
      reasoningCharacters: chars(choice?.message?.reasoning_content ?? choice?.message?.reasoning),
      ...(trial.prompt ? { inlineThinkingTagPresent: /<\/?(?:think|thinking|analysis)\b[^>]*>/i.test(choice?.message?.content ?? '') } : {}),
    });
  } catch {
    log({ event: 'trial_complete', ...result, durationMs: elapsed(),
      outcome: signal.aborted ? 'censored_timeout' : 'network_or_body_failure' });
  }
}

if (!key) {
  log({ event: 'benchmark_skipped', reason: 'missing_credentials' });
  process.exitCode = 1;
} else {
  let selectedTrials = trials;
  if (process.argv.includes('--full-minimax')) {
    try {
      selectedTrials = [{ model: 'minimax-m3', reasoning: false, timeoutMs: 90_000, prompt: await fullPrompt() }];
    } catch {
      log({ event: 'benchmark_skipped', reason: 'full_prompt_unavailable' });
      process.exit(1);
    }
  }
  const start = performance.now();
  for (const [index, trial] of selectedTrials.entries()) await runTrial(trial, index);
  log({ event: 'benchmark_complete', calls: selectedTrials.length,
    durationMs: Math.round((performance.now() - start) * 100) / 100 });
}
