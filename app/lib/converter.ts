/** Decode with the browser and encode locally in a dedicated worker. */
export async function convertToMp3(file: File, onProgress?: (progress: number) => void): Promise<File> {
  const context = new AudioContext({ sampleRate: 44100 });
  let audio: AudioBuffer;
  try {
    audio = await context.decodeAudioData(await file.arrayBuffer());
  } finally {
    await context.close();
  }
  if (!audio.length) throw new Error("File âm thanh rỗng");
  const worker = new Worker(new URL("./mp3-worker.ts", import.meta.url), { type: "module" });
  try {
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      worker.onerror = () => reject(new Error("Không thể khởi động bộ mã hóa MP3"));
      worker.onmessage = ({ data }) => {
        if (data.error) reject(new Error(data.error));
        else if (data.audio) resolve(data.audio);
        else if (typeof data.progress === "number") onProgress?.(data.progress);
      };
      const channels = Array.from({ length: Math.min(audio.numberOfChannels, 2) }, (_, i) => audio.getChannelData(i).slice());
      worker.postMessage({ channels, sampleRate: audio.sampleRate }, channels.map(channel => channel.buffer));
    });
    if (!bytes.byteLength) throw new Error("Bộ mã hóa trả audio rỗng");
    return new File([bytes], file.name.replace(/\.[^/.]+$/, "") + ".mp3", { type: "audio/mpeg" });
  } finally {
    worker.terminate();
  }
}
