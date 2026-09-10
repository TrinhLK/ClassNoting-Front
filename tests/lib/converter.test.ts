import { describe, it, expect, vi, beforeEach } from "vitest";

let writeFileMock = vi.fn(async () => {});
let readFileMock = vi.fn(async () => new Uint8Array([1, 2, 3, 4]));
let execMock = vi.fn(async () => {});
let deleteFileMock = vi.fn(async () => {});
let loadMock = vi.fn(async () => {});
let onMock = vi.fn();

const makeInstance = () => ({
  writeFile: writeFileMock,
  readFile: readFileMock,
  exec: execMock,
  deleteFile: deleteFileMock,
  load: loadMock,
  on: onMock,
});

vi.mock("@ffmpeg/ffmpeg", () => {
  return {
    FFmpeg: class MockFFmpeg {
      writeFile = writeFileMock;
      readFile = readFileMock;
      exec = execMock;
      deleteFile = deleteFileMock;
      load = loadMock;
      on = onMock;
    },
  };
});

vi.mock("@ffmpeg/util", () => ({
  fetchFile: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
  toBlobURL: vi.fn(async (url: string) => url),
}));

beforeEach(() => {
  writeFileMock = vi.fn(async () => {});
  readFileMock = vi.fn(async () => new Uint8Array([1, 2, 3, 4]));
  execMock = vi.fn(async () => {});
  deleteFileMock = vi.fn(async () => {});
  loadMock = vi.fn(async () => {});
  onMock = vi.fn();

  vi.resetModules();
});

describe("loadFFmpeg — singleton pattern", () => {
  it("chỉ load 1 lần (singleton)", async () => {
    const { loadFFmpeg } = await import("@/app/lib/converter");
    await loadFFmpeg();
    await loadFFmpeg();
    await loadFFmpeg();

    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it("load từ unpkg CDN @0.12.6", async () => {
    const { loadFFmpeg } = await import("@/app/lib/converter");
    await loadFFmpeg();

    const [config] = loadMock.mock.calls[0];
    expect(config.coreURL).toContain("@ffmpeg/core@0.12.6");
    expect(config.coreURL).toContain("ffmpeg-core.js");
    expect(config.wasmURL).toContain("ffmpeg-core.wasm");
  });
});

describe("convertToMp3 — convert audio sang MP3", () => {
  it("gọi writeFile với input filename đúng extension", async () => {
    const { convertToMp3 } = await import("@/app/lib/converter");

    const fakeFile = new File(["audio data"], "recording.wav", { type: "audio/wav" });
    await convertToMp3(fakeFile);

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [inputName] = writeFileMock.mock.calls[0];
    expect(inputName).toBe("input.wav");
  });

  it("xử lý nhiều extension (.mp3, .wav, .m4a, .webm)", async () => {
    const { convertToMp3 } = await import("@/app/lib/converter");

    for (const ext of ["mp3", "wav", "m4a", "webm"]) {
      writeFileMock.mockClear();
      const file = new File(["x"], `audio.${ext}`, { type: `audio/${ext}` });
      await convertToMp3(file);
      expect(writeFileMock.mock.calls[0][0]).toBe(`input.${ext}`);
    }
  });

  it("xử lý filename không có extension (split('.') trả nguyên tên)", async () => {
    const { convertToMp3 } = await import("@/app/lib/converter");

    const file = new File(["x"], "recording", { type: "audio/mp4" });
    await convertToMp3(file);

    expect(writeFileMock.mock.calls[0][0]).toBe("input.recording");
  });

  it("exec với command MP3 (libmp3lame, q:a 2)", async () => {
    const { convertToMp3 } = await import("@/app/lib/converter");

    const file = new File(["x"], "audio.wav", { type: "audio/wav" });
    await convertToMp3(file);

    expect(execMock).toHaveBeenCalledTimes(1);
    const args = execMock.mock.calls[0][0];
    expect(args).toEqual([
      "-i",
      "input.wav",
      "-vn",
      "-acodec",
      "libmp3lame",
      "-q:a",
      "2",
      "output.mp3",
    ]);
  });

  it("throw nếu exec fail", async () => {
    const { convertToMp3 } = await import("@/app/lib/converter");

    execMock.mockRejectedValueOnce(new Error("Encoder not supported"));

    const file = new File(["x"], "audio.wav", { type: "audio/wav" });
    await expect(convertToMp3(file)).rejects.toThrow("Encoder not supported");
  });

  it("cleanup input + output files sau khi xong", async () => {
    const { convertToMp3 } = await import("@/app/lib/converter");

    const file = new File(["x"], "audio.wav", { type: "audio/wav" });
    await convertToMp3(file);

    expect(deleteFileMock).toHaveBeenCalledWith("input.wav");
    expect(deleteFileMock).toHaveBeenCalledWith("output.mp3");
    expect(deleteFileMock).toHaveBeenCalledTimes(2);
  });

  it("cleanup ngay cả khi exec fail (không leak file)", async () => {
    const { convertToMp3 } = await import("@/app/lib/converter");

    execMock.mockRejectedValueOnce(new Error("Fail"));

    const file = new File(["x"], "audio.wav", { type: "audio/wav" });

    await expect(convertToMp3(file)).rejects.toThrow();
    expect(deleteFileMock).toHaveBeenCalledWith("input.wav");
    expect(deleteFileMock).toHaveBeenCalledWith("output.mp3");
    expect(deleteFileMock).toHaveBeenCalledTimes(2);
  });

  it("cleanup vẫn chạy khi readFile throw (sau exec success)", async () => {
    const { convertToMp3 } = await import("@/app/lib/converter");

    readFileMock.mockRejectedValueOnce(new Error("Read fail"));

    const file = new File(["x"], "audio.wav", { type: "audio/wav" });

    await expect(convertToMp3(file)).rejects.toThrow("Read fail");
    expect(deleteFileMock).toHaveBeenCalledTimes(2);
  });

  it("trả File với tên gốc + .mp3, type audio/mp3", async () => {
    const { convertToMp3 } = await import("@/app/lib/converter");

    const file = new File(["x"], "my-recording.wav", { type: "audio/wav" });
    const result = await convertToMp3(file);

    expect(result).toBeInstanceOf(File);
    expect(result.name).toBe("my-recording.mp3");
    expect(result.type).toBe("audio/mp3");
  });

  it("callback onProgress được register", async () => {
    const { convertToMp3 } = await import("@/app/lib/converter");

    const onProgress = vi.fn();
    const file = new File(["x"], "audio.wav", { type: "audio/wav" });
    await convertToMp3(file, onProgress);

    expect(onMock).toHaveBeenCalledWith("progress", expect.any(Function));
  });

  it("không gọi on khi không có onProgress callback", async () => {
    const { convertToMp3 } = await import("@/app/lib/converter");

    onMock.mockClear();
    const file = new File(["x"], "audio.wav", { type: "audio/wav" });
    await convertToMp3(file);

    const progressCalls = onMock.mock.calls.filter((c) => c[0] === "progress");
    expect(progressCalls).toHaveLength(0);
  });
});