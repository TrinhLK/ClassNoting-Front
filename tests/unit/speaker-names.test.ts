import { expect, it } from "vitest";
import { applySpeakerNames, renameTranscriptSpeakers } from "@/app/lib/speaker-names";
import { mockMeeting, mockSegment, mockSpeaker } from "@/tests/helpers/fixtures";

const meeting = () => mockMeeting({
  speakers: [mockSpeaker({id:"a",name:"Người nói 1"}),mockSpeaker({id:"b",name:"Người nói 2"})],
  segments: [
    mockSegment({id:"call",speakerId:"a",start:0,end:3,text:"Chị Lan, báo cáo đã xong chưa?"}),
    mockSegment({id:"reply",speakerId:"b",start:3,end:6,text:"Em đã hoàn thành rồi."}),
  ],
});
const proposal = (changes = {}) => ({speakerId:"b",name:"Lan",confidence:"medium",evidence:[{kind:"address_response",namingSegmentId:"call",responseSegmentId:"reply",quote:"Chị Lan, báo cáo đã xong chưa?"}],...changes});
it("names the respondent from a clear call-and-response and retains source evidence", () => {
  const result = applySpeakerNames(meeting(), [proposal()]);
  expect(result[0].name).toBe("Người nói 1");
  expect(result[1]).toMatchObject({name:"Lan",nameSource:"conversation",nameConfidence:"medium",nameEvidence:[{namingSegmentId:"call",responseSegmentId:"reply"}]});
});
it("rejects names absent from the quoted source, ungrounded references and low-confidence guesses", () => {
  for (const item of [proposal({name:"Hương"}), proposal({confidence:"low"}),proposal({evidence:[{kind:"address_response",namingSegmentId:"missing",responseSegmentId:"reply",quote:"Lan"}]})]) {
    expect(applySpeakerNames(meeting(), [item])).toEqual(meeting().speakers);
  }
});
it("never assigns the called name to the caller", () => {
  expect(applySpeakerNames(meeting(), [proposal({speakerId:"a"})])).toEqual(meeting().speakers);
});
it("does not mistake part of another name for the proposed name", () => {
  expect(applySpeakerNames(meeting(), [proposal({name:"An"})])).toEqual(meeting().speakers);
});
it("abstains when the same voice receives contradictory grounded names", () => {
  const original = meeting();
  original.segments[0].text = "Chị Lan, chị Hương, báo cáo đã xong chưa?";
  const evidence = [{kind:"address_response",namingSegmentId:"call",responseSegmentId:"reply",quote:original.segments[0].text}];
  expect(applySpeakerNames(original, [proposal({evidence}), proposal({name:"Hương",evidence})])).toEqual(original.speakers);
});
it("does not override an existing manual name or merge two people into the same name", () => {
  const original=meeting();original.speakers[1].name="Tên đã sửa";
  expect(applySpeakerNames(original,[proposal()])).toEqual(original.speakers);
  const duplicate=meeting();duplicate.speakers[0].name="Anh Lan";
  expect(applySpeakerNames(duplicate,[proposal()])).toEqual(duplicate.speakers);
});
it("supports self introduction without needing another person to repeat the name", () => {
  const original=meeting();original.segments[1].text="Tôi là Trình, phụ trách phần kỹ thuật.";
  expect(applySpeakerNames(original,[proposal({name:"Trình",confidence:"high",evidence:[{kind:"self_introduction",namingSegmentId:"reply",responseSegmentId:"reply",quote:original.segments[1].text}]})])[1].name).toBe("Trình");
});
it("leaves a response uncertain when a different voice answers first", () => {
  const original=meeting();original.segments.splice(1,0,mockSegment({id:"interruption",speakerId:"c",start:3,end:4,text:"Để tôi nói trước."}));
  expect(applySpeakerNames(original,[proposal()])).toEqual(original.speakers);
});
it("changes labels once while retaining the exact spoken text", () => {
  const original=meeting();const result=applySpeakerNames(original,[proposal()]);
  expect(renameTranscriptSpeakers("[00:03] [Người nói 2 (danh tính chưa xác nhận)]: Tôi gọi Lan.",original.speakers,result))
    .toBe("[00:03] [Lan (danh tính chưa xác nhận)]: Tôi gọi Lan.");
});
