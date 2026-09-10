"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getMeetingById, Meeting } from "@/app/lib/db";
import { resolveAudioUrl } from "@/app/lib/utils/audio";
import { useSummarize } from "@/app/hooks/useSummarize";
import MeetingDetailState from "@/app/components/MeetingDetailState";

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params?.id as string;
  const summarize = useSummarize();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meetingId) return;
    let objectUrl: string | null = null;

    const load = async () => {
      try {
        setLoading(true);
        let data = await getMeetingById(meetingId);

        // Fallback: Nếu không thấy trên Firestore, thử tìm trong IndexedDB (draft local)
        if (!data) {
          try {
            const { getDraftFull } = await import("@/app/lib/indexedDB");
            const draft = await getDraftFull(meetingId);
            if (draft) data = draft.meta;
          } catch (e) {
            console.error("IndexedDB fallback failed:", e);
          }
        }

        if (!data) {
          setError("Cuộc họp không tồn tại");
          return;
        }
        setMeeting(data);
        const url = await resolveAudioUrl(data);
        if (url && url.startsWith("blob:")) objectUrl = url;
        setAudioUrl(url);
      } catch (e) {
        console.error("Failed to load meeting", e);
        setError("Không thể tải dữ liệu cuộc họp");
      } finally {
        setLoading(false);
      }
    };
    load();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [meetingId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-slate-500">{error || "Không tìm thấy"}</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Về Dashboard
        </button>
      </div>
    );
  }

  return (
    <MeetingDetailState
      meeting={meeting}
      audioSrc={audioUrl}
      onBack={() => router.push("/")}
      onEdit={() => router.push(`/edit/${meeting.id}`)}
      onSummarize={summarize}
    />
  );
}
