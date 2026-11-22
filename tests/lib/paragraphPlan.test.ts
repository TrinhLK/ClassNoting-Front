import {expect,it} from 'vitest';
import JSZip from 'jszip';
import {paragraphPlanEdits,validateParagraphPlan} from '@/app/lib/docx/paragraphPlan';
import {fillWordTemplate,wordTemplateSlots} from '@/app/lib/docx/wordTemplate';
it('diffs separate names and numbers without replacing the styling of words between them',async()=>{
 const zip=new JSZip();
 const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Học viên </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>Lan</w:t></w:r><w:r><w:t>, đạt </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>8.5</w:t></w:r><w:r><w:t> điểm, 5/5 phiếu.</w:t></w:r></w:p></w:body></w:document>';
 zip.file('word/document.xml',xml);zip.file('word/styles.xml','unchanged');
 const input=new Blob([await zip.generateAsync({type:'arraybuffer'})]);
 const slots=await wordTemplateSlots(input);
 const edits=paragraphPlanEdits([{id:'p0',text:'Học viên Chi, đạt 9.0 điểm, 5/5 phiếu.'}],slots);
 expect(edits.length).toBeGreaterThanOrEqual(2);
 const result=await JSZip.loadAsync(await (await fillWordTemplate(input,edits)).arrayBuffer());
 const after=await result.file('word/document.xml')!.async('string');
 expect(after).toContain('<w:rPr><w:i/></w:rPr><w:t xml:space="preserve">Chi</w:t>');
 expect(after).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">9.0</w:t>');
 expect(after).toContain('<w:t>, đạt </w:t>');expect(after).toContain('5/5 phiếu.');
 expect(await result.file('word/styles.xml')!.async('string')).toBe('unchanged');
});
it.each([
 ['Lan gọi Lan','Lan gọi Chi'], ['Tên: Lan','Tên: chị Lan'], ['Tên: Lan','Tên:'], ['Lan','Chị Lan'], ['Lan',''],
 ['Bắt đầu 01:23','Bắt đầu 01:23 - 01:51'], ['Giá trị 0,004','Giá trị - 0,004'],
])('handles repeated words, insertions and deletions (%s)',async(old,text)=>{
 const zip=new JSZip();zip.file('word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${old}</w:t></w:r></w:p></w:body></w:document>`);
 const file=new Blob([await zip.generateAsync({type:'arraybuffer'})]);const slots=await wordTemplateSlots(file);
 const result=await fillWordTemplate(file,paragraphPlanEdits([{id:'p0',text}],slots));
 expect((await wordTemplateSlots(result))[0].text).toBe(text);
});
it('rejects duplicate paragraphs, nonexistent IDs and leaked reasoning',()=>{
 const slots=[{id:'p0',text:'Original'}];
 expect(()=>validateParagraphPlan([{id:'p1',text:'X'}],slots)).toThrow();
 expect(()=>validateParagraphPlan([{id:'p0',text:'A'},{id:'p0',text:'B'}],slots)).toThrow();
 expect(()=>validateParagraphPlan([{id:'p0',text:'<thought>reasoning'}],slots)).toThrow();
});
