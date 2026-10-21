import { NextResponse } from "next/server";
import { verifyExtensionAuth } from "@/app/lib/extension-auth";
import { getAdminDb } from "@/app/lib/firebase-admin";
import { checkRateLimit } from "@/app/lib/rate-limit";

export async function POST(req: Request) {
  const auth = await verifyExtensionAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!checkRateLimit(`account-activity:${auth.uid}`, 2, 60_000).allowed) return new NextResponse(null, { status: 204 });
  const ref = getAdminDb().collection("server_account_activity").doc(auth.uid);
  try {
    await getAdminDb().runTransaction(async tx => {
      const snap = await tx.get(ref);
      const now = Date.now();
      if (now - (snap.data()?.lastSeenAt || 0) >= 120_000) tx.set(ref, { lastSeenAt: now });
    });
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Không cập nhật được hoạt động." }, { status: 503 }); }
}
