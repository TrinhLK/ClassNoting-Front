import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ subscribe: vi.fn(), drafts: vi.fn(), stop: vi.fn(), callback: undefined as any, error: undefined as any }));
vi.mock("firebase/firestore", () => ({ collection: vi.fn(), where: vi.fn(), query: vi.fn(), onSnapshot: (...args: any[]) => m.subscribe(...args) }));
vi.mock("@/app/lib/firebase", () => ({ db: {} }));
vi.mock("@/app/lib/indexedDB", () => ({ getAllDraftsMeta: m.drafts }));
import { useDashboardMeetings } from "@/app/hooks/useDashboardMeetings";
import { mockMeeting } from "@/tests/helpers/fixtures";
const snapshot = (id: string) => ({ docs: [{ id, data: () => mockMeeting({ id }) }] });
beforeEach(() => {
  vi.clearAllMocks();
  m.subscribe.mockImplementation((_query, callback, error) => { m.callback = callback; m.error = error; return m.stop; });
  m.drafts.mockResolvedValue([]);
});
it("shows realtime data without waiting for local drafts or another cloud fetch", async () => {
  m.drafts.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useDashboardMeetings("u1", 0, vi.fn()));
  act(() => m.callback(snapshot("m1")));
  expect(result.current.loading).toBe(false);
  expect(result.current.meetings[0].id).toBe("m1");
});
it("does not resubscribe when notification callbacks or refresh signal change", async () => {
  const { result, rerender } = renderHook(({ signal }) => useDashboardMeetings("u1", signal, vi.fn()), { initialProps: { signal: 0 } });
  act(() => m.callback(snapshot("m1")));
  rerender({ signal: 1 });
  act(() => result.current.refresh());
  await waitFor(() => expect(m.drafts).toHaveBeenCalled());
  expect(m.subscribe).toHaveBeenCalledTimes(1);
  expect(result.current.loading).toBe(false);
  expect(result.current.meetings[0].id).toBe("m1");
});
it("deduplicates cloud meetings and local drafts", async () => {
  m.drafts.mockResolvedValue([mockMeeting({ id: "same" })]);
  const { result } = renderHook(() => useDashboardMeetings("u1", 0, vi.fn()));
  act(() => m.callback(snapshot("same")));
  await waitFor(() => expect(m.drafts).toHaveBeenCalled());
  expect(result.current.meetings).toHaveLength(1);
});
it("clears data and ignores old snapshots when switching accounts", async () => {
  const { result, rerender } = renderHook(({ uid }) => useDashboardMeetings(uid, 0, vi.fn()), { initialProps: { uid: "u1" } });
  const oldCallback = m.callback;
  act(() => oldCallback(snapshot("private")));
  rerender({ uid: "u2" });
  act(() => oldCallback(snapshot("stale")));
  expect(result.current.meetings).toEqual([]);
  expect(m.stop).toHaveBeenCalled();
});
it("ends loading and reports read failures", () => {
  const { result } = renderHook(() => useDashboardMeetings("u1", 0, vi.fn()));
  act(() => m.error(new Error("offline")));
  expect(result.current.loading).toBe(false);
  expect(result.current.error).not.toBe("");
});
