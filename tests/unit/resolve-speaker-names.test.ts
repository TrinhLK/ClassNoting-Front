import { beforeEach, expect, it, vi } from "vitest";
import { mockMeeting, mockSegment, mockSpeaker } from "@/tests/helpers/fixtures";
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock("@/app/lib/firebase-admin", () => ({getAdminDb:()=>({collection:()=>({doc:()=>({get:mocks.get})})})}));
vi.mock("@/app/lib/meeting-content", () => ({loadMeetingContent:async (meeting:unknown)=>meeting,saveMeetingContent:mocks.save}));
import { resolveSpeakerNames } from "@/app/lib/resolve-speaker-names";
const original=mockMeeting({userId:"owner",summary:"Old report",speakers:[mockSpeaker({id:"a",name:"Người nói 1"}),mockSpeaker({id:"b",name:"Người nói 2"})],segments:[mockSegment({id:"call",speakerId:"a",start:0,end:2,text:"Chị Lan, chị báo cáo nhé."}),mockSegment({id:"reply",speakerId:"b",start:2,end:4,text:"Vâng, em báo cáo."})]});
beforeEach(()=>{vi.clearAllMocks();mocks.get.mockResolvedValue({data:()=>original,updateTime:"revision-1"});});
it("persists inferred names with the source revision before returning renamed summary input",async()=>{
  const generate=vi.fn(async()=>JSON.stringify([{speakerId:"b",name:"Lan",confidence:"medium",evidence:[{kind:"address_response",namingSegmentId:"call",responseSegmentId:"reply",quote:"Chị Lan, chị báo cáo nhé."}]}]));
  const text=await resolveSpeakerNames(original.id,"owner","[00:02] [Người nói 2]: Vâng, em báo cáo.",generate);
  expect(text).toBe("[00:02] [Lan]: Vâng, em báo cáo.");
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({summaryNeedsReview:true,speakers:expect.arrayContaining([expect.objectContaining({id:"b",name:"Lan"})])}),"revision-1");
  expect(mocks.save.mock.calls[0][0].segments).toEqual(original.segments);
});
it("never sends another owner's transcript to the model",async()=>{
  const generate=vi.fn();
  await resolveSpeakerNames(original.id,"someone-else","source",generate);
  expect(generate).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("keeps the recording when the model returns no useful evidence",async()=>{
  const text=await resolveSpeakerNames(original.id,"owner","source",async()=>"[]");
  expect(text).toBe("source");expect(mocks.save).not.toHaveBeenCalled();
});
