import {beforeEach,expect,it,vi} from 'vitest';
import {mockMeeting} from '@/tests/helpers/fixtures';
const mocks=vi.hoisted(()=>({get:vi.fn(),update:vi.fn()}));
vi.mock('@/app/lib/firebase-admin',()=>({getAdminDb:()=>({collection:()=>({doc:()=>({})}),runTransaction:async (fn:any)=>fn({get:mocks.get,update:mocks.update})}),getAdminStorage:vi.fn()}));
vi.mock('@/app/lib/meeting-content',()=>({loadMeetingContent:vi.fn(),saveMeetingContent:vi.fn()}));
import {pollRefinement} from '@/app/lib/refinement';
const meeting=mockMeeting({refinement:{status:'running',jobId:'old-job'},summary:'Report to retain'});
beforeEach(()=>{
 vi.clearAllMocks();process.env.RUNPOD_API_KEY='test-key';process.env.RUNPOD_ENDPOINT_ID='test-endpoint';
 mocks.get.mockResolvedValue({data:()=>meeting});
});
it('closes a missing upstream job without changing transcript, audio or summary',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:404})));
 await pollRefinement(meeting);
 expect(mocks.update).toHaveBeenCalledWith(expect.anything(),{refinement:{status:'failed',jobId:'old-job',error:'ASR HTTP 404'}});
});
it('does not close a concurrently restarted job',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:404})));
 mocks.get.mockResolvedValue({data:()=>({...meeting,refinement:{status:'queued',jobId:'new-job'}})});
 await pollRefinement(meeting);expect(mocks.update).not.toHaveBeenCalled();
});
it('leaves transient upstream failures retryable instead of marking the job permanently failed',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
 await expect(pollRefinement(meeting)).rejects.toThrow('ASR HTTP 503');
 expect(mocks.update).not.toHaveBeenCalled();
});
