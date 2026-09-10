
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/app/lib/rate-limit';

export async function POST(req: Request) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = checkRateLimit(`bots:join:${ip}`, 10, 5 * 60 * 1000);
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    try {
        const { meetingUrl, botName, botImage, userId } = await req.json();

        if (!meetingUrl) {
            return NextResponse.json({ error: "Missing meetingUrl" }, { status: 400 });
        }
        if (!userId) {
            return NextResponse.json({ error: "Missing userId" }, { status: 400 });
        }

        const apiKey = process.env.MEETINGBAAS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Server missing MEETINGBAAS_API_KEY" }, { status: 500 });
        }

        // Tự động nhận diện URL (Localhost vs Vercel vs Production)
        let appUrl = process.env.NEXT_PUBLIC_APP_URL;
        // Nếu không có APP_URL thủ công, thử lấy từ biến môi trường Vercel (chưa bao gồm https://)
        if (!appUrl && process.env.VERCEL_URL) {
            appUrl = `https://${process.env.VERCEL_URL}`;
        }

        // Nếu vẫn không có (chạy local chưa config), thử lấy từ Request Origin
        if (!appUrl) {
            const host = req.headers.get("host"); // VD: localhost:3000
            const protocol = host?.includes("localhost") ? "http" : "https";
            appUrl = host ? `${protocol}://${host}` : "http://localhost:3000";
        }

        // const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const webhookUrl = `${appUrl}/api/webhooks/meetingbaas?userId=${userId}`;


        const response = await fetch("https://api.meetingbaas.com/v2/bots", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-meeting-baas-api-key": apiKey,
            },
            body: JSON.stringify({
                meeting_url: meetingUrl,
                bot_name: botName || "DemoMeet Bot",
                bot_image: botImage || "https://png.pngtree.com/png-vector/20201224/ourmid/pngtree-future-intelligent-technology-robot-ai-png-image_2588803.jpg", // Ảnh Bot mặc định
                recording_mode: "speaker_view", // Hoặc "gallery_view"
                entry_message: "Xin chào, tôi là Meeting AI Bot, tôi sẽ ghi âm cuộc họp này để tóm tắt lại cho bạn.",
                transcription_enabled: false, // [Optional] Nếu API yêu cầu explicit
                transcription_config: {
                    provider: "gladia", // Chuyển sang Gladia để có Transcript
                    // language: "vi", // Tự động nhận diện
                },
                custom_params: {
                    language_config: {
                        languages: ["vi"],
                        code_switching: true
                    }
                },
                timeout_config: {
                    waiting_room_timeout: 600,
                    no_one_joined_timeout: 600,
                    silence_timeout: 600
                },
                // webhook_url: webhookUrl, // [DISABLED] User polls for data
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorDetails;
            try {
                errorDetails = JSON.parse(errorText);
            } catch (e) {
                errorDetails = errorText; // Use raw text if not JSON
            }
            console.error("MeetingBaas Error:", response.status, errorDetails);
            return NextResponse.json({
                error: "Failed to join meeting",
                details: errorDetails,
                statusCode: response.status
            }, { status: response.status });
        }

        const data = await response.json();
        // V2 Response structure: { success: true, data: { bot_id: "..." } }
        return NextResponse.json({ success: true, botId: data.data.bot_id });

    } catch (error: any) {
        console.error("Internal Error:", error);
        return NextResponse.json({
            error: "Internal Server Error",
            details: error?.message || String(error),
            stack: error?.stack
        }, { status: 500 });
    }
}
