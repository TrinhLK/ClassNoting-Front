import { NextResponse } from 'next/server';
import { lookup } from 'dns/promises';
import { checkRateLimit } from '@/app/lib/rate-limit';

export const dynamic = 'force-dynamic';

const BLOCKED_HOSTNAMES = [
  'localhost', '127.0.0.1', '::1', '0.0.0.0',
  'metadata.google.internal', 'metadata',
  '169.254.169.254',
];

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  if (parts[0] === 127) return true;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

async function validateUrl(target: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return 'Invalid URL';
  }

  if (parsed.protocol !== 'https:') {
    return 'Only HTTPS URLs are allowed';
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.some(b => hostname === b || hostname.endsWith('.' + b))) {
    return 'Blocked hostname';
  }

  try {
    const addresses = await lookup(hostname);
    const ip = addresses.address;
    if (isPrivateIP(ip)) {
      return 'Blocked private IP';
    }
  } catch {
    return 'DNS resolution failed';
  }

  return null;
}

export async function GET(request: Request) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = checkRateLimit(`proxy-file:${ip}`, 30, 60 * 1000);
    if (!allowed) {
        return new NextResponse('Too many requests', { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    const error = await validateUrl(url);
    if (error) {
        console.warn('[Proxy] Blocked:', url, '-', error);
        return new NextResponse(error, { status: 403 });
    }

    try {
        const response = await fetch(url);

        if (!response.ok) {
            return new NextResponse(`Failed to fetch remote file: ${response.statusText}`, { status: response.status });
        }

        return new NextResponse(response.body, {
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
                'Cache-Control': 'no-cache',
            },
        });
    } catch (error) {
        console.error('[Proxy] Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
