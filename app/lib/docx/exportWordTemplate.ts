import type { Meeting } from '../db';
import { updateMeetingProcess } from '../db';
import { postGemini } from '../api';
import { parseAiJson } from '../json-parser';
import { fillWordTemplate, selectWordForm, wordTemplateSlots } from './wordTemplate';
import { paragraphPlanEdits, validateParagraphPlan } from './paragraphPlan';
import { loadWordFile, saveWordFile, wordSummaryHash, wordExportIdentity } from './templateStorage';
import { stripEvidenceReferences, stripTimestamps } from '../text';

const files=new Map<string,Promise<Blob>>();
export function clearWordExportMemoryCache(){files.clear();}
type Notify=(message:string)=>void;
export async function exportWordTemplate(meeting:Meeting,notify:Notify=()=>{}):Promise<Blob> {
 const source=meeting.summaryWordTemplate;
 if(!source)throw new Error('Chưa lưu file mẫu Word gốc. Hãy tải lại mẫu rồi tóm tắt lại.');
 if(!meeting.summary?.trim())throw new Error('Chưa có biên bản để điền vào Word.');
 if(wordExportIdentity()!==meeting.userId)throw new Error('Vui lòng đăng nhập bằng tài khoản sở hữu cuộc họp để tải mẫu Word gốc.');
 const summaryHash=await wordSummaryHash(meeting.summary);
 const templatePath=source.path+(source.formIndex===undefined?'':`#form=${source.formIndex}`);
 const key=JSON.stringify([meeting.userId,meeting.id,summaryHash,templatePath]);
 if(files.has(key)){notify('Đang tải bản Word đã tạo...');return files.get(key)!;}
 const work=(async()=>{
  notify('Xuất Word · 1/3: Đang tải mẫu gốc...');
  const cache=meeting.summaryDocx;
  if(cache && [3,5].includes(cache.formatVersion||0) && cache.summaryHash===summaryHash && cache.templatePath===templatePath){
   try{return await loadWordFile(cache);}catch{/* Regenerate from a valid saved plan if the cached file was removed. */}
  }
  const original=await loadWordFile(source);
  const file=source.formIndex===undefined?original:await selectWordForm(original,source.formIndex);
  const slots=await wordTemplateSlots(file);
  const saved=meeting.summaryWordPlan;
  let plan;
  if(saved?.summaryHash===summaryHash && saved.templatePath===templatePath && [4,5].includes(saved.formatVersion)){
   try{plan=validateParagraphPlan(saved.replacements,slots);}catch{/* Invalid cached plans are never used. */}
  }
  if(!plan){
   notify('Xuất Word · 2/3: AI đang điền nội dung vào mẫu...');
   const data=await postGemini({mode:'docx_fill',wordPlanVersion:2,sessionId:`word-${meeting.id}`.slice(0,128),aiMeeting:{kind:'meeting',id:meeting.id},text:stripTimestamps(stripEvidenceReferences(meeting.summary!)),wordSlots:slots},150000);
   plan=validateParagraphPlan(parseAiJson(data.summary,'docx_fill','array'),slots);
  }
  const edits=paragraphPlanEdits(plan,slots);
  if(!edits.length)throw new Error('AI chưa điền nội dung mới vào mẫu Word. Hãy thử lại.');
  notify('Xuất Word · 3/3: Đang ghép và kiểm tra file...');
  const blob=await fillWordTemplate(file,edits);
  // Deliver first. Slow/unavailable cache storage must never block the download.
  void updateMeetingProcess(meeting.id,{summaryWordPlan:{summaryHash,templatePath,formatVersion:5,replacements:plan}}).catch(()=>{});
  void saveWordFile(blob,`${meeting.title}.docx`).then(saved=>updateMeetingProcess(meeting.id,{summaryDocx:{...saved,summaryHash,templatePath,formatVersion:5}})).catch(()=>{});
  return blob;
 })();
 files.set(key,work);
 while(files.size>8)files.delete(files.keys().next().value!);
 try{return await work;}catch(error){files.delete(key);throw error;}
}
