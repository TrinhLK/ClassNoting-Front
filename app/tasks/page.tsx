"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTaskExtraction } from "../hooks/useTaskExtraction";
import { Meeting, Member, getMembers, getAllMeetings } from "../lib/db";
import PageHeader from "../components/ui/PageHeader";
import AppShell from "../components/AppShell";
import Spinner from "../components/ui/Spinner";
import TaskList from "../components/Tasks/TaskList";

export default function TaskManagerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const { isProcessing, selectedMeeting, extractActionItems } = useTaskExtraction();

  const fetchMeetings = useCallback(() => {
    if (!user) return;
    setLoadingMeetings(true);
    getAllMeetings(user.uid)
      .then((data) => setMeetings(data.filter((m) => !m.isDeleted)))
      .finally(() => setLoadingMeetings(false));
    getMembers(user.uid).then(setMembers);
  }, [user]);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  if (loading) {
    return <div className="h-screen flex items-center justify-center"><Spinner size="xl" /></div>;
  }

  return (
    <AppShell hideTopbar>
      <div className="flex flex-col h-full bg-slate-50 font-sans overflow-hidden">
        <PageHeader variant="default" sticky title="Danh sách cuộc họp cần xử lý" subtitle="Trích xuất công việc từ biên bản bằng AI" icon={<ClipboardList className="w-5 h-5" />} />
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <TaskList
            meetings={meetings}
            loading={loadingMeetings}
            isProcessing={isProcessing}
            selectedMeetingId={selectedMeeting?.id || null}
            onOpenMeeting={(m) => router.push(`/meeting/${m.id}`)}
            onViewDetails={(m) => router.push(`/tasks/${m.id}`)}
            onExtract={(m) => extractActionItems(m, members)}
          />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
