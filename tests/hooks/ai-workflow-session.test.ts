import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useSummarize } from "@/app/hooks/useSummarize";
import { useTaskExtraction } from "@/app/hooks/useTaskExtraction";
import { postGemini, requestSummary } from "@/app/lib/api";
import { mockMeeting } from "@/tests/helpers/fixtures";
import { updateMeetingProcess } from "@/app/lib/db";

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
  vi.mocked(updateMeetingProcess).mockClear();
});

it("retains an existing report and completed state when regenerating fails", async () => {
  vi.mocked(requestSummary).mockRejectedValueOnce(Object.assign(new Error("Provider unavailable"), {status:503}));
  const meeting = mockMeeting({summary:"Previous verified report",status:"completed"});
  const hook = renderHook(()=>useSummarize());
  await act(async()=>{await hook.result.current(meeting,"Transcript","Template");});
  const update = vi.mocked(updateMeetingProcess).mock.calls.at(-1)?.[1];
  expect(update).toMatchObject({status:"completed",errorMessage:"Provider unavailable"});
  expect(update).not.toHaveProperty("summary");
});

it("clears a stale error after a successful summary", async () => {
  const hook = renderHook(()=>useSummarize());
  await act(async()=>{await hook.result.current(mockMeeting({status:"failed",errorMessage:"Old error"}),"Transcript");});
  expect(vi.mocked(updateMeetingProcess).mock.calls.at(-1)?.[1]).toMatchObject({status:"completed",summary:"Summary"});
  expect(vi.mocked(updateMeetingProcess).mock.calls.at(-1)?.[1]).toHaveProperty("errorMessage");
});

it("links the original Word file to the successful summary and invalidates the previous export", async () => {
  const source={path:"users/owner/uploads/word/template.docx",name:"Template.docx",formIndex:3};
  const hook=renderHook(()=>useSummarize());
  await act(async()=>{await hook.result.current(mockMeeting(),"Transcript","Template instructions",{id:"word-template",name:"Template",description:"",structure:"Template instructions",wordSource:source});});
  expect(vi.mocked(updateMeetingProcess).mock.calls.at(-1)?.[1]).toMatchObject({summaryWordTemplate:source,summary:"Summary"});
  expect(vi.mocked(updateMeetingProcess).mock.calls.at(-1)?.[1]).toHaveProperty("summaryDocx");
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

it("does not submit a second full report while the first is still running across hook instances", async () => {
  let complete!: (value:string)=>void;
  vi.mocked(requestSummary).mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
  const first=renderHook(()=>useSummarize());
  const second=renderHook(()=>useSummarize());
  const meeting=mockMeeting();
  let running!: Promise<void>;
  await act(async()=>{running=first.result.current(meeting,"Transcript");});
  await act(async()=>{await second.result.current(meeting,"Transcript");});
  expect(requestSummary).toHaveBeenCalledTimes(1);
  await act(async()=>{complete("Full report");await running;});
  await act(async()=>{await second.result.current(meeting,"Transcript");});
  expect(requestSummary).toHaveBeenCalledTimes(2);
});

it("does not overwrite another request's state when the server reports an active task", async()=>{
  vi.mocked(requestSummary).mockRejectedValueOnce(Object.assign(new Error("Still running"),{status:409,code:"AI_MEETING_BUSY"}));
  const hook=renderHook(()=>useSummarize());
  await act(async()=>{await hook.result.current(mockMeeting(),"Transcript");});
  expect(updateMeetingProcess).toHaveBeenCalledTimes(1);
  expect(updateMeetingProcess).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({status:"summarizing",summaryProgress:expect.objectContaining({stage:"preparing"})}));
});
