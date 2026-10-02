import { NextResponse } from 'next/server';
import { saveMeeting, updateMeetingProcess, Meeting, Speaker, Segment, ChatMessage } from '@/app/lib/db';
import { getAdminDb, getAdminStorage } from '@/app/lib/firebase-admin';
import { MEETING_STATUS } from '@/app/lib/constants';

export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET = process.env.MEETINGBAAS_WEBHOOK_SECRET;
const MAX_CHAT_MESSAGES = 500;

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

/**
 * Đọc userId từ payload webhook khi URL tĩnh không kèm query param.
 * MeetingBaaS gửi kèm `extra` (đã nhúng lúc join) ở root hoặc trong `data`.
 */
function readExtraUserId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { extra?: { userId?: unknown }; data?: unknown };
  if (root.extra && typeof root.extra.userId === "string" && root.extra.userId) {
    return root.extra.userId;
  }
  if (root.data && typeof root.data === "object") {
    const extra = (root.data as { extra?: { userId?: unknown } }).extra;
    if (extra && typeof extra.userId === "string" && extra.userId) return extra.userId;
  }
  return null;
}

function toChatMessage(raw: any): ChatMessage | null {
  const text = String(raw?.text ?? raw?.message ?? "").trim();
  if (!text) return null;
  return {
    id: String(raw?.id ?? `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    sender: String(raw?.sender ?? raw?.speaker ?? raw?.author ?? "Khách"),
    text,
    timestamp: Number(raw?.timestamp ?? raw?.created_at ?? Date.now()),
  };
}

async function appendLiveChat(botId: string, msg: ChatMessage) {
  const ref = getAdminDb().collection("meeting_bots").doc(botId);
  const snap = await ref.get();
  const prev = (snap.exists ? (snap.data()?.chatMessages as ChatMessage[] | undefined) : undefined) ?? [];
  const next = [...prev, msg].slice(-MAX_CHAT_MESSAGES);
  await ref.set(
    { chatMessages: next, updatedAt: Date.now() },
    { merge: true }
  );
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
        let rawJson: unknown;
        try {
            rawJson = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }

        // userId: ưu tiên query param (webhook theo từng bot lúc join);
        // fallback sang extra.userId trong payload (webhook cấu hình ở dashboard,
        // URL tĩnh không kèm userId — MeetingBaaS gửi kèm `extra` đã nhúng lúc join).
        const userId: string | null =
            searchParams.get('userId') || readExtraUserId(rawJson);

        if (!userId) {
            console.error("[Webhook] Missing userId (query params và payload.extra đều không có)");
            return NextResponse.json({ error: "Missing userId" }, { status: 400 });
        }

        // Payload webhook không có schema cố định (event shape khác nhau),
        // phần còn lại của handler đọc field phòng thủ (optional chaining + fallback).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { event, data }: { event: string; data: any } = rawJson as any;

        // --- Chat realtime: chỉ đọc, không gửi. Lưu vào meeting_bots để client poll/subscribe. ---
        if (event === 'bot.chat_message' && data) {
            const botId = data.bot_id || data.botId;
            const msg = toChatMessage(data.message ?? data);
            if (botId && msg) {
                try {
                    await appendLiveChat(botId, msg);
                } catch (err) {
                    console.error("[Webhook] Failed to append live chat:", err);
                }
            }
            return NextResponse.json({ received: true });
        }

        // --- Cập nhật trạng thái/participants live ---
        if ((event === 'bot.status_change' || event === 'status_change') && data) {
            const botId = data.bot_id || data.botId;
            if (botId) {
                try {
                    const payload: Record<string, unknown> = {
                        status: data.status,
                        updatedAt: Date.now(),
                        userId,
                    };
                    if (Array.isArray(data.participants)) payload.participants = data.participants;
                    if (Array.isArray(data.speakers)) payload.speakers = data.speakers;
                    await getAdminDb().collection("meeting_bots").doc(botId).set(payload, { merge: true });
                } catch (err) {
                    console.error("[Webhook] Failed to update live status:", err);
                }
            }
            return NextResponse.json({ received: true });
        }

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
                    await getAdminDb().collection("meeting_bots").doc(failedBotId).set(
                        { status: "failed", error: data?.error || "Bot failed", updatedAt: Date.now(), userId },
                        { merge: true }
                    );
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

            // Gộp chat đã lưu live vào biên bản (tab riêng + mốc trong transcript do client render).
            let chatMessages: ChatMessage[] = [];
            try {
                const liveSnap = await getAdminDb().collection("meeting_bots").doc(bot_id).get();
                if (liveSnap.exists) {
                    const live = liveSnap.data() as { chatMessages?: ChatMessage[] };
                    if (Array.isArray(live.chatMessages)) chatMessages = live.chatMessages.slice(-MAX_CHAT_MESSAGES);
                }
            } catch (err) {
                console.error("[Webhook] Failed to read live chat:", err);
            }
            const inlineChat = Array.isArray(data.chat ?? data.chat_messages)
                ? (data.chat ?? data.chat_messages).map(toChatMessage).filter((m: ChatMessage | null): m is ChatMessage => m !== null)
                : [];
            if (inlineChat.length) chatMessages = [...chatMessages, ...inlineChat].slice(-MAX_CHAT_MESSAGES);

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
                isDeleted: false,
                botId: bot_id,
                meetingUrl: data.meeting_url,
                chatMessages,
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
