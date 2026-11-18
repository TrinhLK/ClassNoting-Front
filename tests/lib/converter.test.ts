import { beforeEach, expect, it, vi } from "vitest";
import { convertToMp3 } from "@/app/lib/converter";

const close = vi.fn(async () => {});
const terminate = vi.fn();
const decode = vi.fn();
let response: { audio?: ArrayBuffer; error?: string };
beforeEach(() => {
  vi.clearAllMocks();
  response = { audio: new Uint8Array([0xff, 0xfb, 0x90, 0]).buffer };
  decode.mockResolvedValue({ length: 3, sampleRate: 44100, numberOfChannels: 1, getChannelData: () => new Float32Array([0, .5, -.5]) });
  vi.stubGlobal("AudioContext", class { decodeAudioData = decode; close = close; });
  vi.stubGlobal("Worker", class {
    onmessage?: (e: { data: unknown }) => void;
    onerror?: () => void;
    terminate = terminate;
    postMessage() { queueMicrotask(() => { this.onmessage?.({ data: { progress: 50 } }); this.onmessage?.({ data: response }); }); }
  });
});
it("returns an actual MP3 payload with the correct MIME type and reports progress", async () => {
  const progress = vi.fn();
  const file = await convertToMp3(new File(["webm"], "meeting.webm"), progress);
  expect(file.name).toBe("meeting.mp3");
  expect(file.type).toBe("audio/mpeg");
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array(response.audio!));
  expect(progress).toHaveBeenCalledWith(50);
  expect(close).toHaveBeenCalledOnce();
  expect(terminate).toHaveBeenCalledOnce();
});
it("propagates encoding failures and always terminates the worker", async () => {
  response = { error: "Encoding failed" };
  await expect(convertToMp3(new File(["audio"], "test.webm"))).rejects.toThrow("Encoding failed");
  expect(terminate).toHaveBeenCalledOnce();
});
it("closes the decoder when the source is corrupt", async () => {
  decode.mockRejectedValueOnce(new Error("Invalid audio"));
  await expect(convertToMp3(new File(["bad"], "test.webm"))).rejects.toThrow("Invalid audio");
  expect(close).toHaveBeenCalledOnce();
});
