import type { Meeting, ChatMessage, Segment, MeetingParticipant } from '../db';
import { attendanceIntervals, participantKey, type ParticipantAttendance } from '../attendance';

export interface ParticipantReportRow extends ParticipantAttendance {
  name: string;
  messages: ChatMessage[];
  speech: Segment[];
  speakingSeconds: number;
}
const norm=(s:string)=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase();
function unionSeconds(rows: Segment[]) {
  let end=0,total=0;
  for (const s of [...rows].sort((a,b)=>a.start-b.start)) {
    const start=Math.max(0,s.start), next=Math.max(start,s.end);
    total+=Math.max(0,next-Math.max(start,end));end=Math.max(end,next);
  }
  return total;
}
export function buildParticipantReport(meeting: Meeting): ParticipantReportRow[] {
  const rows=new Map(attendanceIntervals(meeting.participants || [],meeting.attendanceObservations || []).map(a=>[a.key,{...a,name:a.participant.displayName || a.participant.name,messages:[] as ChatMessage[],speech:[] as Segment[],speakingSeconds:0}]));
  const resolve=(name:string,id?:string):ParticipantReportRow=>{
    if (id && rows.has(`id:${id}`)) return rows.get(`id:${id}`)!;
    if (!id) {
      const matches=[...rows.values()].filter(r=>norm(r.name)===norm(name));
      if (matches.length===1) return matches[0];
      if (matches.length>1) name+= ' (chưa ghép ID)';
    }
    const person:MeetingParticipant={name,...(id ? {id}: {})};const key=participantKey(person);
    if (!rows.has(key)) rows.set(key,{key,participant:person,name,intervals:[],observedSeconds:null,messages:[],speech:[],speakingSeconds:0});
    return rows.get(key)!;
  };
  for (const message of meeting.chatMessages || []) if(message.text.trim()) resolve(message.sender || 'Chưa xác định',message.participantId).messages.push(message);
  const names=new Map(meeting.speakers.map(s=>[s.id,s.name]));
  for (const segment of meeting.segments) if(segment.text.trim()) resolve(names.get(segment.speakerId) || 'Chưa xác định',segment.speakerSource==='manual' || segment.manuallyEdited ? undefined : segment.participantId).speech.push(segment);
  for (const row of rows.values()) row.speakingSeconds=unionSeconds(row.speech);
  return [...rows.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi') || a.key.localeCompare(b.key));
}
