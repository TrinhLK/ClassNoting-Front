import { expect, it } from "vitest";
import JSZip from "jszip";
import {fillWordTemplate,wordTemplateSlots,selectWordForm,wordTemplateForms} from "@/app/lib/docx/wordTemplate";
import {validWordSlots,validateWordEdits,wordFillPrompt} from "@/app/lib/docx/wordFillPrompt";
const wrap=(body:string)=>`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:left="1418"/></w:sectPr></w:body></w:document>`;
const paragraph='<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman"/><w:sz w:val="28"/></w:rPr><w:t>Học viên </w:t></w:r><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Nguyễn </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Văn An</w:t></w:r><w:r><w:t>, đã trình bày.</w:t></w:r></w:p>';
async function word(body=paragraph) {
 const z=new JSZip();z.file('word/document.xml',wrap(body));z.file('word/styles.xml','source styles');z.file('word/numbering.xml','source lists');z.file('word/header1.xml','source header');z.file('word/media/a.png',new Uint8Array([1,2,3]));z.file('[Content_Types].xml','source types');
 return new Blob([await z.generateAsync({type:'arraybuffer'})]);
}
it('patches a name split across styled runs without reconstructing other package parts or formatting',async()=>{
 const file=await word(),output=await fillWordTemplate(file,[{id:'p0',find:'Nguyễn Văn An',text:'Lê Văn Bình'}]);
 const before=await JSZip.loadAsync(await file.arrayBuffer()),after=await JSZip.loadAsync(await output.arrayBuffer());
 expect(Object.keys(after.files)).toEqual(Object.keys(before.files));
 for(const name of Object.keys(before.files).filter(n=>!before.files[n].dir && n!=='word/document.xml')) expect(await after.file(name)!.async('uint8array')).toEqual(await before.file(name)!.async('uint8array'));
 const xml=await after.file('word/document.xml')!.async('string');
 expect(xml).toContain('<w:b/><w:i/>');expect(xml).toContain('<w:sz w:val="28"/>');expect(xml).toContain('<w:pgMar w:left="1418"/>');
 expect((await wordTemplateSlots(output))[0].text).toBe('Học viên Lê Văn Bình, đã trình bày.');
 expect(xml).not.toContain('Nguyễn');
});
it('fills ruled blank paragraphs with Word breaks without leaving a wrapping leader tab',async()=>{
 const output=await fillWordTemplate(await word('<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9000"/></w:tabs></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:tab/></w:r></w:p>'),[{id:'p0',find:'',text:'#### Câu hỏi<br>**Trả lời** & kết luận'}]);
 const z=await JSZip.loadAsync(await output.arrayBuffer());const xml=await z.file('word/document.xml')!.async('string');
 expect(xml).toContain('<w:br/>');expect(xml).toContain('Trả lời &amp; kết luận');expect(xml).not.toMatch(/####|\*\*|&lt;br/);
 expect(xml).not.toContain('<w:tab/>');
 expect(xml).toContain('w:leader="dot"');
});
it('applies two replacements right to left without matching newly inserted content',async()=>{
 const file=await word('<w:p><w:r><w:t>An và Bình</w:t></w:r></w:p>');
 const filled=await fillWordTemplate(file,[{id:'p0',find:'An',text:'Bình'},{id:'p0',find:'Bình',text:'Chi'}]);
 expect((await wordTemplateSlots(filled))[0].text).toBe('Bình và Chi');
});
it('rejects invalid, overlapping, missing or ambiguous locations without downloading a broken template',async()=>{
 const file=await word('<w:p><w:r><w:t>Lan Lan</w:t></w:r></w:p>');
 for(const edits of [[{id:'p4',find:'Lan',text:'An'}],[{id:'p0',find:'Lan',text:'An'}],[{id:'p0',find:'missing',text:'An'}],[{id:'p0',find:'',text:'An'}],[{id:'p0',find:'Lan Lan',text:'An'},{id:'p0',find:'Lan Lan',text:'Chi'}]]) await expect(fillWordTemplate(file,edits)).rejects.toThrow();
});
it('excludes fields and drawings from AI-editable paragraphs',async()=>{
 const file=await word('<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:t>1</w:t></w:r></w:p>'+paragraph);
 expect((await wordTemplateSlots(file)).map(s=>s.id)).toEqual(['p1']);
 await expect(fillWordTemplate(file,[{id:'p0',find:'1',text:'2'}])).rejects.toThrow();
});
it('detects repeated forms and selects one while retaining its tables, typography and page geometry',async()=>{
 const header='<w:tbl><w:tr><w:tc><w:p><w:r><w:t>ĐẠI HỌC QUỐC GIA HÀ NỘI TRƯỜNG ĐẠI HỌC CÔNG NGHỆ CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
 const body=header+paragraph+'<w:p><w:r><w:t>Hồ sơ A</w:t></w:r></w:p>';
 const file=await word(body+body.replace('Hồ sơ A','Hồ sơ B'));
 expect(await wordTemplateForms(file)).toHaveLength(2);
 const chosen=await selectWordForm(file,1);
 const z=await JSZip.loadAsync(await chosen.arrayBuffer()),xml=await z.file('word/document.xml')!.async('string');
 expect(xml).toContain('Hồ sơ B');expect(xml).not.toContain('Hồ sơ A');expect(xml.match(/<w:tbl>/g)).toHaveLength(1);expect(xml).toContain('w:left="1418"');
});
it('validates model edits against exact paragraph IDs, source text and context limits',()=>{
 const slots=[{id:'p0',text:'Tôi là Lan'}];
 expect(validWordSlots(slots)).toBe(true);expect(validWordSlots([...slots,...slots])).toBe(false);
 expect(()=>validateWordEdits([{id:'p9',find:'Lan',text:'An'}],slots)).toThrow();
 expect(()=>validateWordEdits([{id:'p0',find:'Hương',text:'An'}],slots)).toThrow();
 expect(wordFillPrompt('Biên bản mới',slots)).toContain('không Markdown');
});
it('consumes surplus ruled blanks only in filled zones, keeping unfilled zones and signature whitespace',async()=>{
 const rule='<w:p><w:pPr><w:tabs><w:tab w:leader="dot" w:pos="9000"/></w:tabs></w:pPr><w:r><w:tab/></w:r></w:p>';
 const file=await word(rule+rule+rule+'<w:p><w:r><w:t>Kết luận</w:t></w:r></w:p>'+rule+'<w:p/>');
 const output=await fillWordTemplate(file,[{id:'p0',find:'',text:'Nội dung hỏi đáp'}]);
 const slots=await wordTemplateSlots(output);
 expect(slots.map(s=>s.text)).toEqual(['Nội dung hỏi đáp','Kết luận','','']);
});
it('never consumes the only paragraph of another table cell',async()=>{
 const rule='<w:p><w:pPr><w:tabs><w:tab w:leader="dot" w:pos="9000"/></w:tabs></w:pPr><w:r><w:tab/></w:r></w:p>';
 const file=await word(`<w:tbl><w:tr><w:tc>${rule}</w:tc><w:tc>${rule}</w:tc></w:tr></w:tbl>`);
 const output=await fillWordTemplate(file,[{id:'p0',find:'',text:'Trả lời'}]);
 const z=await JSZip.loadAsync(await output.arrayBuffer());
 const xml=await z.file('word/document.xml')!.async('string');
 expect(xml.match(/<w:p>/g)).toHaveLength(2);
});
