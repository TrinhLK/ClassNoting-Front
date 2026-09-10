export const POLLING_INTERVAL_MS = 5000;
export const MAX_DRAFT_SIZE_MB = 1;
export const MAX_DRAFT_SIZE_BYTES = MAX_DRAFT_SIZE_MB * 1024 * 1024;
export const JOB_TIMEOUT_MS = 30 * 60 * 1000;
export const SEARCH_DEBOUNCE_MS = 300;

export const MEETING_STATUS = {
  DRAFT: 'draft',
  TRANSCRIBING: 'transcribing',
  TRANSCRIBED: 'transcribed',
  SUMMARIZING: 'summarizing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type MeetingStatus = typeof MEETING_STATUS[keyof typeof MEETING_STATUS];

export type ActionItemStatus = 'pending' | 'draft' | 'sent';

export const isFinalStatus = (s: MeetingStatus): boolean =>
  s === MEETING_STATUS.COMPLETED || s === MEETING_STATUS.FAILED;

export const isActiveStatus = (s: MeetingStatus): boolean =>
  s === MEETING_STATUS.TRANSCRIBING || s === MEETING_STATUS.SUMMARIZING;

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  [MEETING_STATUS.DRAFT]: 'Bản nháp',
  [MEETING_STATUS.TRANSCRIBING]: 'Đang xử lí',
  [MEETING_STATUS.TRANSCRIBED]: 'Đã ghi xong',
  [MEETING_STATUS.SUMMARIZING]: 'Đang tóm tắt',
  [MEETING_STATUS.COMPLETED]: 'Hoàn thành',
  [MEETING_STATUS.FAILED]: 'Lỗi',
};
