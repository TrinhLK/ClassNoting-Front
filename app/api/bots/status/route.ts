
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/app/lib/rate-limit';
import fs from 'fs';
import path from 'path';
import { getMeetingById, Meeting, Speaker, Segment } from '@/app/lib/db';
import { MEETING_STATUS } from '@/app/lib/constants';

// Force dynamic
export const dynamic = 'force-dynamic';

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

        // Check for failure: Call ended but never joined (Not Admitted / Timeout)
        // [RELAXED] Tạm bỏ check joined_at vì có trường hợp Bot vào rồi nhưng joined_at vẫn null
        /* if (botData.status === 'call_ended' && !botData.joined_at) {
            console.error("[Polling] Bot failed to join (joined_at is null)", botData);
            return NextResponse.json({
                status: 'failed',
                error: "Bot không vào được phòng (Có thể chưa được duyệt)."
            });
        } */

        // 2. If 'completed', try to save (Idempotent)
        if (status === 'completed' || status === 'call_ended') {

            const { mp4, video, mp3, audio, transcript, transcription, speakers } = botData;

            // Prioritize Audio -> Video
            const mediaUrl = mp3 || audio || video || mp4;

            // Detect extension from URL or default
            let extension = 'mp4';
            if (mediaUrl) {
                const urlPath = new URL(mediaUrl).pathname;
                const ext = path.extname(urlPath).replace('.', '');
                if (ext) extension = ext;
                else if (mp3 || audio) extension = 'mp3';
            }

            if (!mediaUrl) {
                if (status === 'call_ended') {
                    return NextResponse.json({ status: 'processing', saved: false });
                }

                // Nếu status là 'completed' mà vẫn không có file -> Lỗi thật
                console.error("[Polling] Completed but no assets found:", botData);
                return NextResponse.json({
                    status: 'failed',
                    error: "Lỗi dữ liệu: Ghi âm không tồn tại."
                });
            }

            if (botData.transcription_status === 'transcribing' || botData.transcription_status === 'queued') {
                return NextResponse.json({ status: 'transcribing', saved: false });
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
                name: s.name || `Speaker ${idx + 1}`,
                color: "bg-indigo-100 text-indigo-700"
            }));

            // Construct Meeting Object (BUT DO NOT SAVE)
            const meetingData: Meeting = {
                id: botId,
                userId: userId,
                title: `Meeting Report ${new Date().toLocaleDateString('vi-VN')}`,
                createdAt: Date.now(),
                duration: botData.duration_seconds || 0,
                audioUrl: finalAudioUrl,
                segments: [], // [HYBRID] Will be filled by Python Server
                speakers: speakerList,
                summary: "",
                status: MEETING_STATUS.TRANSCRIBED,
                isDeleted: false,
                // [NEW] Attach Diarization for Client to use
                // @ts-ignore
                diarization: diarizationData
            };

            return NextResponse.json({
                status: 'completed',
                shouldSave: true,
                meetingData: meetingData
            });
        }

        // Return current status if not complete
        return NextResponse.json({ status: status, saved: false });

    } catch (error: any) {
        console.error("[Polling] Error:", error);
        return NextResponse.json({ error: "Internal Error", details: error.message }, { status: 500 });
    }
}
