import React from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ExtLiveInsight from "@/app/components/Meeting/ExtLiveInsight";
import { requestSegmentSummary } from "@/app/lib/api";
import type { ExtLiveSegment } from "@/app/lib/ext-sessions";

vi.mock("@/app/lib/api", () => ({ requestSegmentSummary: vi.fn() }));

const seg = (id: string, text: string, speaker = "Trình Lê Khánh"): ExtLiveSegment => ({
  id,
  speaker,
  text,
  start: 0,
  end: 1,
});

const longText = (words: number) => Array(words).fill("từ").join(" ");

beforeEach(() => {
  vi.mocked(requestSegmentSummary).mockReset().mockResolvedValue("Ý chính cuộc họp");
});

it("chưa đủ ~40 từ thì chưa gọi tóm tắt", async () => {
  render(<ExtLiveInsight segments={[seg("s1", longText(10))]} />);
  await act(async () => {});
  expect(vi.mocked(requestSegmentSummary)).not.toHaveBeenCalled();
  expect(screen.getByText(/AI tóm tắt sẽ hiện/i)).toBeTruthy();
});

it("đủ từ mới thì gọi tóm tắt 1 nhịp và hiển thị", async () => {
  const { rerender } = render(<ExtLiveInsight segments={[seg("s1", longText(10))]} />);
  rerender(<ExtLiveInsight segments={[seg("s1", longText(10)), seg("s2", longText(35))]} />);
  await act(async () => {});
  expect(vi.mocked(requestSegmentSummary)).toHaveBeenCalledTimes(1);
  const [text, sessionId] = vi.mocked(requestSegmentSummary).mock.calls[0];
  expect(sessionId).toMatch(/^live-[0-9a-f-]{36}$/);
  expect(text).toContain("Trình Lê Khánh");
  expect(await screen.findByText("Ý chính cuộc họp")).toBeTruthy();
});

it("nhịp sau chỉ tóm tắt phần câu mới (không lặp)", async () => {
  const { rerender } = render(
    <ExtLiveInsight segments={[seg("s1", longText(45))]} />
  );
  await act(async () => {});
  expect(vi.mocked(requestSegmentSummary)).toHaveBeenCalledTimes(1);
  const fresh = Array(45).fill("mới").join(" ");
  rerender(
    <ExtLiveInsight segments={[seg("s1", longText(45)), seg("s2", fresh)]} />
  );
  await act(async () => {});
  expect(vi.mocked(requestSegmentSummary)).toHaveBeenCalledTimes(2);
  // Nhịp 2 chỉ chứa câu mới s2 (~45 từ + tên người nói), không gộp lại s1 (~90 từ)
  const secondText = vi.mocked(requestSegmentSummary).mock.calls[1][0] as string;
  expect(secondText).toContain("mới");
  expect(secondText.split(/\s+/).length).toBeLessThan(60);
});
