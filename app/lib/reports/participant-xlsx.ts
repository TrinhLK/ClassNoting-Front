import type { Meeting } from '../db';
import { buildParticipantReport } from './participant-report';

const stamp=(ms:number)=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'medium'}).format(Number.isFinite(ms) ? ms : 0);
const clock=(sec:number)=>{const n=Math.max(0,Math.floor(sec));return `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
const chunks=(text:string)=>Array.from({length:Math.max(1,Math.ceil(text.length/1000))},(_,i)=>text.slice(i*1000,(i+1)*1000));
/** All user text is stored as string cells, never Excel formulas. */
export async function participantWorkbook(meeting: Meeting) {
  const ExcelJS=await import('exceljs');
  const workbook=new ExcelJS.Workbook();workbook.creator='EzNoting';workbook.created=new Date();
  const summary=workbook.addWorksheet('Tổng hợp');
  summary.addRow([meeting.title]);summary.addRow(['Ngày bắt đầu',stamp(meeting.createdAt)]);
  summary.addRow(['Phạm vi','Chỉ các tài khoản và nội dung extension quan sát được trong phiên ghi. Giờ Việt Nam (UTC+7).']);
  summary.addRow(['Thời gian có mặt','Tổng khoảng quan sát liên tục; lấy mẫu 5 giây, không cộng khoảng mất quan sát >10 giây. Không tính trước khi bắt đầu ghi.']);
  summary.addRow(['Lưu ý','ID Meet có thể đổi khi vào lại. Không tự gộp người trùng tên/khác ID. Biên bản cũ thiếu mốc thời gian ghi Không có dữ liệu.']);
  summary.addRow(['Nội dung','Tin nhắn chỉ gồm dữ liệu đã thu; phát biểu có thể chưa xác minh người nói. Thời gian nói không phải thời gian có mặt.']);
  summary.addRow(['Tên hiển thị','ID Meet','Thời gian có mặt (quan sát)','Số khoảng quan sát','Tin nhắn','Đoạn phát biểu','Thời gian phát biểu','Ghi chú']);
  const attendance=workbook.addWorksheet('Thời gian có mặt');attendance.addRow(['Tên','ID Meet','Thấy lần đầu','Thấy lần cuối','Phát hiện rời phòng','Thời gian quan sát','Kết thúc khoảng']);
  const chat=workbook.addWorksheet('Tin nhắn');chat.addRow(['Tên','ID Meet','Thời gian gửi','ID tin nhắn','Phần','Nội dung']);
  const speech=workbook.addWorksheet('Phát biểu');speech.addRow(['Tên','ID Meet','Bắt đầu trong bản ghi','Kết thúc trong bản ghi','Độ tin cậy','ID đoạn','Phần','Nội dung']);
  const reasons={'left-roster':'Không còn trong danh sách đầy đủ','not-visible':'Không còn được hiển thị; chưa xác nhận rời','gap':'Gián đoạn quan sát','capture-end':'Cuối khoảng quan sát'};
  for(const row of buildParticipantReport(meeting)) {
    const id=row.participant.id != null ? String(row.participant.id) : '';
    summary.addRow([row.name,id,row.observedSeconds===null ? 'Không có dữ liệu' : row.observedSeconds/86400,row.intervals.length,row.messages.length,row.speech.length,row.speakingSeconds/86400,!id ? 'Chưa có ID tài khoản; không suy đoán thời gian có mặt' : 'Tách theo ID Meet']);
    for(const i of row.intervals) attendance.addRow([row.name,id,stamp(i.start),stamp(i.lastSeen),i.detectedLeftAt ? stamp(i.detectedLeftAt):'',(i.lastSeen-i.start)/86400000,reasons[i.endReason]]);
    for(const m of row.messages) {const parts=chunks(m.text);parts.forEach((part,i)=>chat.addRow([row.name,id,stamp(m.timestamp),m.id,`${i+1}/${parts.length}`,part]));}
    for(const s of row.speech) {const parts=chunks(s.text);parts.forEach((part,i)=>speech.addRow([row.name,id,clock(s.start),clock(s.end),s.uncertain===false ? 'Đã gán' : 'Đang xác minh',s.id,`${i+1}/${parts.length}`,part]));}
  }
  const widths=[[28,48,29,24,15,20,25,65],[28,48,26,26,26,25,55],[28,48,26,32,10,100],[28,48,25,25,20,30,10,100]];
  [summary,attendance,chat,speech].forEach((sheet,index)=>{
    const header=index===0 ? 7 : 1;sheet.views=[{state:'frozen',ySplit:header}];
    sheet.columns.forEach((column,i)=>column.width=widths[index][i] || 25);
    sheet.autoFilter={from:{row:header,column:1},to:{row:sheet.rowCount,column:widths[index].length}};
    sheet.eachRow((row,n)=>{
      row.alignment={vertical:'top',wrapText:true};row.font={name:'Calibri',size:11};
      if(n===header){row.font={bold:true,color:{argb:'FFFFFFFF'},name:'Calibri',size:11};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF4338CA'}};row.height=32;}
      else if(n>header) {const content=String(row.getCell(widths[index].length).value || '');row.height=Math.min(350,Math.max(32,Math.ceil(content.length/85)*15));if(n%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5F9'}};}
    });
  });
  summary.getColumn(3).numFmt='[h]:mm:ss';summary.getColumn(7).numFmt='[h]:mm:ss';attendance.getColumn(6).numFmt='[h]:mm:ss';
  summary.getRow(1).font={bold:true,size:16};summary.getRow(1).height=28;
  for(let row=3;row<=6;row++){summary.mergeCells(row,2,row,8);summary.getRow(row).height=48;}
  return workbook;
}
export async function participantXlsx(meeting: Meeting): Promise<Blob> {
  const workbook=await participantWorkbook(meeting);const data=await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(data)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
