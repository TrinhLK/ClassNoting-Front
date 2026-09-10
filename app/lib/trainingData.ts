/**
 * EXPERIMENTAL: Training data collection feature.
 * Code kept for future fine-tuning. Not in active use.
 * Search "EXPERIMENTAL" to find related code.
 */
// app/lib/trainingData.ts
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, doc, setDoc, getDocs, query, orderBy } from "firebase/firestore";
import { storage, db } from "./firebase";
import type { Segment } from "./mockData";

const TRAINING_COLLECTION = "training_data";

// ====================================================
// TYPES
// ====================================================

export interface TrainingDataSample {
  id: string;
  source: "user_correction";
  language: string;
  created_at: number;

  audio_url: string;
  audio_format: "wav";
  duration_seconds: number;

  transcript: string;     // Ground truth (bản người dùng đã lưu)
  original_asr: string;   // Output thô của ASR trước khi sửa

  meeting_id: string;
  segment_id: string;
  start_time: number;
  end_time: number;
}

// ====================================================
// WAV ENCODER (thuần JS, không cần thư viện)
// ====================================================

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numFrames = buffer.length;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;

  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave samples: Float32 → Int16
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

// ====================================================
// AUDIO SLICER
// ====================================================

function sliceAudioBuffer(
  audioBuffer: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;

  const startSample = Math.floor(startSec * sampleRate);
  const endSample = Math.min(Math.ceil(endSec * sampleRate), audioBuffer.length);
  const frameCount = Math.max(endSample - startSample, 1);

  const ctx = new OfflineAudioContext(numChannels, frameCount, sampleRate);
  const sliced = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const srcData = audioBuffer.getChannelData(ch);
    const dstData = sliced.getChannelData(ch);
    for (let i = 0; i < frameCount; i++) {
      dstData[i] = srcData[startSample + i] ?? 0;
    }
  }

  return sliced;
}

// ====================================================
// FIREBASE STORAGE UPLOAD
// ====================================================

async function uploadTrainingAudio(blob: Blob, sampleId: string): Promise<string> {
  const storageRef = ref(storage, `training/${sampleId}.wav`);
  await uploadBytes(storageRef, blob, { contentType: "audio/wav" });
  return await getDownloadURL(storageRef);
}

// ====================================================
// FIRESTORE WRITER (root collection, không gắn user)
// ====================================================

export async function saveTrainingSamples(samples: TrainingDataSample[]): Promise<void> {
  const colRef = collection(db, TRAINING_COLLECTION);
  await Promise.all(
    samples.map((sample) => setDoc(doc(colRef, sample.id), sample))
  );
}

export async function getAllTrainingSamples(): Promise<TrainingDataSample[]> {
  try {
    const q = query(collection(db, TRAINING_COLLECTION), orderBy("created_at", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as TrainingDataSample);
  } catch (error) {
    console.error("[Training] Error fetching training samples:", error);
    return [];
  }
}


// ====================================================
// MAIN ORCHESTRATOR
// ====================================================

/**
 * Với mỗi segment:
 * 1. Cắt audio clip tương ứng (WAV, thuần JS)
 * 2. Upload lên Firebase Storage: training/{sampleId}.wav
 * 3. Lưu metadata vào Firestore: training_data/{sampleId}
 * 4. Trả về array TrainingDataSample đã hoàn chỉnh
 */
export async function collectAndUploadSamples(
  correctedSegments: Segment[],
  originalSegments: Segment[],
  audioSrc: string,
  language: string,
  meetingId: string
): Promise<TrainingDataSample[]> {

  // 1. Fetch audio
  let arrayBuffer: ArrayBuffer;
  try {
    // Nếu là blob: hoặc đường dẫn relative (demo data) thì fetch trực tiếp
    if (audioSrc.startsWith('blob:') || audioSrc.startsWith('/')) {
      const response = await fetch(audioSrc);
      if (!response.ok) throw new Error(`Direct fetch failed: ${response.statusText}`);
      arrayBuffer = await response.arrayBuffer();
    } else {
      // Fetch audio qua server proxy để bypass CORS cho Firebase Storage
      const proxyUrl = `/api/proxy-file?url=${encodeURIComponent(audioSrc)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`Proxy fetch failed: ${response.statusText}`);
      arrayBuffer = await response.arrayBuffer();
    }
  } catch (err) {
    console.error("[Training] Failed to fetch audio:", err);
    return [];
  }

  const audioCtx = new AudioContext();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const results: TrainingDataSample[] = [];

  for (const seg of correctedSegments) {
    try {
      if (!seg.text.trim()) continue;

      const originalSeg = originalSegments.find((s) => s.id === seg.id);

      // ID deterministic: meetingId + segmentId
      // → setDoc overwrite, không tích lũy duplicate mỗi lần Save
      const sampleId = `${meetingId}__${seg.id}`;

      const sliced = sliceAudioBuffer(audioBuffer, seg.start, seg.end);
      const wavBlob = audioBufferToWavBlob(sliced);
      const audioUrl = await uploadTrainingAudio(wavBlob, sampleId);

      results.push({
        id: sampleId,
        source: "user_correction",
        language,
        created_at: Date.now(),
        audio_url: audioUrl,
        audio_format: "wav",
        duration_seconds: parseFloat((seg.end - seg.start).toFixed(3)),
        transcript: seg.text.trim(),
        original_asr: (originalSeg?.text ?? seg.text).trim(),
        meeting_id: meetingId,
        segment_id: seg.id,
        start_time: seg.start,
        end_time: seg.end,
      });
    } catch (err) {
      console.warn(`[Training] Skipped segment ${seg.id}:`, err);
    }
  }

  await audioCtx.close();

  // Lưu metadata Firestore tập trung
  if (results.length > 0) {
    await saveTrainingSamples(results);
  }

  return results;
}
