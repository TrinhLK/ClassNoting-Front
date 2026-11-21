import type { Meeting } from "../db";
import { updateMeetingProcess } from "../db";
import { postGemini } from "../api";
import { parseAiJson } from "../json-parser";
import { fillWordTemplate, selectWordForm, wordTemplateSlots } from "./wordTemplate";
import { validateWordEdits } from "./wordFillPrompt";
import { loadWordFile, saveWordFile, wordSummaryHash } from "./templateStorage";
import { stripEvidenceReferences, stripTimestamps } from "../text";

export async function exportWordTemplate(meeting:Meeting):Promise<Blob> {
  const source=meeting.summaryWordTemplate;
  if(!source) throw new Error("Chưa lưu file mẫu Word gốc. Hãy tải lại mẫu rồi tóm tắt lại.");
  if(!meeting.summary?.trim()) throw new Error("Chưa có biên bản để điền vào Word.");
  const summaryHash=await wordSummaryHash(meeting.summary);
  const templatePath=source.path+(source.formIndex===undefined?"":`#form=${source.formIndex}`);
  const cache=meeting.summaryDocx;
  if(cache?.formatVersion===3 && cache.summaryHash===summaryHash && cache.templatePath===templatePath) return loadWordFile(cache);
  const original=await loadWordFile(source);
  const file=source.formIndex===undefined?original:await selectWordForm(original,source.formIndex);
  const slots=await wordTemplateSlots(file);
  const data=await postGemini({mode:"docx_fill",sessionId:`word-${meeting.id}`.slice(0,128),aiMeeting:{kind:"meeting",id:meeting.id},text:stripTimestamps(stripEvidenceReferences(meeting.summary)),wordSlots:slots});
  const edits=validateWordEdits(parseAiJson(data.summary,"docx_fill","array"),slots);
  if(!edits.length) throw new Error("AI chưa điền nội dung mới vào mẫu Word. Hãy thử lại.");
  const blob=await fillWordTemplate(file,edits);
  // Cache privately. The exact source path and summary hash invalidate edited summaries/templates.
  try {
    const saved=await saveWordFile(blob,`${meeting.title}.docx`);
    await updateMeetingProcess(meeting.id,{summaryDocx:{...saved,summaryHash,templatePath,formatVersion:3}});
  } catch { /* A cache write failure must not prevent downloading the generated document. */ }
  return blob;
}
