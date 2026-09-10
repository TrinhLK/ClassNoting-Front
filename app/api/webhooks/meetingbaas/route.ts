import { NextResponse } from 'next/server';
import { saveMeeting, updateMeetingProcess, Meeting, Speaker, Segment } from '@/app/lib/db';
import { getAdminStorage } from '@/app/lib/firebase-admin';
import { MEETING_STATUS } from '@/app/lib/constants';

export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET = process.env.MEETINGBAAS_WEBHOOK_SECRET;

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  // Trước đây: `if (!WEBHOOK_SECRET) return true` → bypass auth nếu thiếu env trong production
  // Giờ: nếu thiếu secret thì REJECT request thay vì bypass (fail-closed)
  if (!WEBHOOK_SECRET) {
    console.error("[Webhook] MEETINGBAAS_WEBHOOK_SECRET chưa được cấu hình — rejecting request for safety");
    return false;
  }
  if (!signature) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expectedHex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (signature.length !== expectedHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(req: Request) {
    try {
        const signature = req.headers.get('X-MeetingBaas-Signature');
        const rawBody = await req.text();

        const verified = await verifySignature(rawBody, signature);
        if (!verified) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            console.error("[Webhook] Missing userId in query params");
            return NextResponse.json({ error: "Missing userId" }, { status: 400 });
        }

        const body = JSON.parse(rawBody);
        const { event, data } = body;

        if (event === 'failed') {
            console.error("[Webhook] Bot failed:", data?.error);
            const failedBotId = data?.bot_id;
            if (failedBotId) {
                try {
                    await updateMeetingProcess(failedBotId, {
                        status: MEETING_STATUS.FAILED,
                        errorMessage: data?.error || "Bot không thể tham gia cuộc họp.",
                        jobId: undefined as any,
                    });
                } catch (err) {
                    console.error("[Webhook] Failed to mark meeting as failed:", err);
                }
            }
            return NextResponse.json({ received: true });
        }

        if ((event === 'complete' || event === 'bot.completed') && data) {
            const { bot_id, speakers } = data;
            const mp4 = data.mp4;
            const transcript = data.transcript;

            const mp4Url = mp4 || data.video;
            let transcriptData = transcript;

            if (!transcriptData && data.transcription) {
                try {
                    const tResponse = await fetch(data.transcription);
                    if (tResponse.ok) {
                        transcriptData = await tResponse.json();
                    }
                } catch (err) {
                    console.error("[Webhook] Failed to fetch transcript JSON:", err);
                }
            }

            let audioUrl = "";

            if (mp4Url) {
                try {
                    const response = await fetch(mp4Url);
                    if (response.ok) {
                        const buffer = Buffer.from(await response.arrayBuffer());
                        const fileName = `meetingbaas_${bot_id.split('-')[0]}.mp4`;
                        const bucket = getAdminStorage().bucket();
                        const fileRef = bucket.file(`users/${userId}/uploads/${fileName}`);
                        await fileRef.save(buffer, {
                            metadata: { contentType: 'video/mp4' }
                        });
                        const [url] = await fileRef.getSignedUrl({
                            action: 'read',
                            expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
                        });
                        audioUrl = url;
                    }
                } catch (err) {
                    console.error("[Webhook] Error uploading to Firebase:", err);
                }
            }

            const mappedSegments: Segment[] = [];
            const speakerList: Speaker[] = (speakers || []).map((name: string, idx: number) => ({
                id: `SPEAKER_${idx.toString().padStart(2, '0')}`,
                name: name,
                color: "bg-indigo-100 text-indigo-700"
            }));

            const getSpeakerId = (name: string) => {
                const s = speakerList.find(x => x.name === name);
                return s ? s.id : "SPEAKER_00";
            };

            if (transcriptData && Array.isArray(transcriptData)) {
                transcriptData.forEach((block: any) => {
                    if (!block.words || block.words.length === 0) return;
                    const text = block.words.map((w: any) => w.word).join(" ");
                    const start = block.words[0].start;
                    const end = block.words[block.words.length - 1].end;
                    mappedSegments.push({
                        id: `seg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        speakerId: getSpeakerId(block.speaker),
                        text: text,
                        start: start,
                        end: end
                    });
                });
            }

            const meetingStatus = mappedSegments.length > 0 ? MEETING_STATUS.TRANSCRIBED : MEETING_STATUS.FAILED;

            const newMeeting: Meeting = {
                id: bot_id,
                userId: userId,
                title: `Meeting Report ${new Date().toLocaleDateString('vi-VN')}`,
                createdAt: Date.now(),
                duration: mappedSegments.length > 0 ? mappedSegments[mappedSegments.length - 1].end : 0,
                audioUrl: audioUrl,
                segments: mappedSegments,
                speakers: speakerList,
                summary: "",
                status: meetingStatus,
                isDeleted: false
            };

            if (meetingStatus === MEETING_STATUS.TRANSCRIBED || mappedSegments.length > 0) {
                await saveMeeting(newMeeting);
            }
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("[Webhook] Error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
