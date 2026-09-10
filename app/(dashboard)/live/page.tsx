"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGlobalUI } from "@/app/context/GlobalUIProvider";
import LiveRecordingState from "@/app/components/LiveRecordingState";

function LiveRecordingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useGlobalUI();

  const language = (searchParams.get("lang") as "vi" | "en") || "vi";
  const title = searchParams.get("title") || "";
  const objectives = searchParams.get("objectives") || "";

  return (
    <LiveRecordingState
      initialLanguage={language}
      initialTitle={title || `Cuộc họp trực tiếp ${new Date().toLocaleDateString("vi-VN")}`}
      initialObjectives={objectives}
      onFinish={() => {
        toast.success("Đã lưu ghi âm!");
        router.push("/");
      }}
      onBack={() => router.push("/")}
    />
  );
}

export default function LiveRecordingPage() {
  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LiveRecordingContent />
    </Suspense>
  );
}
