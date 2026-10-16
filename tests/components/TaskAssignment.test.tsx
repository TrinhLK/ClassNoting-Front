import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: { uid: "owner" }, getMeeting: vi.fn(), getMembers: vi.fn(), update: vi.fn(), saveMember: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "m1" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/context/AuthContext", () => ({ useAuth: () => ({ user: m.user, loading: false }) }));
vi.mock("@/app/context/GlobalUIProvider", () => ({ useGlobalUI: () => ({ toast: { success: m.success, error: m.error }, confirm: vi.fn() }) }));
vi.mock("@/app/lib/api", () => ({ sendTaskEmails: vi.fn() }));
vi.mock("@/app/lib/db", () => ({ getMeetingById: m.getMeeting, getMembers: m.getMembers, updateMeetingProcess: m.update, saveMember: m.saveMember }));
import Page from "@/app/tasks/[id]/page";
import AddAssignee from "@/app/components/Tasks/AddAssignee";
beforeEach(() => {
  vi.clearAllMocks();
  m.getMembers.mockResolvedValue([]);
  m.update.mockResolvedValue(undefined);
  m.saveMember.mockResolvedValue("member1");
  m.getMeeting.mockResolvedValue({ id: "m1", userId: "owner", title: "Họp", actionItems: [{ id: 1, task: "Báo cáo", email: ["lan@example.com"], assigneeName: "Lan", deadline: "", completed: false }] });
});
it("adds a named recipient even when the address book is empty", async () => {
  const added = vi.fn();
  render(<AddAssignee userId="owner" members={[]} onAdd={added} />);
  fireEvent.click(screen.getByText("+ Nhập người mới"));
  fireEvent.change(screen.getByLabelText("Tên người thực hiện"), { target: { value: "Lan" } });
  fireEvent.change(screen.getByLabelText("Email người thực hiện"), { target: { value: "lan@example.com" } });
  fireEvent.click(screen.getByText("Thêm người nhận"));
  await waitFor(() => expect(added).toHaveBeenCalledWith(expect.objectContaining({ name: "Lan", email: "lan@example.com" })));
  expect(m.saveMember).toHaveBeenCalledWith("owner", expect.objectContaining({ name: "Lan" }));
});
it("persists completion and allows unchecking it", async () => {
  render(<Page />);
  const checkbox = await screen.findByRole("checkbox", { name: "Hoàn thành: Báo cáo" });
  fireEvent.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  expect(m.update).toHaveBeenLastCalledWith("m1", { actionItems: [expect.objectContaining({ completed: true, completedAt: expect.any(Number) })] });
  fireEvent.click(checkbox);
  await waitFor(() => expect(checkbox).not.toBeChecked());
  expect(m.update).toHaveBeenLastCalledWith("m1", { actionItems: [expect.objectContaining({ completed: false, completedAt: null })] });
});
it("keeps the original checkbox state if saving fails", async () => {
  m.update.mockRejectedValue(new Error("offline"));
  render(<Page />);
  const checkbox = await screen.findByRole("checkbox", { name: "Hoàn thành: Báo cáo" });
  fireEvent.click(checkbox);
  await waitFor(() => expect(m.error).toHaveBeenCalled());
  expect(checkbox).not.toBeChecked();
});
it("shows previously saved completion after reopening", async () => {
  m.getMeeting.mockResolvedValue({ userId: "owner", title: "Họp", actionItems: [{ id: 1, task: "Báo cáo", email: ["lan@example.com"], completed: true, deadline: "" }] });
  render(<Page />);
  expect(await screen.findByRole("checkbox", { name: "Hoàn thành: Báo cáo" })).toBeChecked();
});
