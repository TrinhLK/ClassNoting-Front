import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdminAccountsPage from "@/app/(dashboard)/admin/page";
import { SYSTEM_ADMIN_EMAIL, SYSTEM_ADMIN_UID } from "@/app/lib/admin-identity";

const state = vi.hoisted(() => ({ user: null as any }));
vi.mock("@/app/context/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
const fetchMock = vi.fn();
const normal = { uid: "normal", email: "normal@example.com", displayName: "Người Dùng", disabled: false,
  emailVerified: true, isAdmin: false, createdAt: Date.now(), lastSignInAt: Date.now(), lastSeenAt: Date.now(),
  hasPersonalKey: false, freeUsed: 3, freePending: 0, freeLimit: 10, freeRemaining: 7, unlimited: false, finiteLimit: 10 };
const root = { ...normal, uid: SYSTEM_ADMIN_UID, email: SYSTEM_ADMIN_EMAIL, displayName: "Quản trị", isAdmin: true,
  freeLimit: null, freeRemaining: null, unlimited: true };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  state.user = { uid: SYSTEM_ADMIN_UID, email: SYSTEM_ADMIN_EMAIL, emailVerified: true, getIdToken: async () => "root-id-token" };
  fetchMock.mockReset().mockImplementation(async () => json({ accounts: [root, normal], nextCursor: null, generatedAt: Date.now() }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const selectNormal = async () => {
  await screen.findByText("Người Dùng");
  await userEvent.click(within(screen.getByRole("row", { name: /Người Dùng/ })).getByRole("button", { name: "Điều chỉnh" }));
};
it("does not fetch admin data for an ordinary account, even with the root email", async () => {
  state.user = { ...state.user, uid: "normal" };
  render(<AdminAccountsPage />); await act(async () => {});
  expect(screen.getByText("Không có quyền quản trị")).toBeTruthy(); expect(fetchMock).not.toHaveBeenCalled();
});
it("sends authenticated grants and keeps existing usage visible", async () => {
  render(<AdminAccountsPage />); await selectNormal();
  fetchMock.mockResolvedValueOnce(json({ uid: "normal", limit: 15, unlimited: false }));
  fireEvent.change(screen.getByLabelText("Tăng thêm số lượt"), { target: { value: "5" } });
  await userEvent.click(screen.getByRole("button", { name: "Cộng lượt" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Đã cộng 5 lượt");
  const [, options] = fetchMock.mock.calls.at(-1)!;
  expect(options.headers.Authorization).toBe("Bearer root-id-token");
  expect(JSON.parse(options.body)).toEqual({ action: "add", amount: 5 });
  const row = screen.getByRole("row", { name: /Người Dùng/ });
  expect(within(row).getByText("15 cuộc họp")).toBeTruthy(); expect(within(row).getByText("3")).toBeTruthy();
});
it("requires an explicit save for unlimited mode", async () => {
  render(<AdminAccountsPage />); await selectNormal();
  expect(screen.getByRole("button", { name: "Lưu chế độ" })).toBeDisabled();
  await userEvent.click(screen.getByRole("switch", { name: "Không giới hạn AI" }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockResolvedValueOnce(json({ uid: "normal", limit: 10, unlimited: true }));
  await userEvent.click(screen.getByRole("button", { name: "Lưu chế độ" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Đã bật không giới hạn");
  expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ action: "unlimited", unlimited: true });
});
it("prevents duplicate grants while a request is pending", async () => {
  render(<AdminAccountsPage />); await selectNormal();
  let resolve!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  const button = screen.getByRole("button", { name: "Cộng lượt" });
  await act(async () => { fireEvent.click(button); fireEvent.click(button); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => resolve(json({ uid: "normal", limit: 20, unlimited: false })));
  expect(await screen.findByRole("status")).toHaveTextContent("Đã cộng 10 lượt");
});
it("surfaces server denial without displaying account rows", async () => {
  fetchMock.mockResolvedValueOnce(json({ error: "Không có quyền quản trị." }, 403));
  render(<AdminAccountsPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Không có quyền quản trị.");
  expect(screen.queryByText("normal@example.com")).toBeNull();
});
