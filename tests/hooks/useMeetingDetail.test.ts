import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { mockMeeting, mockSegment, mockSpeaker } from "@/tests/helpers/fixtures";

const generateMeetingShareTokenMock = vi.fn(async () => "share-token-xyz");

vi.mock("@/app/lib/db", () => ({
  generateMeetingShareToken: (...args: unknown[]) => generateMeetingShareTokenMock(...args),
}));

import { useMeetingDetail } from "@/app/hooks/useMeetingDetail";
import type { MeetingTemplate } from "@/app/lib/templates";

describe("useMeetingDetail — share + summarize hook", () => {
  beforeEach(() => {
    generateMeetingShareTokenMock.mockReset();
    generateMeetingShareTokenMock.mockResolvedValue("share-token-xyz");
  });

  it("khởi tạo state từ initialMeeting", () => {
    const meeting = mockMeeting({ title: "Test Meeting" });
    const { result } = renderHook(() => useMeetingDetail(meeting));

    expect(result.current.meeting.title).toBe("Test Meeting");
    expect(result.current.activeTab).toBe("transcript");
    expect(result.current.showTemplateModal).toBe(false);
    expect(result.current.filteredSpeakerId).toBeNull();
  });

  describe("handleShare", () => {
    it("copy share URL với shareToken đã có sẵn", async () => {
      const writeTextMock = vi.fn(async () => "");
      const clipboardSpy = vi
        .spyOn(navigator, "clipboard", "get")
        .mockReturnValue({ writeText: writeTextMock } as any);

      const meeting = mockMeeting({ shareToken: "existing-token" });
      const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };

      const { result } = renderHook(() => useMeetingDetail(meeting, undefined, undefined, toast));

      await act(async () => {
        await result.current.handleShare();
      });

      expect(generateMeetingShareTokenMock).not.toHaveBeenCalled();
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining("/share/existing-token")
      );
      expect(toast.success).toHaveBeenCalled();

      clipboardSpy.mockRestore();
    });

    it("generate shareToken mới khi chưa có", async () => {
      const writeTextMock = vi.fn(async () => "");
      const clipboardSpy = vi
        .spyOn(navigator, "clipboard", "get")
        .mockReturnValue({ writeText: writeTextMock } as any);

      const meeting = mockMeeting({ shareToken: undefined });
      const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };

      const { result } = renderHook(() => useMeetingDetail(meeting, undefined, undefined, toast));

      await act(async () => {
        await result.current.handleShare();
      });

      expect(generateMeetingShareTokenMock).toHaveBeenCalledWith(meeting.id);
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining("/share/share-token-xyz")
      );

      clipboardSpy.mockRestore();
    });

    it("fallback dùng meeting.id khi generateShareToken fail", async () => {
      generateMeetingShareTokenMock.mockRejectedValueOnce(new Error("DB down"));

      const writeTextMock = vi.fn(async () => "");
      const clipboardSpy = vi
        .spyOn(navigator, "clipboard", "get")
        .mockReturnValue({ writeText: writeTextMock } as any);

      const meeting = mockMeeting({ id: "fallback-id", shareToken: undefined });
      const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { result } = renderHook(() => useMeetingDetail(meeting, undefined, undefined, toast));

      await act(async () => {
        await result.current.handleShare();
      });

      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining("/share/fallback-id")
      );
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      clipboardSpy.mockRestore();
    });

    it("hoạt động khi không có toast callback", async () => {
      const writeTextMock = vi.fn(async () => "");
      const clipboardSpy = vi
        .spyOn(navigator, "clipboard", "get")
        .mockReturnValue({ writeText: writeTextMock } as any);

      const meeting = mockMeeting();
      const { result } = renderHook(() => useMeetingDetail(meeting));

      await act(async () => {
        await result.current.handleShare();
      });

      expect(writeTextMock).toHaveBeenCalled();
      clipboardSpy.mockRestore();
    });
  });

  describe("handleSummarizeRequest", () => {
    const template: MeetingTemplate = {
      id: "tpl_1",
      name: "Mẫu tóm tắt chuẩn",
      structure: "## Tổng quan\n## Kết luận",
      isDefault: false,
    };

    it("không gọi onSummarize khi callback không được truyền", () => {
      const meeting = mockMeeting();
      const { result } = renderHook(() => useMeetingDetail(meeting));

      act(() => {
        result.current.handleSummarizeRequest(template);
      });

      expect(result.current.showTemplateModal).toBe(false);
    });

    it("build fullText đúng format [mm:ss] [name]: text, phân cách bằng \\n", () => {
      const meeting = mockMeeting({
        segments: [
          mockSegment({ speakerId: "SPEAKER_00", start: 0, text: "Xin chào" }),
          mockSegment({ speakerId: "SPEAKER_01", start: 75, text: "Tôi khỏe" }),
        ],
        speakers: [
          mockSpeaker({ id: "SPEAKER_00", name: "An" }),
          mockSpeaker({ id: "SPEAKER_01", name: "Bình" }),
        ],
      });

      const onSummarize = vi.fn();
      const { result } = renderHook(() => useMeetingDetail(meeting, onSummarize));

      act(() => {
        result.current.handleSummarizeRequest(template);
      });

      const [calledMeeting, fullText] = onSummarize.mock.calls[0];
      expect(calledMeeting.id).toBe(meeting.id);
      expect(fullText).toBe("[00:00] [An]: Xin chào\n[01:15] [Bình]: Tôi khỏe");
    });

    it("fullText phải chứa [mm:ss] ở đầu mỗi dòng — AI phụ thuộc vào đây để chèn timestamp", () => {
      const meeting = mockMeeting({
        segments: [
          mockSegment({ start: 0, text: "A" }),
          mockSegment({ start: 30, text: "B" }),
          mockSegment({ start: 125, text: "C" }),
        ],
      });

      const onSummarize = vi.fn();
      const { result } = renderHook(() => useMeetingDetail(meeting, onSummarize));

      act(() => {
        result.current.handleSummarizeRequest(template);
      });

      const [, fullText] = onSummarize.mock.calls[0];
      expect(fullText).toMatch(/^\[00:00\] /);
      expect(fullText).toMatch(/\n\[00:30\] /);
      expect(fullText).toMatch(/\n\[02:05\] /);
    });

    it("fallback 'Speaker XX' khi speaker không tìm thấy trong speakers", () => {
      const meeting = mockMeeting({
        segments: [mockSegment({ speakerId: "SPEAKER_05", start: 42, text: "Hello" })],
        speakers: [],
      });

      const onSummarize = vi.fn();
      const { result } = renderHook(() => useMeetingDetail(meeting, onSummarize));

      act(() => {
        result.current.handleSummarizeRequest(template);
      });

      const [, fullText] = onSummarize.mock.calls[0];
      expect(fullText).toBe("[00:42] [Speaker 05]: Hello");
    });

    it("fallback 'Speaker {split_part}' khi speakerId không có format SPEAKER_XX", () => {
      const meeting = mockMeeting({
        segments: [mockSegment({ speakerId: "unknown_id", start: 0, text: "Hi" })],
        speakers: [],
      });

      const onSummarize = vi.fn();
      const { result } = renderHook(() => useMeetingDetail(meeting, onSummarize));

      act(() => {
        result.current.handleSummarizeRequest(template);
      });

      const [, fullText] = onSummarize.mock.calls[0];
      expect(fullText).toBe("[00:00] [Speaker id]: Hi");
    });

    it("truyền template.structure cho onSummarize", () => {
      const meeting = mockMeeting();
      const onSummarize = vi.fn();
      const { result } = renderHook(() => useMeetingDetail(meeting, onSummarize));

      act(() => {
        result.current.handleSummarizeRequest(template);
      });

      expect(onSummarize.mock.calls[0][2]).toBe(template.structure);
    });

    it("đóng template modal và gọi onBack sau summarize", () => {
      const meeting = mockMeeting();
      const onSummarize = vi.fn();
      const onBack = vi.fn();
      const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };

      const { result } = renderHook(() =>
        useMeetingDetail(meeting, onSummarize, onBack, toast)
      );

      act(() => {
        result.current.setShowTemplateModal(true);
      });
      expect(result.current.showTemplateModal).toBe(true);

      act(() => {
        result.current.handleSummarizeRequest(template);
      });

      expect(result.current.showTemplateModal).toBe(false);
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(toast.info).toHaveBeenCalled();
    });
  });
});