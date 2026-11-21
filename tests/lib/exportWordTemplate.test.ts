import {beforeEach,expect,it,vi} from 'vitest';
import JSZip from 'jszip';
import {mockMeeting} from '@/tests/helpers/fixtures';
const mocks=vi.hoisted(()=>({load:vi.fn(),save:vi.fn(),post:vi.fn(),update:vi.fn()}));
vi.mock('@/app/lib/docx/templateStorage',()=>({loadWordFile:mocks.load,saveWordFile:mocks.save,wordSummaryHash:async (s:string)=>`hash:${s}`}));
vi.mock('@/app/lib/api',()=>({postGemini:mocks.post}));
vi.mock('@/app/lib/db',()=>({updateMeetingProcess:mocks.update}));
import {exportWordTemplate} from '@/app/lib/docx/exportWordTemplate';
const source={path:'users/owner/uploads/word/source.docx',name:'Original.docx'};
beforeEach(async()=>{
 vi.clearAllMocks();
 const zip=new JSZip();zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Tên: Lan</w:t></w:r></w:p></w:body></w:document>');
 mocks.load.mockResolvedValue(new Blob([await zip.generateAsync({type:'arraybuffer'})]));
 mocks.save.mockResolvedValue({path:'users/owner/uploads/word/result.docx',name:'Result.docx'});
 mocks.post.mockResolvedValue({summary:JSON.stringify([{id:'p0',find:'Lan',text:'Chi'}])});
 mocks.update.mockResolvedValue(undefined);
});
it('uses the linked original file and current approved summary, then privately caches the generated document',async()=>{
 const meeting=mockMeeting({summary:'Tên Chi',summaryWordTemplate:source});
 const result=await exportWordTemplate(meeting);
 const z=await JSZip.loadAsync(await result.arrayBuffer());
 expect(await z.file('word/document.xml')!.async('string')).toContain('Chi');
 expect(mocks.post).toHaveBeenCalledWith(expect.objectContaining({mode:'docx_fill',text:'Tên Chi',aiMeeting:{kind:'meeting',id:meeting.id}}));
 expect(mocks.update).toHaveBeenCalledWith(meeting.id,expect.objectContaining({summaryDocx:expect.objectContaining({summaryHash:'hash:Tên Chi',templatePath:source.path})}));
});
it('reuses a valid export without another AI call but regenerates after the summary changes',async()=>{
 const cache={path:'users/owner/uploads/word/cached.docx',name:'Cached.docx',summaryHash:'hash:Tên Chi',templatePath:source.path,formatVersion:3};
 await exportWordTemplate(mockMeeting({summary:'Tên Chi',summaryWordTemplate:source,summaryDocx:cache}));
 expect(mocks.load).toHaveBeenCalledWith(cache);expect(mocks.post).not.toHaveBeenCalled();
 await exportWordTemplate(mockMeeting({summary:'Tên Chi mới',summaryWordTemplate:source,summaryDocx:cache}));
 expect(mocks.post).toHaveBeenCalledTimes(1);
});
it('does not silently fall back to a restyled document on missing or invalid fill output',async()=>{
 await expect(exportWordTemplate(mockMeeting({summary:'Report'}))).rejects.toThrow('file mẫu Word gốc');
 mocks.post.mockResolvedValue({summary:'[]'});
 await expect(exportWordTemplate(mockMeeting({summary:'Report',summaryWordTemplate:source}))).rejects.toThrow('chưa điền');
 expect(mocks.save).not.toHaveBeenCalled();
});
it('still returns the generated Word document if saving the cache fails',async()=>{
 mocks.save.mockRejectedValue(new Error('offline'));
 expect(await exportWordTemplate(mockMeeting({summary:'Tên Chi',summaryWordTemplate:source}))).toBeInstanceOf(Blob);
});
