"use client";

import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || "";

// Kiểu tối thiểu cho chrome.runtime.sendMessage (không cần @types/chrome).
type ChromeRuntimeShape = {
  runtime?: {
    sendMessage?: (extensionId: string, message: unknown) => Promise<unknown>;
  };
};
declare const chrome: ChromeRuntimeShape | undefined;

/**
 * Cầu xác thực web app → Chrome extension.
 * Khi user đăng nhập app, đẩy Firebase ID Token sang extension (nếu đã cài)
 * để extension gọi /api/extension/* mà không cần đăng nhập lần 2.
 * Im lặng khi chưa cài extension / chưa cấu hình ID.
 */
export default function ExtensionBridge() {
  const { user } = useAuth();

  useEffect(() => {
    if (!EXTENSION_ID) return;
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
    if (!user) return;

    let cancelled = false;
    const push = async () => {
      try {
        const idToken = await user.getIdToken();
        if (cancelled) return;
        await chrome.runtime?.sendMessage?.(EXTENSION_ID, {
          type: "CLASSNOTING_AUTH",
          idToken,
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        });
      } catch {
        // Extension chưa cài / chặn message → bỏ qua trong im lặng.
      }
    };

    push();
    // Refresh định kỳ (ID token hạn ~1h) để extension luôn có token sống.
    const timer = setInterval(push, 50 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user]);

  return null;
}
