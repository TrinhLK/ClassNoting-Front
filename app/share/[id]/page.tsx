"use client";
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getMeetingByShareId } from "../../lib/db";
import MeetingDetailState from "../../components/MeetingDetailState";
import { Loader2, Link } from "lucide-react";

export default function SharedMeetingPage() {
  const params = useParams();
  const id = params.id as string;
  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getMeetingByShareId(id).then((data) => {
      setMeeting(data);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50">
        <Link className="w-12 h-12 text-slate-300 mb-4" />
        <div className="text-xl font-bold text-slate-800">Không tìm thấy biên bản cuộc họp</div>
        <p className="text-slate-500 mt-2">Link chia sẻ có thể đã hết hạn hoặc không tồn tại.</p>
      </div>
    );
  }

  return (
    <MeetingDetailState
      meeting={meeting}
      audioSrc={meeting.audioUrl || ""}
      onBack={() => {
         // Với quyền xem công khai, điều hướng về trang chủ hoặc landing page
         window.location.href = '/'; 
      }}
      onEdit={() => {}} // Khách không có quyền Edit
      isReadOnly={true} // Bật cờ khóa UI
    />
  );
}
