"use client";

import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { EXTENSION_IDS, messageExtension } from "../lib/extension-config";

/**
 * Cầu xác thực web app → Chrome extension.
 * Khi user đăng nhập app, đẩy Firebase ID Token sang extension (nếu đã cài)
 * để extension gọi /api/extension/* mà không cần đăng nhập lần 2.
 * Im lặng khi chưa cài extension / chưa cấu hình ID.
 */
export default function ExtensionBridge() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const push = async () => {
      try {
        const idToken = await user.getIdToken();
        if (cancelled) return;
        await Promise.all(EXTENSION_IDS.map(id => messageExtension(id, {
          type: "CLASSNOTING_AUTH",
          idToken,
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        })));
      } catch {
        // Extension chưa cài / chặn message → bỏ qua trong im lặng.
      }
    };

    push();
    // Refresh định kỳ (ID token hạn ~1h) để extension luôn có token sống.
    const timer = setInterval(push, 50 * 60 * 1000);
    // Đẩy lại khi tab focus / có mạng: vá khoảng trống khi extension được
    // cài-reload sau khi web đã load (lần push lúc mount đã rơi vào khoảng không).
    window.addEventListener("focus", push);
    window.addEventListener("online", push);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", push);
      window.removeEventListener("online", push);
    };
  }, [user]);

  return null;
}
