import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockMeeting } from "@/tests/helpers/fixtures";

const { saveAsMock, convertToMp3Mock } = vi.hoisted(() => ({
  saveAsMock: vi.fn(),
  convertToMp3Mock: vi.fn(),
}));

vi.mock("file-saver", () => ({ saveAs: saveAsMock }));
vi.mock("@/app/lib/converter", () => ({ convertToMp3: convertToMp3Mock }));

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
    convertToMp3Mock.mockReset();
    convertToMp3Mock.mockImplementation(async () =>
      new File(["mp3-data"], "converted.mp3", { type: "audio/mpeg" })
    );
    vi.restoreAllMocks();
  });

  it("tải audio draft từ blob URL, chuyển MP3 rồi lưu", async () => {
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
    expect(convertToMp3Mock).toHaveBeenCalledTimes(1);
    expect(saveAsMock).toHaveBeenCalledWith(expect.any(Blob), `${meeting.title}.mp3`);
    expect(toast.success).toHaveBeenCalledWith("Đã tải audio MP3");
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

  it("lưu nguyên byte WebM khi bộ mã hóa MP3 báo lỗi", async () => {
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } })
    );
    convertToMp3Mock.mockRejectedValueOnce(new Error("encoder unavailable"));
    const toast = makeToast();
    const meeting = mockMeeting({ title: "Họp 9/11" });
    const { result } = renderHook(() => useExport(meeting, toast, "blob:recording"));

    await act(() => result.current.downloadAudio());

    expect(saveAsMock).toHaveBeenCalledTimes(1);
    const [saved, filename] = saveAsMock.mock.calls[0];
    expect(filename).toBe("Họp 9_11.webm");
    expect(new Uint8Array(await saved.arrayBuffer())).toEqual(bytes);
    expect(toast.error).not.toHaveBeenCalled();
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
    expect(toast.success).toHaveBeenCalledWith("Đã tải audio MP3");
  });
});
