import { describe, it, expect } from "vitest";
import { computeChatStats } from "@/app/lib/chat-stats";

describe("computeChatStats", () => {
  it("đếm tin theo người gửi và sắp xếp giảm dần", () => {
    const stats = computeChatStats([
      { id: "1", sender: "Nguyen A", text: "ok", timestamp: 1 },
      { id: "2", sender: "Tran B", text: "hi", timestamp: 2 },
      { id: "3", sender: "Nguyen A", text: "vâng", timestamp: 3 },
    ]);
    expect(stats.totalMessages).toBe(3);
    expect(stats.uniqueSenders).toBe(2);
    expect(stats.bySender[0]).toMatchObject({ sender: "Nguyen A", count: 2 });
    expect(stats.bySender[0].pct).toBeCloseTo(66.7, 1);
  });

  it("phân biệt responders / silent theo roster (không phân biệt hoa thường)", () => {
    const stats = computeChatStats(
      [{ id: "1", sender: "nguyen  van a", text: "ok", timestamp: 1 }],
      [{ name: "Nguyen Van A" }, { name: "Le Van C" }]
    );
    expect(stats.responders).toEqual(["Nguyen Van A"]);
    expect(stats.silent).toEqual(["Le Van C"]);
    expect(stats.responseRate).toBe(50);
  });

  it("bỏ qua tin rỗng, roster rỗng thì responseRate = 0", () => {
    const stats = computeChatStats([
      { id: "1", sender: "A", text: "   ", timestamp: 1 },
      { id: "2", sender: "A", text: "hi", timestamp: 2 },
    ]);
    expect(stats.totalMessages).toBe(1);
    expect(stats.responseRate).toBe(0);
  });
});
