import { NextResponse } from "next/server";
import { EXTENSION_STORE_PUBLISHED, EXTENSION_STORE_URL, STORE_EXTENSION_ID } from "@/app/lib/extension-config";

// Request-driven check only: never expose an install link to a missing listing.
// Google can return a generic/error HTML page with HTTP 200, so verify its title too.
export async function GET() {
  let published = EXTENSION_STORE_PUBLISHED;
  if (!published) {
    try {
      const response = await fetch(EXTENSION_STORE_URL, { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const html = await response.text();
        const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "";
        published = /(?:EzNoting|ClassNoting)/i.test(title) && html.includes(STORE_EXTENSION_ID);
      }
    } catch { /* Keep the pending state when the storefront cannot be verified. */ }
  }
  return NextResponse.json({ published }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
}
