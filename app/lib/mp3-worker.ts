import { Mp3Encoder } from "@breezystack/lamejs";

self.onmessage = ({ data }: MessageEvent<{ channels: Float32Array[]; sampleRate: number }>) => {
  try {
    const { channels, sampleRate } = data;
    const encoder = new Mp3Encoder(channels.length, sampleRate, 128);
    const chunks: Uint8Array[] = [];
    const length = channels[0].length;
    let reported = -1;
    for (let offset = 0; offset < length; offset += 1152) {
      const pcm = channels.map(channel => Int16Array.from(channel.subarray(offset, offset + 1152), value => {
        const sample = Math.max(-1, Math.min(1, value));
        return Math.round(sample * (sample < 0 ? 32768 : 32767));
      }));
      const chunk = encoder.encodeBuffer(pcm[0], pcm[1]);
      if (chunk.length) chunks.push(new Uint8Array(chunk));
      const progress = Math.floor(offset / length * 100);
      if (progress !== reported) { self.postMessage({ progress }); reported = progress; }
    }
    const tail = encoder.flush();
    if (tail.length) chunks.push(new Uint8Array(tail));
    const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    self.postMessage({ audio: result.buffer }, { transfer: [result.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Lỗi mã hóa MP3" });
  }
};
