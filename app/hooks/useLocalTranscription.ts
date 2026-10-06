import { useState, useRef, useEffect, useCallback } from "react";
import { formatTranscriptText, formatWords } from "../lib/utils";
import {
    downsampleBuffer,
    splitSpeakerTurns,
    MAX_AUDIO_BUFFER_SIZE,
    CONNECT_TIMEOUT_MS,
    MAX_RECONNECT_ATTEMPTS,
    buildRealtimeUrl,
    parseServerMessage,
    mergeFinalSegment,
} from "../lib/realtime-protocol";
import type { TranscriptSegment } from "../lib/realtime-protocol";

// Giữ re-export để code ngoài hook (nếu có) vẫn import được type cũ.
export type { TranscriptSegment };

export default function useLocalTranscription(
    onFinal?: (data: any) => void,
    onPermanentError?: (code: number) => void
) {
    const serverUrl = process.env.NEXT_PUBLIC_REALTIME_PROCESSING_SERVER || "wss://asr.noting.io.vn";
    // --- STATE ---
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);
    const [interimContent, setInterimContent] = useState<string>("");
    const [isListening, setIsListening] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);

    // --- REFS ---
    const drainRef = useRef<Promise<void> | null>(null);
    const samplesRef = useRef(0);
    const protocolRef = useRef(0);
    const speakerMapRef = useRef(new Map<string, number>());
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
    const maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const languageRef = useRef<string>("vi");
    const startTimeOffsetRef = useRef<number>(0);
    const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
    const isListeningRef = useRef(false);
    const audioBufferRef = useRef<Int16Array[]>([]); // Buffer audio trong lúc mất kết nối
    const clientCloseRef = useRef(false); // Close do client chủ động (không retry)
    const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onPermanentErrorRef = useRef<((code: number) => void) | undefined>(onPermanentError);
    // -----------------------------------------------------

    // Sync isListeningRef with isListening state
    useEffect(() => {
        isListeningRef.current = isListening;
    }, [isListening]);

    useEffect(() => {
        onPermanentErrorRef.current = onPermanentError;
    }, [onPermanentError]);

    const handleServerResponse = useCallback((data: any) => {
        if (data?.type === "ready") { protocolRef.current = data.protocol || 1; return; }
        const parsed = parseServerMessage(data);
        if (!parsed) return;
        for (const packet of splitSpeakerTurns(parsed)) {
        // null = keepalive / message rỗng / sai định dạng → bỏ qua.
        if (!packet) return;

        const transcript = formatTranscriptText(packet.rawTranscript);

        if (packet.kind === "interim") {
            setInterimContent(transcript);
            return;
        }

        setInterimContent("");

        const rawWords = packet.rawWords.map((w) => {
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
                start: packet.protocol === 2 ? w.start : normStart + offsetTimeRef.current,
                end: packet.protocol === 2 ? w.end : normEnd + offsetTimeRef.current
            };
        });

        const words = formatWords(rawWords);

        const key = `${packet.speakerScope || "legacy"}:${packet.serverSpeaker}`;
        if (packet.serverSpeaker >= 0 && !speakerMapRef.current.has(key))
            speakerMapRef.current.set(key, speakerMapRef.current.size);
        const speaker = packet.serverSpeaker < 0 ? -1 : speakerMapRef.current.get(key)!;
        if (onFinal) onFinal({ speaker, content: transcript });

        setSegments(prev => {
            const result = mergeFinalSegment(
                prev,
                transcript,
                words,
                speaker,
                lastEndTimestampRef.current
            );
            lastEndTimestampRef.current = result.lastEnd;
            return result.segments.map(s => ({ ...s, uncertain: s.speaker < 0 }));
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
        clientCloseRef.current = false;

        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);

        protocolRef.current = 0;
        const finalUrl = buildRealtimeUrl(serverUrl, language);
        const ws = new WebSocket(finalUrl);
        socketRef.current = ws;

        // [P0] Health-check: WS treo quá 8s ở trạng thái CONNECTING -> ép close để retry
        connectTimeoutRef.current = setTimeout(() => {
            if (ws.readyState === WebSocket.CONNECTING) {
                console.warn(`[WS] Connect timeout ${CONNECT_TIMEOUT_MS}ms -> force close để retry`);
                ws.close();
            }
        }, CONNECT_TIMEOUT_MS);

        ws.onopen = () => {
            if (connectTimeoutRef.current) {
                clearTimeout(connectTimeoutRef.current);
                connectTimeoutRef.current = null;
            }
            setConnectionError(null);
            isReconnectingRef.current = false;
            reconnectAttemptsRef.current = 0;

            // [P0] Resume AudioContext nếu bị browser suspension
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume().catch(() => {});
            }

            if (heartbeatRef.current) clearInterval(heartbeatRef.current);

            // [P0+P2] Heartbeat: gửi silence buffer 16kHz mỗi 8s — giữ connection sống trước Cloudflare idle timeout
            heartbeatRef.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    if (protocolRef.current >= 2) ws.send(JSON.stringify({ type: "ping" }));
                }
            }, 8000);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerResponse(data);
            } catch (e) { console.error("Parse error:", e); }
        };

        ws.onerror = () => {
            console.warn(`[WS] Error: url=${finalUrl} readyState=${ws.readyState}`);
        };

        ws.onclose = (event) => {
            if (connectTimeoutRef.current) {
                clearTimeout(connectTimeoutRef.current);
                connectTimeoutRef.current = null;
            }

            // [FIX] Bỏ qua close của socket ĐÃ BỊ THAY THẾ (race với heartbeat cũ)
            if (ws !== socketRef.current) return;

            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current);
                heartbeatRef.current = null;
            }

            // Close do client chủ động (stopListening) hoặc đã không còn nghe -> không retry
            if (clientCloseRef.current || !isListeningRef.current) return;

            console.warn(`[WS] Connection closed: code=${event.code} reason="${event.reason}" wasClean=${event.wasClean}`);

            // Đánh dấu đang reconnect -> buffer audio thay vì drop
            isReconnectingRef.current = true;

            const attempts = reconnectAttemptsRef.current;
            if (attempts < maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, attempts), 16000);
                const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
                setConnectionError(
                    isOffline
                        ? `Mất mạng internet, đang thử kết nối lại... (${attempts + 1}/${maxReconnectAttempts})`
                        : `Mất kết nối máy chủ ASR (lỗi ${event.code}), đang thử kết nối lại... (${attempts + 1}/${maxReconnectAttempts})`
                );
                // [FIX] Tăng attempts NGAY TẠI ĐÂY (không trong setTimeout) để lần close
                // kế tiếp vẫn lặp lại được -> retry đúng 5 lần thay vì kẹt ở (1/5)
                reconnectAttemptsRef.current = attempts + 1;
                reconnectTimeoutRef.current = setTimeout(() => {
                    reconnectTimeoutRef.current = null;
                    setupWebSocket(languageRef.current);
                }, delay);
            } else {
                setConnectionError(
                    `Mất kết nối máy chủ ASR sau ${maxReconnectAttempts} lần thử (lỗi ${event.code}). Bấm nút ghi âm để kết nối lại — dữ liệu đã ghi vẫn được giữ.`
                );
                isReconnectingRef.current = false;
                setIsListening(false);
                onPermanentErrorRef.current?.(event.code);
            }
        };
    }, [serverUrl, handleServerResponse]);

    const startListening = async (rawStream: MediaStream, startTimeOffset: number = 0, language: string = "vi") => {
        await drainRef.current;
        offsetTimeRef.current = startTimeOffset;
        startTimeOffsetRef.current = startTimeOffset;
        languageRef.current = language;
        // [FIX] Gán ref NGAY (không chờ effect sync) để onclose đầu tiên thấy isListening=true
        isListeningRef.current = true;
        setIsListening(true);
        serverStartOffsetRef.current = null;
        audioBufferRef.current = [];
        samplesRef.current = Math.round(startTimeOffset * 16000);
        if (startTimeOffset === 0) speakerMapRef.current.clear();

        // [FIX] Reset toàn bộ trạng thái retry cho phiên ghi âm mới
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
        }
        reconnectAttemptsRef.current = 0;
        isReconnectingRef.current = false;
        clientCloseRef.current = false;

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

                const pcmData = downsampleBuffer(e.inputBuffer.getChannelData(0), audioContext.sampleRate, 16000);
                const offset = samplesRef.current / 16000;
                samplesRef.current += pcmData.length;
                if (!ws || ws.readyState !== WebSocket.OPEN || protocolRef.current < 2) {
                    audioBufferRef.current.push(pcmData);
                    if (audioBufferRef.current.length > MAX_AUDIO_BUFFER_SIZE) audioBufferRef.current.shift();
                    return;
                }
                const buffered = audioBufferRef.current.splice(0);
                const bufferedSamples = buffered.reduce((sum, c) => sum + c.length, 0);
                if (buffered.length) {
                    offsetTimeRef.current = offset - bufferedSamples / 16000;
                    if (protocolRef.current >= 2) ws.send(JSON.stringify({ type: "audio_clock", offset: offsetTimeRef.current }));
                    for (const chunk of buffered) ws.send(chunk.buffer);
                }
                if (protocolRef.current >= 2) ws.send(JSON.stringify({ type: "audio_clock", offset }));
                ws.send(pcmData.buffer);
            };
        }
        streamRef.current = rawStream;
    };

    const stopListening = () => {
        if (drainRef.current) return drainRef.current;
        const draining = (async () => {
        isListeningRef.current = false;
        setIsListening(false);
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
        isReconnectingRef.current = false;
        audioBufferRef.current = [];

        // [FIX] Đánh dấu close do client -> onclose sẽ không retry
        clientCloseRef.current = true;
        const closingSocket = socketRef.current;
        processorRef.current?.disconnect();
        if (closingSocket?.readyState === WebSocket.OPEN && protocolRef.current >= 2) {
            await new Promise<void>(resolve => {
                const finish = () => { clearTimeout(timeout); closingSocket.removeEventListener("message", handler); resolve(); };
                const handler = (event: MessageEvent) => { try { if (JSON.parse(event.data).type === "flushed") finish(); } catch { /* binary */ } };
                const timeout = setTimeout(finish, 20000);
                closingSocket.addEventListener("message", handler);
                closingSocket.send(JSON.stringify({ type: "flush" }));
            });
        }
        closingSocket?.close(1000, "User stopped");

        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }

        })();
        drainRef.current = draining;
        void draining.finally(() => { drainRef.current = null; });
        return draining;
    };

    // [P1] Tự kết nối lại NGAY khi máy có mạng trở lại (thay vì chờ backoff tiếp)
    useEffect(() => {
        const handleOnline = () => {
            if (!isListeningRef.current || !isReconnectingRef.current) return;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            reconnectAttemptsRef.current = 0;
            setupWebSocket(languageRef.current);
        };
        window.addEventListener("online", handleOnline);
        return () => window.removeEventListener("online", handleOnline);
    }, [setupWebSocket]);

    // Cleanup khi unmount: dọn toàn bộ WS + timer + audio (tránh leak/retry mồ côi)
    useEffect(() => {
        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            clientCloseRef.current = true;
            socketRef.current?.close(1000, "Unmount");
            socketRef.current = null;
            processorRef.current?.disconnect();
            processorRef.current = null;
            audioContextRef.current?.close().catch(() => {});
            audioContextRef.current = null;
        };
    }, []);

    const resetTranscript = () => {
        setSegments([]);
        speakerMapRef.current.clear();
        setInterimContent("");
    };

    return { segments, interimContent, isListening, connectionError, startListening, stopListening, resetTranscript };
}