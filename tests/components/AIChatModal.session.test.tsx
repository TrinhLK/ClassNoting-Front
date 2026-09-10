import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import AIChatModal from "@/app/components/AIChatModal";
import { postGemini } from "@/app/lib/api";

vi.mock("@/app/lib/api", () => ({ postGemini: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const props = { isOpen: true, onClose: vi.fn(), onClearContext: vi.fn(), contextText: "Meeting", contextCount: 1 };
const send = (text: string) => {
  const input = screen.getByPlaceholderText(/Nhập câu hỏi/);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
};
beforeEach(() => {
  vi.mocked(postGemini).mockReset().mockResolvedValue({ summary: "Answer" });
  Element.prototype.scrollIntoView = vi.fn();
});

it("retains UUID through turns and hide/reopen, rotating only when history resets", async () => {
  const { rerender } = render(<AIChatModal {...props} />);
  send("First");
  await screen.findByText("Answer");
  const first = vi.mocked(postGemini).mock.calls[0][0].sessionId;
  expect(first).toMatch(/^chat-[0-9a-f-]{36}$/);
  rerender(<AIChatModal {...props} isOpen={false} />);
  rerender(<AIChatModal {...props} />);
  expect(screen.getByText("First")).toBeInTheDocument();
  send("Second");
  await waitFor(() => expect(screen.getAllByText("Answer")).toHaveLength(2));
  expect(vi.mocked(postGemini).mock.calls[1][0].sessionId).toBe(first);
  expect(vi.mocked(postGemini).mock.calls[1][0].history).toHaveLength(2);
  fireEvent.click(screen.getByTitle("Xóa lịch sử trò chuyện"));
  send("New conversation");
  await screen.findByText("Answer");
  expect(vi.mocked(postGemini).mock.calls[2][0].sessionId).not.toBe(first);
  expect(vi.mocked(postGemini).mock.calls[2][0].history).toEqual([]);
});

it.each([false, true])("ignores stale completion while newer chat is pending (reject=%s)", async rejects => {
  let resolve!: (value: { summary: string }) => void;
  let reject!: (reason: Error) => void;
  let resolveNew!: (value: { summary: string }) => void;
  vi.mocked(postGemini)
    .mockImplementationOnce(() => new Promise((done, fail) => { resolve = done; reject = fail; }))
    .mockImplementationOnce(() => new Promise(done => { resolveNew = done; }));
  render(<AIChatModal {...props} />);
  send("Old question");
  fireEvent.click(screen.getByTitle("Xóa lịch sử trò chuyện"));
  send("New question");
  await act(async () => {
    if (rejects) reject(new Error("Stale failure"));
    else resolve({ summary: "Stale answer" });
  });
  expect(screen.queryByText("Stale answer")).not.toBeInTheDocument();
  expect(screen.queryByText(/Stale failure/)).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Nhập câu hỏi/)).toBeDisabled();
  expect(screen.getByText("Đang suy nghĩ...")).toBeInTheDocument();
  await act(async () => resolveNew({ summary: "New answer" }));
  expect(screen.getByText("New answer")).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Nhập câu hỏi/)).toBeEnabled();
  expect(vi.mocked(postGemini).mock.calls[0][0].sessionId).not.toBe(vi.mocked(postGemini).mock.calls[1][0].sessionId);
});
