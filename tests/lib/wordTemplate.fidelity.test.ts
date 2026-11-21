// Optional local fidelity gate: supply a private source path without committing the document.
import {expect,it} from 'vitest';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import JSZip from 'jszip';
import {fillWordTemplate,selectWordForm,wordTemplateForms,wordTemplateSlots} from '@/app/lib/docx/wordTemplate';
it.skipIf(!process.env.EZ_DOCX_QA_SOURCE)('uses the actual uploaded template without losing any preserve-only package parts',async()=>{
 const input=new Blob([await readFile(process.env.EZ_DOCX_QA_SOURCE!)]);
 const forms=await wordTemplateForms(input);
 const selected=forms.length?await selectWordForm(input,0):input;
 const slots=await wordTemplateSlots(selected);
 const candidate=slots.find(s=>/học viên .+?, sinh ngày/.test(s.text));
 const candidateName=candidate?.text.match(/học viên (.+?), sinh ngày/)?.[1];
 const question=slots.findIndex(s=>s.text.includes('Thư ký viết chi tiết'));
 expect(candidate).toBeDefined();expect(question).toBeGreaterThan(0);
 const output=await fillWordTemplate(selected,[
  {id:candidate!.id,find:candidateName!,text:'Học viên kiểm thử'},
  {id:slots[question+1].id,find:'',text:'Hỏi: Học viên giải thích cách đánh giá kết quả nghiên cứu.'},
  {id:slots[question+2].id,find:'',text:'Trả lời: Học viên trình bày cách đối chiếu các kết quả thực nghiệm.'},
 ]);
 const original=await JSZip.loadAsync(await input.arrayBuffer()),final=await JSZip.loadAsync(await output.arrayBuffer());
 const changed=[];
 for(const [name,entry] of Object.entries(original.files)) {
  if(entry.dir) continue;
  expect(final.file(name)).not.toBeNull();
  const a=await entry.async('uint8array'),b=await final.file(name)!.async('uint8array');
  if(Buffer.compare(Buffer.from(a),Buffer.from(b))) changed.push(name);
 }
 expect(changed).toEqual(['word/document.xml']);
 const before=await JSZip.loadAsync(await selected.arrayBuffer());
 const xmlBefore=await before.file('word/document.xml')!.async('string'),xmlAfter=await final.file('word/document.xml')!.async('string');
 // Source geometry, existing run/paragraph styles and every table property remain exact.
 for(const tag of ['rPr','pPr','tblPr','tblGrid','tcPr','sectPr']) {
  const re=new RegExp(`<w:${tag}(?=[\\s/>])(?:[^>]*?/>|[^>]*>[\\s\\S]*?</w:${tag}>)`,'g');
  const originalProperties=xmlBefore.match(re)||[];
  const finalProperties=xmlAfter.match(re)||[];
  if(['pPr','rPr'].includes(tag)) {
   // Filled handwriting zones intentionally consume unused ruled paragraphs.
   for(const item of finalProperties) {
    const index=originalProperties.indexOf(item);expect(index).toBeGreaterThanOrEqual(0);originalProperties.splice(index,1);
   }
  } else expect(finalProperties).toEqual(originalProperties);
 }
 const out=process.env.EZ_DOCX_QA_OUTPUT || '/tmp/ez-docx-fidelity';
 await mkdir(out,{recursive:true});
 await writeFile(join(out,'source-form.docx'),new Uint8Array(await selected.arrayBuffer()));
 await writeFile(join(out,'filled-form.docx'),new Uint8Array(await output.arrayBuffer()));
 await writeFile(join(out,'fidelity-check.json'),JSON.stringify({forms:forms.length,sourceParagraphs:slots.length,changedParts:changed,formatPropertiesIdentical:true},null,2));
},30000);
