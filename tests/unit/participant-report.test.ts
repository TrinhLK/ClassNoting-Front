import {describe,it,expect} from 'vitest';
import {attendanceIntervals} from '@/app/lib/attendance';
import {buildParticipantReport} from '@/app/lib/reports/participant-report';
import {participantWorkbook} from '@/app/lib/reports/participant-xlsx';
import {mockMeeting,mockSegment,mockSpeaker} from '@/tests/helpers/fixtures';
const a={id:'a',name:'An'},b={id:'b',name:'An'},silent={id:'c',name:'Bình'};
const obs=(at:number,participants=[a],complete=true)=>({id:String(at),at,participants,complete});
describe('participant attendance report',()=>{
  it('sums observed presence across departures, not time before capture or missing gaps',()=>{
    const rows=attendanceIntervals([a,silent],[obs(0),obs(5000),obs(10000,[]),obs(15000),obs(20000),obs(40000),obs(45000)]);
    expect(rows[0].observedSeconds).toBe(15);
    expect(rows[0].intervals.map(i=>i.endReason)).toEqual(['left-roster','gap','capture-end']);
    expect(rows[0].intervals[0].detectedLeftAt).toBe(10000);
    expect(rows[1].observedSeconds).toBeNull();
  });
  it('does not call a hidden tile a departure, deduplicates retries and keeps silent participants',()=>{
    const rows=attendanceIntervals([],[obs(0,[a,silent]),obs(5000,[a,silent]),obs(5000,[a,silent]),obs(10000,[],false)]);
    expect(rows).toHaveLength(2);
    expect(rows.every(r=>r.observedSeconds===5)).toBe(true);
    expect(rows[0].intervals[0]).toMatchObject({endReason:'not-visible'});
    expect(rows[0].intervals[0].detectedLeftAt).toBeUndefined();
  });
  it('keeps duplicate names distinct and does not assign ambiguous legacy messages',()=>{
    const report=buildParticipantReport(mockMeeting({participants:[a,b,silent],attendanceObservations:[obs(0,[a,b,silent]),obs(5000,[a,b,silent])],speakers:[mockSpeaker({name:'An'})],segments:[mockSegment({participantId:'a',end:4}),mockSegment({id:'s2',participantId:'a',start:2,end:6})],chatMessages:[{id:'m1',sender:'An',text:'Hi',timestamp:1,participantId:'b'},{id:'m2',sender:'An',text:'legacy',timestamp:2}]}));
    expect(report.find(r=>r.key==='id:a')).toMatchObject({speakingSeconds:6,messages:[]});
    expect(report.find(r=>r.key==='id:b')?.messages.map(m=>m.id)).toEqual(['m1']);
    expect(report.find(r=>r.key==='id:c')).toMatchObject({speech:[],messages:[],observedSeconds:5});
    expect(report.find(r=>!r.participant.id)?.messages.map(m=>m.id)).toEqual(['m2']);
  });
  it('exports all four sheets, plain text formulas, long content, and legacy unknown attendance',async()=>{
    const text='=HYPERLINK("https://example.com") '+ 'xin chào '.repeat(600);
    const workbook=await participantWorkbook(mockMeeting({participants:[a],speakers:[mockSpeaker({name:'An'})],chatMessages:[{id:'m',sender:'An',participantId:'a',text,timestamp:1700000000000}]}));
    const bytes=await workbook.xlsx.writeBuffer();
    const ExcelJS=await import('exceljs');const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(bytes);
    expect(loaded.worksheets.map(s=>s.name)).toEqual(['Tổng hợp','Thời gian có mặt','Tin nhắn','Phát biểu']);
    expect(loaded.worksheets[0].getCell('C8').value).toBe('Không có dữ liệu');
    const chat=loaded.getWorksheet('Tin nhắn')!;const parts:string[]=[];
    chat.eachRow((row,n)=>{if(n>1){expect(row.getCell(6).type).toBe(ExcelJS.ValueType.String);parts.push(String(row.getCell(6).value));}});
    expect(parts.join('')).toBe(text);
    expect(loaded.worksheets[0].getCell('E8').value).toBe(1);
  });
});
