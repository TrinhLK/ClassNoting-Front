import { describe, it, expect } from "vitest";
import {
  downsampleBuffer,
  convertFloat32ToInt16,
  buildRealtimeUrl,
  parseServerMessage,
  mergeText,
  mergeFinalSegment,
  resolveSpeakerName,
  SILENCE_BUFFER,
  REALTIME_SAMPLE_RATE,
} from "@/app/lib/realtime-protocol";

describe("realtime-protocol — audio helpers", () => {
  it("downsample giữ nguyên khi cùng sample rate", () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const out = downsampleBuffer(input, 16000, 16000);
    expect(Array.from(out)).toEqual([0, 16383, -16383, 32767, -32767]);
  });

  it("downsample 48kHz → 16kHz giảm độ dài 3 lần", () => {
    const input = new Float32Array(4800).fill(0.5);
    const out = downsampleBuffer(input, 48000, 16000);
    expect(out.length).toBe(1600);
    expect(out[0]).toBeGreaterThan(0);
  });

  it("convertFloat32ToInt16 kẹp biên [-1, 1]", () => {
    const out = convertFloat32ToInt16(new Float32Array([2, -2, 0]));
    expect(Array.from(out)).toEqual([32767, -32767, 0]);
  });

  it("SILENCE_BUFFER là 1 giây @16kHz", () => {
    expect(SILENCE_BUFFER.length).toBe(REALTIME_SAMPLE_RATE);
  });
});

describe("realtime-protocol — URL", () => {
  it("giữ đúng format cũ khi không có extra", () => {
    expect(buildRealtimeUrl("wss://asr-live.noting.io.vn", "vi")).toBe(
      "wss://asr-live.noting.io.vn/?language=vi"
    );
  });

  it("thêm client/session cho extension (server cũ bỏ qua)", () => {
    const url = buildRealtimeUrl("wss://asr-live.noting.io.vn", "vi", {
      client: "extension",
      session: "ext_123",
    });
    expect(url).toContain("language=vi");
    expect(url).toContain("client=extension");
    expect(url).toContain("session=ext_123");
  });
});

describe("realtime-protocol — parse server message", () => {
  it("bỏ qua keepalive và message rỗng", () => {
    expect(parseServerMessage({ type: "keepalive" })).toBeNull();
    expect(parseServerMessage(null)).toBeNull();
    expect(parseServerMessage({ channel: { alternatives: [{ transcript: "" }] } })).toBeNull();
    expect(parseServerMessage({})).toBeNull();
  });

  it("phân biệt interim vs final", () => {
    const base = { channel: { alternatives: [{ transcript: "xin chào", words: [] }] } };
    expect(parseServerMessage({ ...base, is_final: false })?.kind).toBe("interim");
    expect(parseServerMessage({ ...base, is_final: true })?.kind).toBe("final");
  });

  it("ưu tiên alt.speaker, rồi words[0].speaker, rồi unknown (-1)", () => {
    const withAlt = {
      is_final: true,
      channel: { alternatives: [{ transcript: "a", speaker: 2, words: [{ word: "a", start: 0, end: 1, speaker: 1 }] }] },
    };
    expect(parseServerMessage(withAlt)?.serverSpeaker).toBe(2);

    const withWord = {
      is_final: true,
      channel: { alternatives: [{ transcript: "a", words: [{ word: "a", start: 0, end: 1, speaker: 3 }] }] },
    };
    expect(parseServerMessage(withWord)?.serverSpeaker).toBe(3);

    const none = {
      is_final: true,
      channel: { alternatives: [{ transcript: "a", words: [{ word: "a", start: 0, end: 1 }] }] },
    };
    expect(parseServerMessage(none)?.serverSpeaker).toBe(-1);
  });
});

describe("realtime-protocol — merge text/segment", () => {
  it("mergeText chống lặp overlap", () => {
    expect(mergeText("xin chào các", "các bạn")).toBe("xin chào các bạn");
    expect(mergeText("xin chào", "xin chào các bạn")).toBe("xin chào các bạn");
    expect(mergeText("hôm nay", ", tôi đi họp")).toBe("hôm nay, tôi đi họp");
    expect(mergeText("", "mới")).toBe("mới");
  });

  const w = (start: number, end: number, word = "a") => ({ word, start, end });

  it("tạo segment mới khi list rỗng", () => {
    const r = mergeFinalSegment([], "Xin chào", [w(0, 1)], 0, 0);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].speaker).toBe(0);
    expect(r.lastEnd).toBe(1);
  });

  it("nối vào segment cũ khi cùng speaker và gap < 1s", () => {
    const prev = [{ speaker: 0, content: "Xin chào", isFinal: true, words: [w(0, 1)] }];
    const r = mergeFinalSegment(prev, "các bạn", [w(1.2, 2)], 0, 1);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].content).toBe("Xin chào các bạn");
    expect(r.lastEnd).toBe(2);
  });

  it("tách segment khi đổi speaker hoặc gap >= 1s", () => {
    const prev = [{ speaker: 0, content: "Xin chào", isFinal: true, words: [w(0, 1)] }];
    const diffSpeaker = mergeFinalSegment(prev, "Vâng", [w(1.2, 2)], 1, 1);
    expect(diffSpeaker.segments).toHaveLength(2);

    const bigGap = mergeFinalSegment(prev, "Tiếp", [w(5, 6)], 0, 1);
    expect(bigGap.segments).toHaveLength(2);
  });
});

describe("realtime-protocol — resolveSpeakerName", () => {
  const spans = [
    { name: "Nguyen Van A", start: 0, end: 10 },
    { name: "Tran Thi B", start: 10, end: 20 },
  ];

  it("gán tên theo active-speaker tại midpoint", () => {
    const r = resolveSpeakerName(2, 4, { activeSpans: spans, captionLines: [] });
    expect(r).toEqual({ name: "Nguyen Van A", splitAt: undefined, uncertain: true });
  });

  it("phát hiện lật người nói giữa segment và trả splitAt", () => {
    const r = resolveSpeakerName(8, 12, { activeSpans: spans, captionLines: [] });
    expect(r.splitAt).toBe(10);
    // midpoint 10 → span B (start gần nhất chứa 10 là B: 10<=10<=20; A: 0<=10<=10 cũng chứa → chọn start lớn hơn = B)
    expect(r.name).toBe("Tran Thi B");
  });

  it("fallback caption khi không có active-speaker", () => {
    const r = resolveSpeakerName(30, 32, {
      activeSpans: [],
      captionLines: [{ name: "Le Van C", text: "ok", start: 29, end: 33 }],
    });
    expect(r.name).toBe("Le Van C");
    expect(r.uncertain).toBe(true);
  });

  it("bỏ qua caption overlap quá ngắn (<0.3s)", () => {
    const r = resolveSpeakerName(30, 32, {
      activeSpans: [],
      captionLines: [{ name: "Le Van C", text: "ok", start: 31.9, end: 32.1 }],
      prevName: "Nguyen Van A",
      prevEnd: 29.5,
    });
    // gap 0.5s < 1s → nối prev, đánh cờ uncertain
    expect(r.name).toBe("Nguyen Van A");
    expect(r.uncertain).toBe(true);
  });

  it("fallback SPEAKER_xx khi không có tín hiệu nào", () => {
    const r = resolveSpeakerName(100, 102, { activeSpans: [], captionLines: [] });
    expect(r.name).toBe("SPEAKER_00");
    expect(r.uncertain).toBe(true);
  });

  it("chuẩn hóa tên thừa khoảng trắng", () => {
    const r = resolveSpeakerName(1, 2, {
      activeSpans: [{ name: "  Nguyen   Van A ", start: 0, end: 5 }],
      captionLines: [],
    });
    expect(r.name).toBe("Nguyen Van A");
  });
});
