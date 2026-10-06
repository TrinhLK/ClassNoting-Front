import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/app/lib/rate-limit';
import { buildBotName, detectProvider } from '@/app/lib/meeting-links';

export async function POST(req: Request) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = checkRateLimit(`bots:join:${ip}`, 10, 5 * 60 * 1000);
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    try {
        const {
            meetingUrl,
            botName,
            botImage,
            userId,
            userName,
            userEmail,
            language,
            objectives,
            title,
            googleCredentialId,
            googleEmailGroup,
        } = await req.json();

        if (!meetingUrl) {
            return NextResponse.json({ error: "Missing meetingUrl" }, { status: 400 });
        }
        if (!userId) {
            return NextResponse.json({ error: "Missing userId" }, { status: 400 });
        }

        // PHẠM VI: chỉ Google Meet.
        const provider = detectProvider(meetingUrl);
        if (provider !== "meet") {
            return NextResponse.json(
                { error: "Link không hợp lệ. Chỉ hỗ trợ Google Meet." },
                { status: 400 }
            );
        }

        const apiKey = process.env.MEETINGBAAS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Server missing MEETINGBAAS_API_KEY" }, { status: 500 });
        }

        // Tự động nhận diện URL (Localhost vs Vercel vs Production)
        let appUrl = process.env.NEXT_PUBLIC_APP_URL;
        if (!appUrl && process.env.VERCEL_URL) {
            appUrl = `https://${process.env.VERCEL_URL}`;
        }
        if (!appUrl) {
            const host = req.headers.get("host");
            const protocol = host?.includes("localhost") ? "http" : "https";
            appUrl = host ? `${protocol}://${host}` : "http://localhost:3000";
        }
        const webhookUrl = `${appUrl}/api/webhooks/meetingbaas?userId=${userId}`;

        // Tên bot: "Thư ký của {Tên}" — theo tài khoản đang đăng nhập
        const finalBotName = (botName || "").trim() || buildBotName(userName, userEmail);

        const body: Record<string, unknown> = {
            meeting_url: meetingUrl,
            bot_name: finalBotName,
            bot_image: botImage || "https://png.pngtree.com/png-vector/20201224/ourmid/pngtree-future-intelligent-technology-robot-ai-png-image_2588803.jpg",
            recording_mode: "speaker_view",
            entry_message: `Xin chào, tôi là ${finalBotName}, tôi sẽ ghi chép cuộc họp này.`,
            transcription_enabled: false,
            transcription_config: {
                provider: "gladia",
            },
            custom_params: {
                language_config: {
                    languages: [language === "en" ? "en" : "vi"],
                    code_switching: true
                }
            },
            timeout_config: {
                waiting_room_timeout: 600,
                no_one_joined_timeout: 600,
                silence_timeout: 600
            },
            // Bật webhook để nhận chat realtime (bot.chat_message) + status change.
            webhook_url: webhookUrl,
            extra: {
                userId,
                provider,
                language: language === "en" ? "en" : "vi",
                objectives: objectives || "",
                title: title || "",
            },
        };

        // Google Meet họp khóa (Workspace/Edu): xác thực bằng login Google Workspace
        // đã liên kết (SAML SSO). email_group ưu tiên hơn credential_id (theo docs
        // MeetingBaaS). Không có credential → join ẩn danh như khách (họp mở vẫn chạy).
        // Bỏ qua meet_config khi không có credential để giữ hành vi ẩn danh hiện tại.
        const googleCredentialIdFinal =
            (googleCredentialId || "").trim() || process.env.MEETINGBAAS_GOOGLE_CREDENTIAL_ID?.trim();
        const googleEmailGroupFinal =
            (googleEmailGroup || "").trim() || process.env.MEETINGBAAS_MEET_EMAIL_GROUP?.trim();
        if (googleEmailGroupFinal || googleCredentialIdFinal) {
            const meetConfig: Record<string, unknown> = { fallback: "anonymous" };
            if (googleEmailGroupFinal) meetConfig.email_group = googleEmailGroupFinal;
            else if (googleCredentialIdFinal) meetConfig.credential_id = googleCredentialIdFinal;
            body.meet_config = meetConfig;
        }

        const response = await fetch("https://api.meetingbaas.com/v2/bots", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-meeting-baas-api-key": apiKey,
            },
            body: JSON.stringify(body),
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
        return NextResponse.json({
            success: true,
            botId: data.data.bot_id,
            provider,
            botName: finalBotName,
        });

    } catch (error: any) {
        console.error("Internal Error:", error);
        return NextResponse.json({
            error: "Internal Server Error",
            details: error?.message || String(error),
            stack: error?.stack
        }, { status: 500 });
    }
}
