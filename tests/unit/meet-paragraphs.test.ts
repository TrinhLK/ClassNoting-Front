import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { meetParagraphs } from "@/app/lib/meet-paragraphs";
import type { ExtLiveSegment } from "@/app/lib/ext-sessions";

interface Tracker {
  assign(segment: ExtLiveSegment, id: string, source: string): string;
  pause(id: string, source: string, seconds: number): void;
}
let makeTracker: () => Tracker;
const row = (id: number, participantId = "a", speaker = "An"): ExtLiveSegment => ({
  id: String(id), speaker, participantId, text: `Câu ${id}.`, start: id * 2, end: id * 2 + 1,
});
beforeAll(() => {
  (0, eval)(readFileSync("extension/src/shared.js", "utf8"));
  makeTracker = () => {
    let n = 0;
    return (globalThis as any).ClassNotingShared.createMeetParagraphTracker(() => `paragraph-${++n}`);
  };
});
describe("Meet paragraph boundaries", () => {
  it("keeps streaming rows in a paragraph through four pauses and closes at the fifth", () => {
    const t = makeTracker();
    for (let n = 1; n <= 5; n++) {
      expect(t.assign(row(n), String(n), "mic")).toBe("paragraph-1");
      t.pause(String(n), "mic", 1);
    }
    expect(t.assign(row(6), "6", "mic")).toBe("paragraph-2");
  });
  it("counts each continuous silence once, ignores subsecond gaps and unrelated sources", () => {
    const t = makeTracker();
    t.assign(row(1), "1", "mic");
    for (let n = 0; n < 10; n++) {
      t.pause("repeat", "mic", 1);
      t.pause(`short-${n}`, "mic", .8);
      t.pause(`tab-${n}`, "tab", 1);
      t.pause(`invalid-${n}`, "mic", NaN);
    }
    expect(t.assign(row(2), "2", "mic")).toBe("paragraph-1");
    for (let n = 0; n < 4; n++) t.pause(`real-${n}`, "mic", 1);
    expect(t.assign(row(3), "3", "mic")).toBe("paragraph-2");
  });
  it("splits immediately for different accounts with identical names and for a returning speaker", () => {
    const t = makeTracker();
    expect(t.assign(row(1), "1", "mic")).toBe("paragraph-1");
    expect(t.assign(row(2, "b"), "2", "tab")).toBe("paragraph-2");
    expect(t.assign(row(3), "3", "mic")).toBe("paragraph-3");
  });
  it("does not count ASR length cuts or retries as pauses; renaming the same account keeps its paragraph", () => {
    const t = makeTracker();
    for (let n = 1; n < 20; n++) expect(t.assign(row(n, "a", `Tên ${n}`), String(n), "mic")).toBe("paragraph-1");
    expect(t.assign(row(1), "1", "mic")).toBe("paragraph-1");
  });
  it("groups display and saved rows without modifying raw text, mixing accounts or merging legacy rows", () => {
    const input = [row(1), row(2), row(3, "b"), row(4, "b"), row(5, "b")];
    input.slice(0, 4).forEach(s => s.paragraphId = "p");
    const output = meetParagraphs(input);
    expect(output.map(s => s.text)).toEqual(["Câu 1. Câu 2.", "Câu 3. Câu 4.", "Câu 5."]);
    expect(input[0].text).toBe("Câu 1.");
    expect(output.map(s => s.participantId)).toEqual(["a", "b", "b"]);
  });
});
