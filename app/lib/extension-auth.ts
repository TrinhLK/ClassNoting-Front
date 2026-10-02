import { NextResponse } from "next/server";
import { getAdminAuth } from "@/app/lib/firebase-admin";

export interface ExtensionAuth {
  uid: string;
  email?: string;
  displayName?: string;
}

/**
 * Xác thực extension bằng Firebase ID Token tái dùng từ web app
 * (lấy qua extension-bridge). Trả về auth hoặc Response 401.
 */
export async function verifyExtensionAuth(
  req: Request
): Promise<ExtensionAuth | NextResponse> {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(header.slice(7));
    return {
      uid: decoded.uid,
      email: decoded.email,
      displayName: decoded.name,
    };
  } catch (e) {
    console.error("[ExtensionAuth] verify failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
