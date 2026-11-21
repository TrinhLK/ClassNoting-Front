import {act,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import SummaryProgress from '@/app/components/Meeting/SummaryProgress';
import {mockMeeting} from '@/tests/helpers/fixtures';
afterEach(()=>{vi.useRealTimers();});
it('shows template, elapsed time, honest stage percent and timeout recovery',()=>{
 vi.useFakeTimers();vi.setSystemTime(1000);
 render(<SummaryProgress meeting={mockMeeting({status:'summarizing',summaryProgress:{operationId:'op',stage:'generating',startedAt:1000,updatedAt:1000,templateName:'Hội thảo'}})} />);
 expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('33');
 expect(screen.getByText('Mẫu: Hội thảo')).toBeTruthy();
 expect(screen.getByText(/AI không cung cấp/)).toBeTruthy();
 act(()=>vi.advanceTimersByTime(30000));
 expect(screen.getByText('Đã chạy 0:30')).toBeTruthy();
 act(()=>vi.advanceTimersByTime(7*60000));
 expect(screen.getByRole('status').textContent).toContain('Quá thời gian chờ');
 expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
});
it('shows 100 percent only after saving is confirmed complete',()=>{
 render(<SummaryProgress meeting={mockMeeting({status:'completed',summaryProgress:{operationId:'op',stage:'completed',startedAt:1000,updatedAt:2000}})} />);
 expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
});
