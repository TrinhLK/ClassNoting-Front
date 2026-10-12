import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({ user: { uid: "owner", getIdToken: vi.fn(async () => "token") }, confirm: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/app/context/AuthContext", () => ({ useAuth: () => ({ user: m.user }) }));
vi.mock("@/app/context/GlobalUIProvider", () => ({ useGlobalUI: () => ({ confirm: m.confirm, toast: { success: m.success, error: m.error } }) }));
import LiveSessionManager from "@/app/components/Dashboard/LiveSessionManager";
beforeEach(() => { vi.restoreAllMocks(); m.confirm.mockResolvedValue(true); });
it("shows saved sessions, searches and deletes after confirmation", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [{ id: "live-1", title: "Họp tuần", startedAt: 1, status: "ended" }] }))).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
  render(<LiveSessionManager refreshSignal={0} />);
  expect(await screen.findByRole("link", { name: "Họp tuần" })).toHaveAttribute("href", "/live/live-1");
  fireEvent.change(screen.getByRole("textbox", { name: "Tìm phiên live" }), { target: { value: "không khớp" } });
  expect(screen.getByText("Không tìm thấy phiên phù hợp.")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Tìm phiên live" }), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Xóa phiên Họp tuần" }));
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/live/live-1", { method: "DELETE", headers: { Authorization: "Bearer token" } }));
  expect(await screen.findByText(/Bạn chưa có phiên live nào/)).toBeInTheDocument();
});

const rows = [1, 2, 3].map(n => ({ id: `live-${n}`, title: `Phiên ${n}`, startedAt: n, status: "ended" }));
it("selects visible search results and cancels bulk deletion without requests", async () => {
  m.confirm.mockResolvedValue(false);
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ sessions: rows })));
  render(<LiveSessionManager refreshSignal={0} />);
  await screen.findByRole("link", { name: "Phiên 1" });
  fireEvent.change(screen.getByRole("textbox", { name: "Tìm phiên live" }), { target: { value: "Phiên 2" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn tất cả phiên đang hiển thị" }));
  expect(screen.getByRole("checkbox", { name: "Chọn phiên Phiên 2" })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Xóa 1 phiên đã chọn" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Xóa 1 phiên đã chọn" })).toBeEnabled());
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});
it("deletes multiple sessions once confirmed and keeps failures selected", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ sessions: rows })))
    .mockResolvedValueOnce(new Response("{}"))
    .mockResolvedValueOnce(new Response("{}", { status: 403 }))
    .mockResolvedValueOnce(new Response("{}", { status: 404 }));
  render(<LiveSessionManager refreshSignal={0} />);
  await screen.findByRole("link", { name: "Phiên 1" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn tất cả phiên đang hiển thị" }));
  fireEvent.click(screen.getByRole("button", { name: "Xóa 3 phiên đã chọn" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: "Phiên 1" })).not.toBeInTheDocument());
  expect(screen.queryByRole("link", { name: "Phiên 3" })).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Chọn phiên Phiên 2" })).toBeChecked();
  expect(fetchSpy).toHaveBeenCalledTimes(4);
  expect(m.error).toHaveBeenCalledWith(expect.stringContaining("Phiên 2"));
});
