import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DocsFillModal from "@/app/components/DocsFillModal";
import { requestFillPlaceholders, requestDetectFill } from "@/app/lib/api";
import { extractPlaceholders, fillDocx } from "@/app/lib/docx/filler";

vi.mock("@/app/lib/api", () => ({ requestFillPlaceholders: vi.fn(), requestDetectFill: vi.fn() }));
vi.mock("@/app/lib/docx/filler", () => ({
  extractPlaceholders: vi.fn(), extractPlainText: vi.fn(async () => "Blank ______"),
  fillDocx: vi.fn(), fillDocxMarkers: vi.fn(),
}));
vi.mock("@/app/context/GlobalUIProvider", () => ({ useGlobalUI: () => ({ toast: { success: vi.fn(), error: vi.fn() } }) }));
vi.mock("@/app/components/ui/Modal", () => ({ default: ({ isOpen, children, onClose }: { isOpen: boolean; children: React.ReactNode; onClose: () => void }) => isOpen ? <div><button onClick={onClose}>Close X</button>{children}</div> : null }));

beforeEach(() => {
  vi.mocked(extractPlaceholders).mockReset().mockResolvedValue([]);
  vi.mocked(requestDetectFill).mockReset().mockResolvedValue([]);
  vi.mocked(requestFillPlaceholders).mockReset().mockResolvedValue({ NAME: "Test" });
  vi.mocked(fillDocx).mockReset();
});
afterEach(() => vi.restoreAllMocks());

it.each([false, true])("stale document generation cannot close/reset a new workflow (reject=%s)", async rejects => {
  const downloadUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-output");
  vi.mocked(extractPlaceholders).mockResolvedValue([{ name: "NAME", count: 1 }]);
  let resolve!: (blob: Blob) => void;
  let reject!: (error: Error) => void;
  vi.mocked(fillDocx).mockImplementationOnce(() => new Promise((done, fail) => { resolve = done; reject = fail; }));
  const onClose = vi.fn();
  const { container, rerender } = render(<DocsFillModal isOpen onClose={onClose} />);
  const upload = async (name: string) => {
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["test"], name)] } });
    await screen.findByText(name);
  };
  await upload("old.docx");
  fireEvent.click(screen.getByText("AI tự động điền"));
  await screen.findByText("AI điền lại");
  fireEvent.click(screen.getByText("Tạo file"));
  await screen.findByText("Đang tạo file...");
  fireEvent.click(screen.getByText("Close X"));
  rerender(<DocsFillModal isOpen={false} onClose={onClose} />);
  rerender(<DocsFillModal isOpen onClose={onClose} />);
  await upload("new.docx");
  await act(async () => {
    if (rejects) reject(new Error("Old generation failed"));
    else resolve(new Blob(["old output"]));
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(downloadUrl).not.toHaveBeenCalled();
  expect(screen.getByText("new.docx")).toBeInTheDocument();
  expect(screen.getByText("AI tự động điền")).toBeEnabled();
  expect(screen.queryByText("AI điền lại")).not.toBeInTheDocument();
});

it.each([false, true])("document workflow retains ID on refill and rotates on reset/new file (placeholders=%s)", async placeholders => {
  if (placeholders) vi.mocked(extractPlaceholders).mockResolvedValue([{ name: "NAME", count: 1 }]);
  const api = placeholders ? vi.mocked(requestFillPlaceholders) : vi.mocked(requestDetectFill);
  const props = { isOpen: true, onClose: vi.fn() };
  const { container, rerender } = render(<DocsFillModal {...props} />);
  const upload = async (name: string) => {
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["test"], name)] } });
    await screen.findByText(name);
    fireEvent.click(screen.getByText("AI tự động điền"));
    await screen.findByText("AI điền lại");
  };
  await upload("first.docx");
  const first = api.mock.calls[0][1];
  expect(first).toMatch(/^docs-[0-9a-f-]{36}$/);
  rerender(<DocsFillModal {...props} isOpen={false} />);
  rerender(<DocsFillModal {...props} />);
  fireEvent.click(screen.getByText("AI điền lại"));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  await screen.findByText("AI điền lại");
  expect(api.mock.calls[1][1]).toBe(first);
  fireEvent.click(screen.getByText("Hủy"));
  await upload("second.docx");
  expect(api.mock.calls[2][1]).not.toBe(first);
});
