import { useState, useRef, useEffect } from "react";
import { Word } from "../lib/mockData";
import { formatTranscriptText, formatWords } from "../lib/utils";

// HÀM NỐI CHUỖI THÔNG MINH (CHỐNG LẶP) - COPY TỪ CODE CŨ CỦA BẠN
const mergeText = (prev: string, next: string) => {
    const p = prev.trim();
    const n = next.trim();
    if (!p) return n;
    if (!n) return p;
    if (n.startsWith(p)) return n;
    const overlapMax = Math.min(p.length, n.length, 20);
    for (let i = overlapMax; i > 0; i--) {
        const suffix = p.slice(-i);
        const prefix = n.slice(0, i);
        if (suffix === prefix) return p + n.slice(i);
    }
    if (/^[.,!?;:]/.test(n)) return p + n;
    return p + " " + n;
};

// AUDIO HELPER: Downsample & Convert to Int16
const downsampleBuffer = (buffer: Float32Array, inputSampleRate: number, outputSampleRate: number) => {
    if (outputSampleRate === inputSampleRate) return convertFloat32ToInt16(buffer);
    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Int16Array(newLength);
    let offsetResult = 0, offsetBuffer = 0;
    while (offsetResult < result.length) {
        const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
        let accum = 0, count = 0;
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }
        result[offsetResult] = Math.max(-1, Math.min(1, count > 0 ? accum / count : 0)) * 32768;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }
    return result;
};
const convertFloat32ToInt16 = (buffer: Float32Array) => {
    let l = buffer.length;
    const buf = new Int16Array(l);
    while (l--) buf[l] = Math.min(1, buffer[l]) * 0x7FFF;
    return buf;
};

export type TranscriptSegment = {
    speaker: number;
    content: string;
    isFinal: boolean;
    words?: Word[];
};

export default function useLocalTranscription(
    onFinal?: (data: any) => void
) {
    const serverUrl = process.env.NEXT_PUBLIC_REALTIME_PROCESSING_SERVER || "wss://realtime-processing-server.io.vn";
    // const serverUrl = "ws://localhost:6006";`
    // --- STATE ---
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);
    const [interimContent, setInterimContent] = useState<string>("");
    const [isListening, setIsListening] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);

    // --- REFS ---
    const socketRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const offsetTimeRef = useRef(0);
    const lastEndTimestampRef = useRef<number>(0);

    const serverStartOffsetRef = useRef<number | null>(null);
    // -----------------------------------------------------

    const startListening = async (rawStream: MediaStream, startTimeOffset: number = 0, language: string = "vi") => {
        // 1. CẬP NHẬT THỜI GIAN
        offsetTimeRef.current = startTimeOffset;
        setIsListening(true);
        serverStartOffsetRef.current = null;

        if (startTimeOffset === 0) {
            lastEndTimestampRef.current = 0;
        }

        // 2. SETUP WEBSOCKET
        const finalUrl = `${serverUrl}/?language=${language}`;
        const ws = new WebSocket(finalUrl);
        socketRef.current = ws;

        ws.onopen = () => { setConnectionError(null); };
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerResponse(data);
            } catch (e) { console.error("Parse error:", e); }
        };
        ws.onerror = () => {
            setConnectionError("Không thể kết nối đến server xử lý giọng nói. Kiểm tra lại kết nối mạng.");
        };

        // 3. AUDIO PROCESSING (Raw Int16 16kHz)
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(rawStream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        source.connect(processor);
        processor.connect(audioContext.destination);

        processor.onaudioprocess = (e) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = downsampleBuffer(inputData, audioContext.sampleRate, 16000);
            ws.send(pcmData.buffer);
        };
        streamRef.current = rawStream;
    };

    const handleServerResponse = (data: any) => {
        // Server sẽ gửi { ..., "is_final": false } cho text xám
        // và { ..., "is_final": true } cho text chốt.
        const isFinalPacket = data.is_final;

        if (data.channel && data.channel.alternatives?.[0]) {
            const alt = data.channel.alternatives[0];

            // import { formatTranscriptText } from "../lib/utils"; (Sẽ được auto-import hoặc thêm ở đầu file)
            // Lưu ý: Cần thêm import thủ công nếu tool không tự làm.
            const rawTranscript = alt.transcript;
            if (!rawTranscript) return;

            // Xử lý format
            const transcript = formatTranscriptText(rawTranscript);

            // --- TRƯỜNG HỢP 1: KẾT QUẢ TẠM (Interim / Màu xám) ---
            if (!isFinalPacket) {
                // Chỉ cập nhật state tạm để UI hiển thị text xám (nhảy liên tục)
                setInterimContent(transcript);
                return; // Dừng lại, không thêm vào segments chính thức
            }

            // --- TRƯỜNG HỢP 2: KẾT QUẢ CHỐT (Final / Màu thường) ---
            // Khi câu đã chốt, xóa text tạm và đưa text vào segments
            setInterimContent("");

            // Logic thêm vào segments giữ nguyên như cũ

            // import { formatWords } from "../lib/utils";
            let rawWords = (alt.words || []).map((w: any) => {
                // Nếu timestamp đầu tiên quá lớn (> 3600s = 1h), coi đó là lỗi Server Offset và trừ đi
                if (serverStartOffsetRef.current === null) {
                    if (w.start > 3600) { // Ngưỡng 1 giờ
                        serverStartOffsetRef.current = w.start;
                        console.warn(`⚠️ Server timestamp huge (${w.start}s). Normalizing to 0.`);
                    } else {
                        serverStartOffsetRef.current = 0;
                    }
                }

                const normStart = Math.max(0, w.start - (serverStartOffsetRef.current || 0));
                const normEnd = Math.max(0, w.end - (serverStartOffsetRef.current || 0));

                return {
                    ...w,
                    start: normStart + offsetTimeRef.current,
                    end: normEnd + offsetTimeRef.current
                };
            });

            const words = formatWords(rawWords);

            if (onFinal) onFinal({ speaker: 0, content: transcript });

            setSegments(prev => {
                const lastSegment = prev[prev.length - 1];
                const currentStart = words.length > 0 ? words[0].start : (lastEndTimestampRef.current + 0.1);
                const gap = currentStart - lastEndTimestampRef.current;
                const serverSpeaker = alt.speaker ?? (words[0]?.speaker) ?? 0;
                if (words.length > 0) {
                    lastEndTimestampRef.current = words[words.length - 1].end;
                }

                // SỬA ĐIỀU KIỆN GỘP:
                // Chỉ gộp khi CÙNG Speaker VÀ gần nhau
                if (lastSegment && lastSegment.speaker === serverSpeaker && gap < 1.0) {
                    return [
                        ...prev.slice(0, -1),
                        {
                            ...lastSegment,
                            content: mergeText(lastSegment.content, transcript),
                            words: (lastSegment.words || []).concat(words)
                        }
                    ];
                }

                // NẾU KHÁC SPEAKER -> TẠO SEGMENT MỚI (Xuống dòng)
                return [...prev, {
                    speaker: serverSpeaker, // Dùng đúng serverSpeaker thay vì tự tính nextSpeaker
                    content: transcript,
                    isFinal: true,
                    words: words
                }];
            });
        }
    };


    const stopListening = () => {
        setIsListening(false);
        socketRef.current?.close();

        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
    };

    const resetTranscript = () => {
        // Chỉ khi người dùng ấn nút Thùng rác mới xóa
        setSegments([]);
        setInterimContent("");
    };

    return { segments, interimContent, isListening, connectionError, startListening, stopListening, resetTranscript };
}