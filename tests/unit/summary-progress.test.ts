import {describe,expect,it,vi,beforeEach} from 'vitest';
import {summaryProgressView, type SummaryProgress} from '@/app/lib/summary-progress';
import {memoryFirestore} from '@/tests/helpers/admin-firestore';
const state=vi.hoisted(()=>({store:new Map<string,any>(),db:null as any}));
vi.mock('@/app/lib/firebase-admin',()=>({getAdminDb:()=>state.db}));
import {updateSummaryStage} from '@/app/lib/summary-progress-server';
const progress:SummaryProgress={operationId:'current',stage:'preparing',startedAt:1000,updatedAt:1000};
beforeEach(()=>{state.store.clear();state.db=memoryFirestore(state.store);});
describe('summary process progress',()=>{
 it('counts completed process steps, without inventing provider generation percentages',()=>{
  expect(summaryProgressView(progress,'summarizing',2000)).toMatchObject({percent:0,completedSteps:0});
  expect(summaryProgressView({...progress,stage:'generating'},'summarizing',2000)).toMatchObject({percent:33,completedSteps:1,label:'Đang chờ AI tạo biên bản'});
  expect(summaryProgressView({...progress,stage:'saving'},'summarizing',2000)).toMatchObject({percent:66,completedSteps:2});
  expect(summaryProgressView({...progress,stage:'completed'},'completed',900000)).toMatchObject({percent:100,completedSteps:3,needsAttention:false});
 });
 it('shows interrupted work instead of leaving a fake active percentage indefinitely',()=>{
  expect(summaryProgressView(progress,'summarizing',500000)).toMatchObject({needsAttention:true,indeterminate:true});
  expect(summaryProgressView(undefined,'completed')).toBeNull();
  expect(summaryProgressView(undefined,'summarizing')).toMatchObject({indeterminate:true});
 });
 it('updates only the current operation belonging to the authenticated owner',async()=>{
  state.store.set('meetings/m',{userId:'alice',summaryProgress:progress,summary:'Keep report'});
  await updateSummaryStage('m','bob','current','failed');
  await updateSummaryStage('m','alice','old','failed');
  expect(state.store.get('meetings/m').summaryProgress.stage).toBe('preparing');
  await updateSummaryStage('m','alice','current','generating');
  expect(state.store.get('meetings/m')).toMatchObject({summary:'Keep report',summaryProgress:{stage:'generating',startedAt:1000,operationId:'current'}});
 });
});
