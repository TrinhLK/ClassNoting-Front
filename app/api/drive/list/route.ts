
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/app/lib/rate-limit';

export async function GET(request: Request) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = checkRateLimit(`drive:list:${ip}`, 30, 60 * 1000);
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const cookieStore = await cookies();
    const accessToken = cookieStore.get('google_access_token')?.value;

    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        // 1. Find "Meet Recordings" folder
        const folderQuery = "mimeType = 'application/vnd.google-apps.folder' and name = 'Meet Recordings' and trashed = false";
        const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!folderRes.ok) throw new Error("Failed to search folder");
        const folderData = await folderRes.json();

        let query = "(mimeType contains 'video/' or mimeType contains 'audio/') and trashed = false";

        // If folder found, narrow search to that folder
        if (folderData.files && folderData.files.length > 0) {
            const folderId = folderData.files[0].id;
            query += ` and '${folderId}' in parents`;
        }

        // 2. List files
        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime,size,thumbnailLink,videoMediaMetadata)&orderBy=createdTime desc`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!fileRes.ok) throw new Error("Failed to list files");
        const fileData = await fileRes.json();

        return NextResponse.json({ files: fileData.files });

    } catch (error: any) {
        console.error("Drive List Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
