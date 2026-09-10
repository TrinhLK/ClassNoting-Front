import { describe, it, expect } from "vitest";
import { formatTranscriptText, formatWords } from "@/app/lib/utils";

describe("formatTranscriptText — chuẩn hoá text transcript", () => {
  it("trả chuỗi rỗng cho input null/undefined", () => {
    expect(formatTranscriptText(null)).toBe("");
    expect(formatTranscriptText(undefined)).toBe("");
    expect(formatTranscriptText("")).toBe("");
  });

  it("số 0 và false → stringify (không phải empty) — bug fix", () => {
    expect(formatTranscriptText(0)).toBe("0");
    expect(formatTranscriptText(false)).toBe("False");
  });

  it("chuyển về lowercase", () => {
    expect(formatTranscriptText("HELLO WORLD")).toBe("Hello world");
  });

  it("viết hoa chữ cái đầu tiên", () => {
    expect(formatTranscriptText("xin chào")).toBe("Xin chào");
    expect(formatTranscriptText("XIN CHÀO")).toBe("Xin chào");
  });

  it("trim khoảng trắng đầu cuối", () => {
    expect(formatTranscriptText("  hello  ")).toBe("Hello");
    expect(formatTranscriptText("\n\t hello \n")).toBe("Hello");
  });

  it("giữ nguyên nội dung giữa (không thay đổi chữ giữa)", () => {
    expect(formatTranscriptText("hello WORLD")).toBe("Hello world");
  });

  it("xử lý text tiếng Việt có dấu", () => {
    expect(formatTranscriptText("XIN CHÀO VIỆT NAM")).toBe("Xin chào việt nam");
  });

  it("xử lý số — force string trước khi format", () => {
    expect(formatTranscriptText(123)).toBe("123");
    expect(formatTranscriptText(123.45)).toBe("123.45");
  });

  it("xử lý object — force string", () => {
    const obj = { toString: () => "xin chào" };
    expect(formatTranscriptText(obj)).toBe("Xin chào");
  });

  it("xử lý chuỗi chỉ có 1 ký tự", () => {
    expect(formatTranscriptText("a")).toBe("A");
    expect(formatTranscriptText("A")).toBe("A");
  });

  it("xử lý chuỗi toàn khoảng trắng — trả chuỗi rỗng", () => {
    expect(formatTranscriptText("   ")).toBe("");
  });

  it("giữ nguyên các ký tự đặc biệt", () => {
    expect(formatTranscriptText("hello-world_123")).toBe("Hello-world_123");
  });
});

describe("formatWords — format mảng words cho karaoke highlight", () => {
  it("trả mảng rỗng cho input falsy", () => {
    expect(formatWords(null as any)).toEqual([]);
    expect(formatWords(undefined as any)).toEqual([]);
    expect(formatWords([])).toEqual([]);
  });

  it("giữ nguyên cấu trúc word, chỉ thay đổi field 'word'", () => {
    const input = [
      { word: "HELLO", start: 0, end: 0.5 },
      { word: "WORLD", start: 0.5, end: 1 },
    ];
    const result = formatWords(input);
    expect(result[0].word).toBe("Hello");
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(0.5);
    expect(result[1].word).toBe("world");
  });

  it("chỉ viết hoa chữ cái đầu của từ đầu tiên (index 0), giữ nguyên các từ sau", () => {
    const result = formatWords([
      { word: "FIRST", start: 0, end: 1 },
      { word: "ALREADY", start: 1, end: 2 },
      { word: "lowercase", start: 2, end: 3 },
    ]);
    expect(result[0].word).toBe("First");
    expect(result[1].word).toBe("already");
    expect(result[2].word).toBe("lowercase");
  });

  it("xử lý word là số", () => {
    const result = formatWords([{ word: 2024, start: 0, end: 1 }]);
    expect(result[0].word).toBe("2024");
  });

  it("xử lý word là rỗng/undefined → trả chuỗi rỗng", () => {
    const result = formatWords([
      { word: undefined, start: 0, end: 1 },
      { word: "", start: 1, end: 2 },
    ]);
    expect(result[0].word).toBe("");
    expect(result[1].word).toBe("");
  });

  it("giữ các field mở rộng (confidence, speaker, ...)", () => {
    const result = formatWords([
      { word: "TEST", start: 0, end: 1, confidence: 0.95, speaker: "spk_1" },
    ]);
    expect(result[0].confidence).toBe(0.95);
    expect(result[0].speaker).toBe("spk_1");
  });

  it("text tiếng Việt có dấu", () => {
    const result = formatWords([
      { word: "XIN", start: 0, end: 1 },
      { word: "CHÀO", start: 1, end: 2 },
    ]);
    expect(result[0].word).toBe("Xin");
    expect(result[1].word).toBe("chào");
  });
});