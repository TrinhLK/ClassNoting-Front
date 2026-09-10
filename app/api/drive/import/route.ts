
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminStorage } from '@/app/lib/firebase-admin';
import { startTranscriptionJob } from "@/app/lib/api";
import { checkRateLimit } from '@/app/lib/rate-limit';

// Helper to download file from Drive
async function downloadFile(fileId: string, accessToken: string): Promise<ArrayBuffer> {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error("Failed to download file from Drive");
    return await res.arrayBuffer();
}

async function getValidAccessToken(): Promise<string | null> {
    const cookieStore = await cookies();
    let accessToken = cookieStore.get('google_access_token')?.value;
    const refreshToken = cookieStore.get('google_refresh_token')?.value;

    if (accessToken) return accessToken;
    if (!refreshToken) return null;

    try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });
        const tokens = await res.json();
        if (tokens.access_token) {
            cookieStore.set('google_access_token', tokens.access_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: tokens.expires_in,
                path: '/',
            });
            return tokens.access_token;
        }
    } catch (err) {
        console.error("Token refresh failed:", err);
    }
    return null;
}

export async function POST(request: Request) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = checkRateLimit(`drive:import:${ip}`, 10, 60 * 1000);
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const accessToken = await getValidAccessToken();

    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const { fileId, fileName } = await request.json();

        const fileBuffer = await downloadFile(fileId, accessToken);

        const timestamp = Date.now();
        const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `imports/drive/${timestamp}-${safeName}`;
        const bucket = getAdminStorage().bucket();
        const fileRef = bucket.file(storagePath);

        await fileRef.save(Buffer.from(fileBuffer), {
            metadata: { contentType: 'video/mp4' }
        });

        const [signedUrl] = await fileRef.getSignedUrl({
            action: 'read',
            expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
        });

        const jobId = await startTranscriptionJob(signedUrl);

        return NextResponse.json({ success: true, jobId, firebaseUrl: signedUrl });

    } catch (error: any) {
        console.error("Drive Import Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
