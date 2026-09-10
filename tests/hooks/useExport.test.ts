import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockMeeting } from "@/tests/helpers/fixtures";

const { saveAsMock } = vi.hoisted(() => ({ saveAsMock: vi.fn() }));

vi.mock("file-saver", () => ({ saveAs: saveAsMock }));

import { useExport } from "@/app/hooks/useExport";

const makeToast = () => ({
  success: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(() => "toast-id"),
  dismiss: vi.fn(),
});

describe("useExport downloadAudio", () => {
  beforeEach(() => {
    saveAsMock.mockReset();
    vi.restoreAllMocks();
  });

  it("tải audio draft trực tiếp từ blob URL", async () => {
    const audioBlob = new Blob(["audio-data"], { type: "audio/webm" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(audioBlob, { status: 200 })
    );
    const toast = makeToast();
    const meeting = mockMeeting({ audioUrl: undefined });
    const { result } = renderHook(() => useExport(meeting, toast, "blob:draft-audio"));

    await act(async () => {
      await result.current.downloadAudio();
    });

    expect(fetchMock).toHaveBeenCalledWith("blob:draft-audio");
    expect(saveAsMock).toHaveBeenCalledWith(expect.any(Blob), `${meeting.title}.webm`);
    expect(toast.success).toHaveBeenCalledWith("Đã tải audio");
  });

  it("từ chối lưu audio rỗng", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob([], { type: "audio/webm" }), { status: 200 })
    );
    const toast = makeToast();
    const meeting = mockMeeting({ audioUrl: undefined });
    const { result } = renderHook(() => useExport(meeting, toast, "blob:empty-audio"));

    await act(async () => {
      await result.current.downloadAudio();
    });

    expect(saveAsMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Lỗi khi tải audio");
  });

  it("tiếp tục dùng proxy cho audio cloud", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob(["audio-data"], { type: "audio/mpeg" }), { status: 200 })
    );
    const toast = makeToast();
    const meeting = mockMeeting({ audioUrl: "https://storage.example/audio.mp3" });
    const { result } = renderHook(() => useExport(meeting, toast));

    await act(async () => {
      await result.current.downloadAudio();
    });

    expect(fetch).toHaveBeenCalledWith(
      `/api/proxy-file?url=${encodeURIComponent(meeting.audioUrl!)}`
    );
    expect(saveAsMock).toHaveBeenCalledWith(expect.any(Blob), `${meeting.title}.mp3`);
  });
});
