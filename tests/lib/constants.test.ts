import { describe, it, expect } from "vitest";
import {
  MEETING_STATUS,
  isFinalStatus,
  isActiveStatus,
  MEETING_STATUS_LABELS,
  type MeetingStatus,
  POLLING_INTERVAL_MS,
  MAX_DRAFT_SIZE_MB,
  MAX_DRAFT_SIZE_BYTES,
  JOB_TIMEOUT_MS,
  SEARCH_DEBOUNCE_MS,
} from "@/app/lib/constants";

describe("MEETING_STATUS enum — backward compatible (Phase 3D)", () => {
  it("giữ giá trị lowercase để không phá schema Firestore", () => {
    expect(MEETING_STATUS.DRAFT).toBe("draft");
    expect(MEETING_STATUS.TRANSCRIBING).toBe("transcribing");
    expect(MEETING_STATUS.TRANSCRIBED).toBe("transcribed");
    expect(MEETING_STATUS.SUMMARIZING).toBe("summarizing");
    expect(MEETING_STATUS.COMPLETED).toBe("completed");
    expect(MEETING_STATUS.FAILED).toBe("failed");
  });

  it("có đủ 6 status theo REFACTOR_PLAN", () => {
    expect(Object.keys(MEETING_STATUS)).toHaveLength(6);
  });

  it("Object.keys trùng với values.length (6 status)", () => {
    expect(Object.keys(MEETING_STATUS)).toHaveLength(6);
    expect(Object.values(MEETING_STATUS)).toHaveLength(6);
  });
});

describe("isFinalStatus — kiểm tra meeting đã kết thúc", () => {
  it("true cho COMPLETED và FAILED", () => {
    expect(isFinalStatus(MEETING_STATUS.COMPLETED)).toBe(true);
    expect(isFinalStatus(MEETING_STATUS.FAILED)).toBe(true);
  });

  it("false cho các status khác", () => {
    expect(isFinalStatus(MEETING_STATUS.DRAFT)).toBe(false);
    expect(isFinalStatus(MEETING_STATUS.TRANSCRIBING)).toBe(false);
    expect(isFinalStatus(MEETING_STATUS.TRANSCRIBED)).toBe(false);
    expect(isFinalStatus(MEETING_STATUS.SUMMARIZING)).toBe(false);
  });
});

describe("isActiveStatus — kiểm tra meeting đang xử lý", () => {
  it("true cho TRANSCRIBING và SUMMARIZING", () => {
    expect(isActiveStatus(MEETING_STATUS.TRANSCRIBING)).toBe(true);
    expect(isActiveStatus(MEETING_STATUS.SUMMARIZING)).toBe(true);
  });

  it("false cho các status khác", () => {
    expect(isActiveStatus(MEETING_STATUS.DRAFT)).toBe(false);
    expect(isActiveStatus(MEETING_STATUS.TRANSCRIBED)).toBe(false);
    expect(isActiveStatus(MEETING_STATUS.COMPLETED)).toBe(false);
    expect(isActiveStatus(MEETING_STATUS.FAILED)).toBe(false);
  });
});

describe("MEETING_STATUS_LABELS — label tiếng Việt", () => {
  it("có label cho tất cả 6 status", () => {
    const allStatuses: MeetingStatus[] = [
      MEETING_STATUS.DRAFT,
      MEETING_STATUS.TRANSCRIBING,
      MEETING_STATUS.TRANSCRIBED,
      MEETING_STATUS.SUMMARIZING,
      MEETING_STATUS.COMPLETED,
      MEETING_STATUS.FAILED,
    ];
    for (const s of allStatuses) {
      expect(MEETING_STATUS_LABELS[s]).toBeTruthy();
      expect(MEETING_STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it("label không chứa key uppercase", () => {
    expect(MEETING_STATUS_LABELS[MEETING_STATUS.DRAFT]).not.toMatch(
      /^DRAFT/
    );
    expect(MEETING_STATUS_LABELS[MEETING_STATUS.TRANSCRIBING]).not.toMatch(
      /^TRANSCRIBING/
    );
  });
});

describe("Constants — giá trị số", () => {
  it("POLLING_INTERVAL_MS = 5000 (5 giây)", () => {
    expect(POLLING_INTERVAL_MS).toBe(5000);
  });

  it("MAX_DRAFT_SIZE_MB = 1 (giới hạn Firestore 1MB)", () => {
    expect(MAX_DRAFT_SIZE_MB).toBe(1);
  });

  it("MAX_DRAFT_SIZE_BYTES = 1MB tính bằng bytes", () => {
    expect(MAX_DRAFT_SIZE_BYTES).toBe(1024 * 1024);
    expect(MAX_DRAFT_SIZE_BYTES).toBe(MAX_DRAFT_SIZE_MB * 1024 * 1024);
  });

  it("JOB_TIMEOUT_MS = 30 phút (1800000 ms)", () => {
    expect(JOB_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it("SEARCH_DEBOUNCE_MS = 300 (300ms — UX chuẩn)", () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
  });
});