import { describe, expect, it } from "vitest";
import { explainRefinementError } from "@/app/lib/refinementError";

describe("explainRefinementError", () => {
  it("map lỗi Unknown action sang hướng dẫn redeploy worker", () => {
    const out = explainRefinementError("Unknown action: refine_meeting");
    expect(out).toContain("bản cũ");
    expect(out).toContain("ClassNoting-File-Processing");
    expect(out).not.toContain("Unknown action");
  });

  it("giữ nguyên các lỗi khác", () => {
    expect(explainRefinementError("ASR HTTP 500")).toBe("ASR HTTP 500");
    expect(explainRefinementError("")).toBe("");
  });
});
