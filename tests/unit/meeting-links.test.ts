import { describe, it, expect } from "vitest";
import {
  detectProvider,
  validateMeetingUrl,
  buildBotName,
  meetCodeFromUrl,
  defaultMeetingTitle,
} from "@/app/lib/meeting-links";

describe("meeting-links (platform adapters)", () => {
  it("detects Google Meet links", () => {
    expect(detectProvider("https://meet.google.com/abc-defg-hij")).toBe("meet");
    expect(detectProvider("https://meet.google.com/lookup/xyz123?pdk=1")).toBe("meet");
  });

  it("recognizes official Zoom/Teams integrations", () => {
    expect(detectProvider("https://us02web.zoom.us/j/123456789?pwd=abc")).toBe("zoom");
    expect(detectProvider("https://zoom.us/my/john.doe")).toBeNull();
    expect(
      detectProvider(
        "https://teams.microsoft.com/l/meetup-join/19%3Ameeting_abc@thread.v2/0?context=%7B%22Tid%22%3A%22123%22%7D"
      )
    ).toBe("teams");
    expect(detectProvider("https://teams.live.com/meet/123456789")).toBe("teams");
  });

  it("rejects invalid links", () => {
    expect(validateMeetingUrl("https://example.com/room/123")).toBe(false);
    expect(validateMeetingUrl("not a url")).toBe(false);
    expect(validateMeetingUrl("")).toBe(false);
  });

  it("trims whitespace before matching", () => {
    expect(validateMeetingUrl("  https://meet.google.com/abc-defg-hij  ")).toBe(true);
  });

  it("builds bot name as 'Thư ký của {Tên}'", () => {
    expect(buildBotName("Nguyen Van A")).toBe("Thư ký của Nguyen Van A");
    expect(buildBotName("", "john@example.com")).toBe("Thư ký của john");
    expect(buildBotName(null, null)).toBe("Thư ký AI");
  });

  it("meetCodeFromUrl trích mã phòng Meet", () => {
    expect(meetCodeFromUrl("https://meet.google.com/abc-defg-hij")).toBe("abc-defg-hij");
    expect(meetCodeFromUrl("https://meet.google.com/ABC-DEFG-HIJ?authuser=0")).toBe("abc-defg-hij");
    expect(meetCodeFromUrl("https://example.com/x")).toBe("");
  });

  it("defaultMeetingTitle = mã phòng + giờ", () => {
    const at = new Date(2026, 9, 2, 19, 49).getTime();
    expect(defaultMeetingTitle("https://meet.google.com/abc-defg-hij", at)).toBe(
      "Họp Meet abc-defg-hij 02/10 19:49"
    );
    expect(defaultMeetingTitle("https://example.com/x", at)).toBe("Ghi chú họp 02/10");
  });
});
