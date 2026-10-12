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
