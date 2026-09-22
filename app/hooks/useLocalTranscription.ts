import { useState, useRef, useEffect, useCallback } from "react";
import { Word } from "../lib/mockData";
import { formatTranscriptText, formatWords } from "../lib/utils";

// HÀM NỐI CHUỖI THÔNG MINH (CHỐNG LẶP)
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
    while (l--) buf[l] = Math.max(-1, Math.min(1, buffer[l])) * 0x7FFF;
    return buf;
};

// Silence buffer: 1 giây audio rỗng (16000 samples @ 16kHz) - dùng làm heartbeat
const SILENCE_BUFFER = new Int16Array(16000);

// Giới hạn buffer audio trong lúc mất kết nối (tối đa ~5 giây)
const MAX_AUDIO_BUFFER_SIZE = 50;

export type TranscriptSegment = {
    speaker: number;
    content: string;
    isFinal: boolean;
    words?: Word[];
};

export default function useLocalTranscription(
    onFinal?: (data: any) => void
) {
    const serverUrl = process.env.NEXT_PUBLIC_REALTIME_PROCESSING_SERVER || "wss://asr.noting.io.vn";
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

    // --- REFS CHO RECONNECTION ---
    const isReconnectingRef = useRef(false);
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 5;
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const languageRef = useRef<string>("vi");
    const startTimeOffsetRef = useRef<number>(0);
    const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
    const isListeningRef = useRef(false);
    const audioBufferRef = useRef<Int16Array[]>([]); // Buffer audio trong lúc mất kết nối
    // -----------------------------------------------------

    // Sync isListeningRef with isListening state
    useEffect(() => {
        isListeningRef.current = isListening;
    }, [isListening]);

    const handleServerResponse = useCallback((data: any) => {
        // [FIX] Bỏ qua keepalive messages từ server
        if (data.type === "keepalive") return;

        const isFinalPacket = data.is_final;

        if (data.channel && data.channel.alternatives?.[0]) {
            const alt = data.channel.alternatives[0];

            const rawTranscript = alt.transcript;
            if (!rawTranscript) return;

            const transcript = formatTranscriptText(rawTranscript);

            if (!isFinalPacket) {
                setInterimContent(transcript);
                return;
            }

            setInterimContent("");

            let rawWords = (alt.words || []).map((w: any) => {
                if (serverStartOffsetRef.current === null) {
                    if (w.start > 3600) {
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

                return [...prev, {
                    speaker: serverSpeaker,
                    content: transcript,
                    isFinal: true,
                    words: words
                }];
            });
        }
    }, [onFinal]);

    const setupWebSocket = useCallback((language: string) => {
        // [FIX] Đóng WS cũ nếu vẫn đang open (tránh orphaned connection)
        if (socketRef.current && socketRef.current.readyState < 2) {
            socketRef.current.close(1000, "Reconnecting");
        }

        // Reset timestamp refs cho server session mới
        serverStartOffsetRef.current = null;

        const finalUrl = `${serverUrl}/?language=${language}`;
        const ws = new WebSocket(finalUrl);
        socketRef.current = ws;

        ws.onopen = () => {
            setConnectionError(null);
            isReconnectingRef.current = false;
            reconnectAttemptsRef.current = 0;

            // [P0] Resume AudioContext nếu bị browser suspension
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume().catch(() => {});
            }

            // [P1] Flush audio buffer đã tích lũy trong lúc mất kết nối
            if (audioBufferRef.current.length > 0) {
                const buffered = audioBufferRef.current.splice(0);
                for (const chunk of buffered) {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(chunk.buffer);
                    }
                }
            }

            if (heartbeatRef.current) clearInterval(heartbeatRef.current);

            // [P0+P2] Heartbeat: gửi silence buffer 16kHz thay vì empty frame, interval 15s
            heartbeatRef.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(SILENCE_BUFFER.buffer);
                }
            }, 15000);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerResponse(data);
            } catch (e) { console.error("Parse error:", e); }
        };

        ws.onerror = () => {};

        ws.onclose = (event) => {
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);

            if (event.code === 1000) return;

            if (!isReconnectingRef.current && isListeningRef.current) {
                isReconnectingRef.current = true;
                const attempts = reconnectAttemptsRef.current;

                if (attempts < maxReconnectAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, attempts), 16000);
                    setConnectionError(`Mất kết nối, đang thử kết nối lại... (${attempts + 1}/${maxReconnectAttempts})`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttemptsRef.current++;
                        setupWebSocket(languageRef.current);
                    }, delay);
                } else {
                    setConnectionError("Mất kết nối vĩnh viễn. Vui lòng bấm dừng và bắt đầu lại.");
                    setIsListening(false);
                }
            }
        };
    }, [serverUrl, handleServerResponse]);

    const startListening = async (rawStream: MediaStream, startTimeOffset: number = 0, language: string = "vi") => {
        offsetTimeRef.current = startTimeOffset;
        startTimeOffsetRef.current = startTimeOffset;
        languageRef.current = language;
        setIsListening(true);
        serverStartOffsetRef.current = null;
        audioBufferRef.current = [];

        if (startTimeOffset === 0) {
            lastEndTimestampRef.current = 0;
        }

        setupWebSocket(language);

        if (!audioContextRef.current) {
            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(rawStream);
            const processor = audioContext.createScriptProcessor(8192, 1, 1);
            processorRef.current = processor;

            source.connect(processor);
            processor.connect(audioContext.destination);

            processor.onaudioprocess = (e) => {
                const ws = socketRef.current;

                // [P1] Nếu WebSocket không open -> buffer audio thay vì drop
                if (!ws || ws.readyState !== WebSocket.OPEN) {
                    if (isReconnectingRef.current) {
                        const inputData = e.inputBuffer.getChannelData(0);
                        const pcmData = downsampleBuffer(inputData, audioContext.sampleRate, 16000);
                        audioBufferRef.current.push(pcmData);
                        // Giới hạn bộ nhớ: giữ tối đa ~5 giây
                        if (audioBufferRef.current.length > MAX_AUDIO_BUFFER_SIZE) {
                            audioBufferRef.current.shift();
                        }
                    }
                    return;
                }

                // Flush buffer trước khi gửi audio mới
                if (audioBufferRef.current.length > 0) {
                    const buffered = audioBufferRef.current.splice(0);
                    for (const chunk of buffered) {
                        ws.send(chunk.buffer);
                    }
                }

                const inputData = e.inputBuffer.getChannelData(0);
                const pcmData = downsampleBuffer(inputData, audioContext.sampleRate, 16000);
                ws.send(pcmData.buffer);
            };
        }
        streamRef.current = rawStream;
    };

    const stopListening = () => {
        setIsListening(false);
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        isReconnectingRef.current = false;
        audioBufferRef.current = [];

        socketRef.current?.close(1000, "User stopped");

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
        setSegments([]);
        setInterimContent("");
    };

    return { segments, interimContent, isListening, connectionError, startListening, stopListening, resetTranscript };
}