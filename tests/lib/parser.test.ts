import { describe, it, expect } from "vitest";
import { parseTranscriptFile } from "@/app/lib/parser";

const SAMPLE = `
[SPEAKER_00] (00:00 -> 00:43): Xin chào mọi người
[SPEAKER_02] (00:46 -> 01:09): Hôm nay chúng ta sẽ bàn về sách
[SPEAKER_04] (01:10 -> 02:38): Cảm ơn anh đã giới thiệu
`;

describe("parseTranscriptFile — parse transcript Python v3", () => {
  it("parse được format chuẩn [SPEAKER_XX] (mm:ss -> mm:ss): text", () => {
    const result = parseTranscriptFile(SAMPLE);
    expect(result.segments).toHaveLength(3);
    expect(result.speakers).toHaveLength(3);
  });

  it("chuyển time 'mm:ss' thành seconds", () => {
    const result = parseTranscriptFile(`[SPEAKER_00] (01:30 -> 02:15): Test`);
    expect(result.segments[0].start).toBe(90);
    expect(result.segments[0].end).toBe(135);
  });

  it("tạo segment với id = index trong file", () => {
    const result = parseTranscriptFile(`
[SPEAKER_00] (00:00 -> 00:04): First
[SPEAKER_02] (00:04 -> 00:08): Second
[SPEAKER_00] (00:08 -> 00:12): Third
    `);
    expect(result.segments[0].id).toBe("1");
    expect(result.segments[1].id).toBe("2");
    expect(result.segments[2].id).toBe("3");
  });

  it("gán speakerId đúng", () => {
    const result = parseTranscriptFile(SAMPLE);
    expect(result.segments[0].speakerId).toBe("SPEAKER_00");
    expect(result.segments[1].speakerId).toBe("SPEAKER_02");
    expect(result.segments[2].speakerId).toBe("SPEAKER_04");
  });

  it("tạo speaker mới cho mỗi SPEAKER_XX chưa từng xuất hiện", () => {
    const result = parseTranscriptFile(`
[SPEAKER_00] (00:00 -> 00:04): A
[SPEAKER_00] (00:04 -> 00:08): B
[SPEAKER_02] (00:08 -> 00:12): C
    `);
    expect(result.speakers).toHaveLength(2);
    expect(result.speakers[0].id).toBe("SPEAKER_00");
    expect(result.speakers[1].id).toBe("SPEAKER_02");
  });

  it("gán màu cho speaker từ danh sách 6 màu theo index", () => {
    const result = parseTranscriptFile(`
[SPEAKER_00] (00:00 -> 00:04): A
[SPEAKER_01] (00:04 -> 00:08): B
[SPEAKER_02] (00:08 -> 00:12): C
[SPEAKER_03] (00:12 -> 00:16): D
[SPEAKER_04] (00:16 -> 00:20): E
[SPEAKER_05] (00:20 -> 00:24): F
[SPEAKER_06] (00:24 -> 00:28): G
    `);
    expect(result.speakers[0].color).toContain("blue");
    expect(result.speakers[1].color).toContain("green");
    expect(result.speakers[2].color).toContain("purple");
    expect(result.speakers[3].color).toContain("orange");
    expect(result.speakers[4].color).toContain("pink");
    expect(result.speakers[5].color).toContain("teal");
    expect(result.speakers[6].color).toContain("blue");
  });

  it("mặc định tên speaker = id (vd SPEAKER_00)", () => {
    const result = parseTranscriptFile(`[SPEAKER_03] (00:00 -> 00:04): Test`);
    expect(result.speakers[0].name).toBe("SPEAKER_03");
  });

  it("bỏ qua dòng trống", () => {
    const result = parseTranscriptFile(`

[SPEAKER_00] (00:00 -> 00:04): A

[SPEAKER_02] (00:04 -> 00:08): B

    `);
    expect(result.segments).toHaveLength(2);
  });

  it("bỏ qua dòng không khớp format", () => {
    const result = parseTranscriptFile(`
Đây là dòng không hợp lệ
[SPEAKER_00] (00:00 -> 00:04): Hợp lệ
[INVALID] missing parentheses
SPEAKER_00 (00:00 -> 00:04): missing brackets
[SPEAKER_02] (no arrow here): broken
    `);
    expect(result.segments).toHaveLength(1);
    expect(result.speakers).toHaveLength(1);
  });

  it("xử lý text có nhiều dấu ':'", () => {
    const result = parseTranscriptFile(
      `[SPEAKER_00] (00:00 -> 00:04): URL: https://example.com path: /foo`
    );
    expect(result.segments[0].text).toBe(
      "URL: https://example.com path: /foo"
    );
  });

  it("xử lý text có dấu ngoặc vuông [] lồng nhau", () => {
    const result = parseTranscriptFile(
      `[SPEAKER_00] (00:00 -> 00:04): Câu nói [quan trọng] kết thúc`
    );
    expect(result.segments[0].text).toBe("Câu nói [quan trọng] kết thúc");
  });

  it("xử lý text tiếng Việt có dấu", () => {
    const result = parseTranscriptFile(
      `[SPEAKER_00] (00:00 -> 00:04): Xin chào, hôm nay trời đẹp quá`
    );
    expect(result.segments[0].text).toBe("Xin chào, hôm nay trời đẹp quá");
  });

  it("xử lý time không hợp lệ (không phải mm:ss) → trả 0", () => {
    const result = parseTranscriptFile(
      `[SPEAKER_00] (abc -> xyz): Invalid time`
    );
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].start).toBe(0);
    expect(result.segments[0].end).toBe(0);
  });

  it("trả mảng rỗng khi input rỗng", () => {
    const result = parseTranscriptFile("");
    expect(result.segments).toHaveLength(0);
    expect(result.speakers).toHaveLength(0);
  });

  it("trim khoảng trắng thừa trong speakerId và text", () => {
    const result = parseTranscriptFile(
      `[SPEAKER_00] (00:00 -> 00:04):    Text có space    `
    );
    expect(result.segments[0].speakerId).toBe("SPEAKER_00");
    expect(result.segments[0].text).toBe("Text có space");
  });

  it("parse được thời lượng dài (> 10 phút)", () => {
    const result = parseTranscriptFile(`[SPEAKER_00] (15:30 -> 99:59): Long`);
    expect(result.segments[0].start).toBe(15 * 60 + 30);
    expect(result.segments[0].end).toBe(99 * 60 + 59);
  });
});