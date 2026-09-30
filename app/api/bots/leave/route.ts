import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/app/lib/rate-limit';

/** Cho phép user chủ động kết thúc bot ("Rời phòng & kết xuất"). */
export async function POST(req: Request) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = checkRateLimit(`bots:leave:${ip}`, 20, 5 * 60 * 1000);
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    try {
        const { botId } = await req.json();
        if (!botId) {
            return NextResponse.json({ error: "Missing botId" }, { status: 400 });
        }

        const apiKey = process.env.MEETINGBAAS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Server missing API Key" }, { status: 500 });
        }

        const response = await fetch(`https://api.meetingbaas.com/v2/bots/${botId}/leave`, {
            method: "POST",
            headers: { "x-meeting-baas-api-key": apiKey },
        });

        if (!response.ok) {
            const text = await response.text();
            return NextResponse.json({ error: "Failed to leave meeting", details: text }, { status: response.status });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Leave] Error:", error);
        const details = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: "Internal Error", details }, { status: 500 });
    }
}
