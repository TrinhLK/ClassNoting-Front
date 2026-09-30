import { describe, it, expect } from "vitest";
import { detectProvider, validateMeetingUrl, buildBotName } from "@/app/lib/meeting-links";

describe("meeting-links", () => {
  it("detects Google Meet links", () => {
    expect(detectProvider("https://meet.google.com/abc-defg-hij")).toBe("meet");
    expect(detectProvider("https://meet.google.com/lookup/xyz123?pdk=1")).toBe("meet");
  });

  it("detects Zoom links", () => {
    expect(detectProvider("https://us02web.zoom.us/j/123456789?pwd=abc")).toBe("zoom");
    expect(detectProvider("https://zoom.us/my/john.doe")).toBe("zoom");
    expect(detectProvider("https://company.zoomgov.com/j/999")).toBe("zoom");
  });

  it("detects MS Teams links", () => {
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
});
