import { describe, it, expect } from "vitest";
import { formatTime, formatDate } from "@/app/lib/format";

describe("formatTime", () => {
  it("chuyển 0s thành 00:00", () => {
    expect(formatTime(0)).toBe("00:00");
  });

  it("chuyển 5s thành 00:05", () => {
    expect(formatTime(5)).toBe("00:05");
  });

  it("chuyển 60s thành 01:00", () => {
    expect(formatTime(60)).toBe("01:00");
  });

  it("chuyển 75s thành 01:15", () => {
    expect(formatTime(75)).toBe("01:15");
  });

  it("chuyển 600s thành 10:00", () => {
    expect(formatTime(600)).toBe("10:00");
  });

  it("chuyển 3661s thành 61:01", () => {
    expect(formatTime(3661)).toBe("61:01");
  });

  it("luôn padStart 2 cho cả phút và giây (dùng làm [mm:ss] cho AI)", () => {
    const result = formatTime(45);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
    expect(result).toBe("00:45");
  });

  it("floor giây (30.9 → 30)", () => {
    expect(formatTime(30.9)).toBe("00:30");
  });
});

describe("formatDate", () => {
  it("trả về string tiếng Việt có chứa năm", () => {
    const ts = new Date(2026, 7, 5, 14, 30).getTime();
    const result = formatDate(ts);
    expect(result).toContain("2026");
    expect(typeof result).toBe("string");
  });
});
