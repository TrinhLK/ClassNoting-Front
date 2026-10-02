import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/app/lib/rate-limit';
import { getAdminDb } from '@/app/lib/firebase-admin';
import { Meeting, Speaker, Segment, ChatMessage, MeetingParticipant } from '@/app/lib/db';
import { MEETING_STATUS } from '@/app/lib/constants';
import { detectProvider } from '@/app/lib/meeting-links';
import { meetingIdFor } from '@/app/lib/ext-sessions';
import { mergeMeetingDocs } from '@/app/lib/meeting-merge';

// Force dynamic
export const dynamic = 'force-dynamic';

const MAX_CHAT_MESSAGES = 500;

function toChatMessages(raw: unknown): ChatMessage[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((m: any, idx: number) => ({
            id: String(m?.id ?? `chat_${idx}`),
            sender: String(m?.sender ?? m?.speaker ?? m?.author ?? "Khách"),
            text: String(m?.text ?? m?.message ?? ""),
            timestamp: Number(m?.timestamp ?? m?.created_at ?? Date.now()),
        }))
        .filter((m) => m.text.trim() !== "")
        .slice(-MAX_CHAT_MESSAGES);
}

function toParticipants(raw: unknown): MeetingParticipant[] {
    if (!Array.isArray(raw)) return [];
    const out: MeetingParticipant[] = [];
    for (const item of raw as any[]) {
        const name = String(item?.display_name ?? item?.name ?? "").trim();
        if (!name) continue;
        const p: MeetingParticipant = { name };
        if (item?.id !== undefined) p.id = item.id;
        if (item?.display_name) p.displayName = String(item.display_name);
        out.push(p);
    }
    return out;
}

export async function GET(req: Request) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = checkRateLimit(`bots:status:${ip}`, 60, 60 * 1000);
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const botId = searchParams.get('botId');
        const userId = searchParams.get('userId');

        if (!botId || !userId) {
            return NextResponse.json({ error: "Missing botId or userId" }, { status: 400 });
        }

        const apiKey = process.env.MEETINGBAAS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Server missing API Key" }, { status: 500 });
        }

        // 1. Check MeetingBaas Status
        const response = await fetch(`https://api.meetingbaas.com/v2/bots/${botId}`, {
            headers: { "x-meeting-baas-api-key": apiKey }
        });

        if (!response.ok) {
            return NextResponse.json({ error: "Failed to fetch bot status" }, { status: response.status });
        }

        const data = await response.json();

        const botData = data.data || data; // Fallback just in case
        if (!botData || !botData.status) {
            console.error("[Polling] Invalid Bot Data:", botData);
            return NextResponse.json({ status: "error", error: "Invalid BaaS Response" });
        }
        const status = botData.status;

        // 1b. Merge live state (chat + participants) cached via webhook.
        let liveChat: ChatMessage[] = [];
        let liveParticipants: MeetingParticipant[] = [];
        try {
            const snap = await getAdminDb().collection("meeting_bots").doc(botId).get();
            if (snap.exists) {
                const live = snap.data() as { chatMessages?: unknown; participants?: unknown };
                liveChat = toChatMessages(live.chatMessages);
                liveParticipants = toParticipants(live.participants);
            }
        } catch (e) {
            console.warn("[Polling] Live state read failed:", e);
        }

        const provider = detectProvider(botData.meeting_url || "") ?? undefined;
        const participants = toParticipants(botData.participants);
        const speakersRaw = Array.isArray(botData.speakers) ? botData.speakers : [];
        // Webhook chat từ MeetingBaas có thể nằm ở bot.chat / botData.chat_messages
        const baasChat = toChatMessages(botData.chat ?? botData.chat_messages ?? botData.messages);
        const chatMessages = [...liveChat, ...baasChat].slice(-MAX_CHAT_MESSAGES);

        // 2. If 'completed', try to save (Idempotent)
        if (status === 'completed' || status === 'call_ended') {

            const { mp4, video, mp3, audio, transcript, transcription, speakers } = botData;

            // Prioritize Audio -> Video
            const mediaUrl = mp3 || audio || video || mp4;

            // Detect extension from URL or default
            let extension = 'mp4';
            if (mediaUrl) {
                try {
                    const urlPath = new URL(mediaUrl).pathname;
                    const ext = urlPath.split('.').pop()?.toLowerCase() || '';
                    if (ext) extension = ext;
                    else if (mp3 || audio) extension = 'mp3';
                } catch {
                    if (mp3 || audio) extension = 'mp3';
                }
            }
            void extension;

            if (!mediaUrl) {
                if (status === 'call_ended') {
                    return NextResponse.json({
                        status: 'processing',
                        saved: false,
                        participants: participants.length ? participants : liveParticipants,
                        chatMessages,
                    });
                }

                // Nếu status là 'completed' mà vẫn không có file -> Lỗi thật
                console.error("[Polling] Completed but no assets found:", botData);
                return NextResponse.json({
                    status: 'failed',
                    error: "Lỗi dữ liệu: Ghi âm không tồn tại."
                });
            }

            if (botData.transcription_status === 'transcribing' || botData.transcription_status === 'queued') {
                return NextResponse.json({
                    status: 'transcribing',
                    saved: false,
                    participants: participants.length ? participants : liveParticipants,
                    chatMessages,
                });
            }

            let transcriptData = transcript;

            const transcriptUrl = botData.transcription || botData.raw_transcription;

            if (!transcriptData && transcriptUrl) {
                try {
                    const tResponse = await fetch(transcriptUrl);
                    if (tResponse.ok) {
                        transcriptData = await tResponse.json();
                    }
                } catch (err) {
                    console.error("[Polling] Failed to fetch transcript JSON:", err);
                }
            }

            // [VERCEL FIX] Không tải file về server -> Trả link S3 cho Client tự xử lý
            const finalAudioUrl = mediaUrl;

            // [HYBRID] Return raw diarization for Local Processing
            const diarizationData = botData.diarization;

            // Generate initial speaker list from Bot Data (Backup)
            let speakerList: Speaker[] = (speakers || []).map((s: any, idx: number) => ({
                id: `SPEAKER_${idx.toString().padStart(2, '0')}`,
                name: typeof s === "string" ? s : (s.name || `Speaker ${idx + 1}`),
                color: "bg-indigo-100 text-indigo-700"
            }));

            // Chèn mốc chat vào segments rỗng: client sẽ merge chi tiết sau transcribe.
            // Ở đây giữ segments rỗng (HYBRID pipeline điền sau), nhưng đính kèm chatMessages.
            const meetingSegments: Segment[] = [];

            // Luồng kép bot + extension: cùng user + link + ngày → cùng meetingId.
            // Nếu extension đã kết xuất trước (live segments), gộp vào thay vì ghi đè.
            // Construct Meeting Object (BUT DO NOT SAVE)
            const sharedId = meetingIdFor(userId, botData.meeting_url || "", Date.now());
            const incoming: Meeting = {
                id: sharedId,
                userId: userId,
                title: `Meeting Report ${new Date().toLocaleDateString('vi-VN')}`,
                createdAt: Date.now(),
                duration: botData.duration_seconds || 0,
                audioUrl: finalAudioUrl,
                segments: meetingSegments, // [HYBRID] Will be filled by Python Server
                speakers: speakerList,
                summary: "",
                status: MEETING_STATUS.TRANSCRIBED,
                isDeleted: false,
                meetingUrl: botData.meeting_url,
                provider,
                botId,
                participants: participants.length ? participants : liveParticipants,
                chatMessages,
                // [NEW] Attach Diarization for Client to use
                diarization: diarizationData
            };

            let meetingData = incoming;
            try {
                const snap = await getAdminDb().collection("meetings").doc(sharedId).get();
                if (snap.exists) {
                    meetingData = mergeMeetingDocs(snap.data() as Meeting, {
                        ...incoming,
                        // Giữ audio bot (bản ghi đầy đủ) — mergeMeetingDocs ưu tiên audio có sẵn,
                        // nhưng transcript live của extension (segments) được giữ lại để đối soát.
                        audioUrl: finalAudioUrl,
                    });
                    meetingData.audioUrl = finalAudioUrl;
                    (meetingData as Meeting & { diarization?: unknown }).diarization = diarizationData;
                }
            } catch (e) {
                console.warn("[Polling] Merge read failed, using bot data only:", e);
            }

            return NextResponse.json({
                status: 'completed',
                shouldSave: true,
                meetingData: meetingData
            });
        }

        // Return current status if not complete (kèm speaker + chat live)
        return NextResponse.json({
            status: status,
            saved: false,
            participants: participants.length ? participants : liveParticipants,
            speakers: speakersRaw,
            chatMessages,
            chatCount: chatMessages.length,
            meetingUrl: botData.meeting_url,
            provider,
        });

    } catch (error: any) {
        console.error("[Polling] Error:", error);
        return NextResponse.json({ error: "Internal Error", details: error.message }, { status: 500 });
    }
}
