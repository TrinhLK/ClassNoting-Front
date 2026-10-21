import { NextResponse } from "next/server";
import { getAdminAuth } from "./firebase-admin";
import { isSystemAdminIdentity } from "./admin-identity";

export async function verifySystemAdmin(req: Request) {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  try {
    const auth = getAdminAuth();
    const token = await auth.verifyIdToken(header.slice(7), true);
    if (!isSystemAdminIdentity({ uid: token.uid, email: token.email, emailVerified: token.email_verified })) {
      return NextResponse.json({ error: "Không có quyền quản trị." }, { status: 403 });
    }
    // Check the current Auth record too: revoked, disabled or changed accounts
    // must not retain administrator access through an old token.
    const user = await auth.getUser(token.uid);
    if (user.disabled || !isSystemAdminIdentity(user) || !user.providerData.some(p => p.providerId === "google.com")) {
      return NextResponse.json({ error: "Không có quyền quản trị." }, { status: 403 });
    }
    return { uid: user.uid };
  } catch { return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ hoặc đã bị thu hồi." }, { status: 401 }); }
}
