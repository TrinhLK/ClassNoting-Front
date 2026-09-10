import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useSummarize } from "@/app/hooks/useSummarize";
import { useTaskExtraction } from "@/app/hooks/useTaskExtraction";
import { postGemini, requestSummary } from "@/app/lib/api";
import { mockMeeting } from "@/tests/helpers/fixtures";

vi.mock("@/app/lib/api", () => ({ postGemini: vi.fn(), requestSummary: vi.fn(), uploadAudioToFirebase: vi.fn() }));
vi.mock("@/app/lib/db", () => ({ updateMeetingProcess: vi.fn(async () => {}) }));
vi.mock("@/app/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "test-user" } }) }));
vi.mock("@/app/context/GlobalUIProvider", () => ({ useGlobalUI: () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  confirm: vi.fn(async () => true),
}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeEach(() => {
  vi.mocked(postGemini).mockReset().mockResolvedValue({ summary: "[]" });
  vi.mocked(requestSummary).mockReset().mockResolvedValue("Summary");
});

it("summary and task hooks reuse meeting-scoped IDs on rerun/remount and separate workflows/meetings", async () => {
  const meeting = mockMeeting();
  const other = mockMeeting({ id: "other-meeting" });
  const useWorkflows = () => ({ summarize: useSummarize(), tasks: useTaskExtraction() });
  const first = renderHook(useWorkflows);
  for (let run = 0; run < 2; run++) {
    await act(async () => {
      await first.result.current.summarize(meeting, "Transcript", "Template");
      await first.result.current.tasks.extractActionItems(meeting, []);
    });
  }
  first.unmount();
  const second = renderHook(useWorkflows);
  await act(async () => {
    await second.result.current.summarize(meeting, "Updated transcript");
    await second.result.current.tasks.extractActionItems(meeting, []);
    await second.result.current.summarize(other, "Other transcript");
    await second.result.current.tasks.extractActionItems(other, []);
  });
  expect(vi.mocked(requestSummary).mock.calls.map(call => call[1])).toEqual([
    "summary-meeting_test_1", "summary-meeting_test_1", "summary-meeting_test_1", "summary-other-meeting",
  ]);
  expect(vi.mocked(postGemini).mock.calls.map(call => call[0].sessionId)).toEqual([
    "tasks-meeting_test_1", "tasks-meeting_test_1", "tasks-meeting_test_1", "tasks-other-meeting",
  ]);
  expect(vi.mocked(postGemini).mock.calls.every(call => call[0].mode === "extract_json")).toBe(true);
});
