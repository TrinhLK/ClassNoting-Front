"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Meeting, Member, updateMeetingProcess } from "../lib/db";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { parseAiJson } from "../lib/json-parser";
import { postGemini } from "../lib/api";
import { meetingAiSessionId } from "../lib/ai-session";

export function useTaskExtraction() {
  const { toast, confirm } = useGlobalUI();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const extractActionItems = useCallback(async (meeting: Meeting, members: Member[]) => {
    if (meeting.actionItems && meeting.actionItems.length > 0) {
      const ok = await confirm({
        title: "Cảnh báo làm lại",
        message: "Cuộc họp này đã có dữ liệu task. Việc trích xuất lại sẽ XÓA các chỉnh sửa cũ.",
        confirmText: "Đồng ý làm lại",
        type: "danger",
      });
      if (!ok) return;
    }

    if (!meeting.segments) {
      toast.error("Cuộc họp này chưa có nội dung transcript!");
      return;
    }

    setSelectedMeeting(meeting);
    setIsProcessing(true);

    try {
      const fullTranscript = meeting.segments
        .map((seg) => {
          const name = meeting.speakers.find((s) => s.id === seg.speakerId)?.name || seg.speakerId;
          return `${name}: ${seg.text}`;
        })
        .join("\n");

      const uniqueDepartments = Array.from(new Set(members.map((m) => m.department).filter(Boolean)));
      const uniqueTeams = Array.from(new Set(members.map((m) => m.team).filter(Boolean)));

      const response = await postGemini({
        text: fullTranscript,
        mode: "extract_json",
        sessionId: meetingAiSessionId("tasks", meeting.id),
        departments: uniqueDepartments,
        teams: uniqueTeams,
        prompt_instruction: `Bạn là thư ký chuyên nghiệp. Hãy trích xuất Action Items.`,
        dateContext: new Date(meeting.createdAt).toLocaleString("vi-VN"),
      });
      const data = response;

      let rawTasks: any[];
      try {
        const parsed = parseAiJson(data.summary, "extract_json", "array");
        rawTasks = Array.isArray(parsed) ? parsed : [];
      } catch {
        toast.error("AI trả về dữ liệu lỗi. Hãy thử lại!");
        return;
      }

      const normalize = (str: any) => String(str || "").normalize("NFC").toLowerCase().trim();
      const prefixes = ["ông ", "bà ", "anh ", "chị ", "em ", "sếp ", "bạn ", "cậu ", "cô ", "chú ", "bác ", "ong ", "ba ", "sep ", "ban ", "cau ", "co ", "chu ", "bac ", "mr ", "ms ", "mrs ", "to ", "nhom ", "doi ", "team "];

      const mappedTasks = rawTasks.map((t: any, index: number) => {
        let detectedEmails: string[] = [];
        const names = (t.assignee || "").split(/,|;| và | vs | and /).map((n: string) => n.trim());
        names.forEach((rawName: string) => {
          if (!rawName) return;
          let targetName = normalize(rawName);
          for (const p of prefixes) {
            if (targetName.startsWith(p)) { targetName = targetName.replace(p, "").trim(); break; }
          }
          if (["chua ro", "moi nguoi", "ca phong", "all"].includes(targetName)) return;
          const matched = members.find((m) => {
            const memName = normalize(m.name);
            return memName === targetName || memName.split(" ").some((w) => w === targetName) || (targetName.length > 1 && memName.includes(targetName));
          });
          if (matched) detectedEmails.push(matched.email);
        });

        let groupEmails: string[] = [];
        if (t.team) groupEmails = members.filter((m) => normalize(m.team) === normalize(t.team)).map((m) => m.email);
        else if (t.department) groupEmails = members.filter((m) => normalize(m.department) === normalize(t.department)).map((m) => m.email);

        if (detectedEmails.length > 0 && groupEmails.length > 0) {
          if (!detectedEmails.every((e) => groupEmails.includes(e))) detectedEmails = [...detectedEmails, ...groupEmails];
        } else if (detectedEmails.length === 0 && groupEmails.length > 0) {
          detectedEmails = groupEmails;
        }

        return { id: index, task: t.task, assigneeName: t.assignee, email: [...new Set(detectedEmails)], department: t.department, team: t.team, deadline: t.deadline };
      });

      const unmatched = mappedTasks.filter((t: any) => t.email.length === 0);
      if (unmatched.length > 0) toast.warning(`Có ${unmatched.length} nhiệm vụ không tìm thấy người thực hiện.`);
      await updateMeetingProcess(meeting.id, { actionItems: mappedTasks, actionStatus: "draft" });
      router.push(`/tasks/${meeting.id}`);
    } catch (e) {
      console.error(e);
      toast.error("Lỗi khi đọc dữ liệu từ AI.");
    } finally {
      setIsProcessing(false);
    }
  }, [toast, confirm, router]);

  return { isProcessing, selectedMeeting, extractActionItems };
}
