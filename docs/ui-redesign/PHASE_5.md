# Phase 5 — Trang phụ (Tasks / Team / Training / Live)

> **Tham chiếu:** Plan tổng thể ở [`UI-IMPROVEMENT-PLAN.md`](./UI-IMPROVEMENT-PLAN.md) Phần B. File này ghi lại chi tiết implementation Phase 5.
> **Yêu cầu:** Phase 0 + 1 + 2 + 3 + 4 hoàn thành.

## Tổng quan

| Sub-phase | Nội dung | Trạng thái |
|-----------|----------|-----------|
| **5.1 Tasks: Tách `useTaskExtraction` hook** | Tách AI extract logic | ⏳ |
| **5.2 Tasks: Tạo `TaskList` component** | Danh sách task đẹp | ⏳ |
| **5.3 Tasks: Redesign `tasks/page.tsx`** | Header + list đẹp | ⏳ |
| **5.4 Team: Tạo `MemberFormModal`** | Tách form inline | ⏳ |
| **5.5 Team: Tạo `DepartmentTree` component** | Tách tree view | ⏳ |
| **5.6 Team: Tạo `MemberCard` component** | Card cho member | ⏳ |
| **5.7 Team: Redesign `team/page.tsx`** | Dùng components mới | ⏳ |
| **5.8 Live: Redesign `Live/Controls.tsx`** | Dùng `<Button>` chuẩn | ⏳ |
| **5.9 Live: Redesign `Live/StatusBar.tsx`** | Dùng `<ProgressBar>` | ⏳ |
| **5.10 Live: Redesign `Live/Header.tsx`** | Dùng `<PageHeader>` | ⏳ |
| **5.11 Live: Redesign `Live/TranscriptView.tsx`** | Dùng `<TranscriptRow>` (Phase 3) | ⏳ |
| **5.12 Live: Redesign `LiveRecordingState.tsx`** | Tách hooks, dùng components | ⏳ |
| **5.13 Training: Review & apply nếu có page** | | ⏳ |
| **Verify** | Build + Lint + Test | ⏳ |

**Tổng effort ước tính:** 1-2 ngày
**Số commits khuyến nghị:** 3-4 commit (Tasks, Team, Live, Training)

---

## 5.1 Tasks: Tách `useTaskExtraction` hook

### Lý do
- `tasks/page.tsx:106-333` có ~230 dòng logic AI extract
- Tách ra hook riêng để code dễ đọc, dễ test

### File: `app/hooks/useTaskExtraction.ts` (MỚI)
```ts
"use client";
import { useState, useCallback } from "react";
import { Meeting, Member, updateMeetingProcess } from "../lib/db";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { useRouter } from "next/navigation";

export function useTaskExtraction() {
  const { toast, confirm } = useGlobalUI();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const extractActionItems = useCallback(async (meeting: Meeting, members: Member[]) => {
    if (meeting.actionItems && meeting.actionItems.length > 0) {
      const isConfirmed = await confirm({
        title: "Cảnh báo làm lại",
        message: "Cuộc họp này đã có dữ liệu task. Việc trích xuất lại sẽ XÓA các chỉnh sửa cũ.",
        confirmText: "Đồng ý làm lại",
        type: "danger",
      });
      if (!isConfirmed) return;
    }

    if (!meeting.segments) {
      toast.error("Cuộc họp này chưa có nội dung transcript!");
      return;
    }

    setSelectedMeeting(meeting);
    setIsProcessing(true);

    try {
      // 1. Build full transcript
      const fullTranscript = meeting.segments.map((seg) => {
        const speakerKey = seg.speakerId;
        const matchedSpeaker = meeting.speakers.find((s) => s.id === speakerKey);
        const displayName = matchedSpeaker ? matchedSpeaker.name : speakerKey;
        return `${displayName}: ${seg.text}`;
      }).join("\n");

      // 2. Get unique departments/teams
      const uniqueDepartments = Array.from(new Set(members.map((m) => m.department).filter(Boolean)));
      const uniqueTeams = Array.from(new Set(members.map((m) => m.team).filter(Boolean)));

      // 3. Call AI
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: fullTranscript,
          mode: "extract_json",
          departments: uniqueDepartments,
          teams: uniqueTeams,
          prompt_instruction: `
            Bạn là thư ký chuyên nghiệp. Hãy trích xuất Action Items.
            QUY TẮC VỀ NGƯỜI THỰC HIỆN (assignee):
            1. Nếu giao cho nhiều người: Liệt kê tên ngăn cách bằng dấu phẩy (VD: "Hùng, Nam").
            2. Nếu giao cho "cả team" hoặc "mọi người":
               -> Liệt kê tên các nhân viên thực thi.
               -> TUYỆT ĐỐI KHÔNG điền tên người ra lệnh (Sếp) vào (trừ khi họ tự nhận).
            3. Ví dụ: Sếp Tuấn bảo "Các em Hùng, Lan làm báo cáo nhé" -> Assignee: "Hùng, Lan".
          `,
          dateContext: new Date(meeting.createdAt).toLocaleString("vi-VN"),
        }),
      });
      const data = await response.json();

      // 4. Parse JSON
      const jsonMatch = data.summary.match(/\[[\s\S]*\]/);
      let cleanJson = "[]";
      if (jsonMatch) {
        cleanJson = jsonMatch[0];
      } else {
        const objectMatch = data.summary.match(/\{[\s\S]*\}/);
        if (objectMatch) cleanJson = `[${objectMatch[0]}]`;
      }

      let rawTasks: any[];
      try {
        rawTasks = JSON.parse(cleanJson);
      } catch (error) {
        return toast.error("AI trả về dữ liệu lỗi. Hãy thử lại!");
      }

      // 5. Map names to emails
      const mappedTasks = rawTasks.map((t, index) => {
        // ... (logic mapping giữ nguyên như cũ)
        const normalize = (str: any) =>
          str ? String(str).normalize("NFC").toLowerCase().trim() : "";

        let detectedEmails: string[] = [];
        const names = t.assignee
          ? t.assignee.split(/,|;| và | vs | and /).map((n: string) => n.trim())
          : [];

        const prefixes = [
          "ông ", "bà ", "anh ", "chị ", "em ", "sếp ", "bạn ", "cậu ", "cô ", "chú ", "bác ",
          "ong ", "ba ", "sep ", "ban ", "cau ", "co ", "chu ", "bac ",
          "mr ", "ms ", "mrs ", "to ", "nhom ", "doi ", "team "
        ];

        names.forEach((rawName: string) => {
          if (!rawName) return;
          let targetName = normalize(rawName);
          for (const p of prefixes) {
            if (targetName.startsWith(p)) {
              targetName = targetName.replace(p, "").trim();
              break;
            }
          }
          if (["chua ro", "moi nguoi", "ca phong", "all"].some((k) => targetName === k)) return;

          const matchedMember = members.find((m) => {
            const memName = normalize(m.name);
            if (memName === targetName) return true;
            const words = memName.split(" ");
            if (words.some((w) => w === targetName)) return true;
            if (targetName.length > 1 && memName.includes(targetName)) return true;
            return false;
          });

          if (matchedMember) detectedEmails.push(matchedMember.email);
        });

        let groupEmails: string[] = [];
        if (t.team) {
          const targetTeam = normalize(t.team);
          groupEmails = members.filter((m) => normalize(m.team) === targetTeam).map((m) => m.email);
        } else if (t.department) {
          const targetDept = normalize(t.department);
          groupEmails = members.filter((m) => normalize(m.department) === targetDept).map((m) => m.email);
        }

        if (detectedEmails.length > 0 && groupEmails.length > 0) {
          const isSubset = detectedEmails.every((email) => groupEmails.includes(email));
          if (!isSubset) detectedEmails = [...detectedEmails, ...groupEmails];
        } else if (detectedEmails.length === 0 && groupEmails.length > 0) {
          detectedEmails = groupEmails;
        }

        detectedEmails = [...new Set(detectedEmails)];

        return {
          id: index,
          task: t.task,
          assigneeName: t.assignee,
          email: detectedEmails,
          department: t.department,
          team: t.team,
          deadline: t.deadline,
        };
      });

      const unmatchedTasks = mappedTasks.filter((t) => t.email.length === 0);
      if (unmatchedTasks.length > 0) {
        toast.warning(`Có ${unmatchedTasks.length} nhiệm vụ không tìm thấy người thực hiện.`);
      }

      await updateMeetingProcess(meeting.id, {
        actionItems: mappedTasks,
        actionStatus: "draft",
      });
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
```

### Kết quả
- ✅ Logic AI tách riêng, dễ test
- ✅ `tasks/page.tsx` giảm từ 534 → ~250 dòng

---

## 5.2 Tasks: Tạo `TaskList` component

### Lý do
- Tách phần render list từ `tasks/page.tsx`
- Dùng card thống nhất với MeetingCard (Phase 2)

### File: `app/components/Tasks/TaskList.tsx` (MỚI)
```tsx
"use client";
import { useRouter } from "next/navigation";
import {
  Calendar, Mail, CheckCircle, Clock, Eye, RotateCcw, Loader2,
  ArrowRightFromLine
} from "lucide-react";
import type { Meeting } from "../../lib/db";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import EmptyState from "../ui/EmptyState";
import { cn } from "../../lib/cn";

interface TaskListProps {
  meetings: Meeting[];
  loading: boolean;
  isProcessing: boolean;
  selectedMeetingId: string | null;
  onOpenMeeting: (m: Meeting) => void;
  onViewDetails: (m: Meeting) => void;
  onExtract: (m: Meeting) => void;
}

const STATUS_CONFIG = {
  draft: { label: "Chưa xử lý", intent: "neutral", icon: Clock },
  sent: { label: "Đã gửi mail", intent: "success", icon: Mail },
  extracted: { label: "Đã xử lý", intent: "primary", icon: CheckCircle },
} as const;

export default function TaskList({
  meetings, loading, isProcessing, selectedMeetingId,
  onOpenMeeting, onViewDetails, onExtract
}: TaskListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
            <div className="space-y-3">
              <div className="h-5 bg-slate-200 rounded w-2/3" />
              <div className="h-4 bg-slate-100 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle className="w-8 h-8" />}
        title="Không tìm thấy cuộc họp nào"
        description="Tạo cuộc họp trước, sau đó quay lại trích xuất task."
      />
    );
  }

  return (
    <div className="space-y-3">
      {meetings.map((meeting) => {
        const hasData = meeting.actionItems && meeting.actionItems.length > 0;
        const status = meeting.actionStatus === "sent"
          ? "sent"
          : hasData ? "extracted" : "draft";
        const config = STATUS_CONFIG[status];
        const StatusIcon = config.icon;
        const isProcessingThis = isProcessing && selectedMeetingId === meeting.id;

        return (
          <div
            key={meeting.id}
            className="bg-white rounded-2xl border border-slate-200 hover:shadow-md transition-shadow p-5"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Avatar
                  name={meeting.title}
                  size="md"
                  colorScheme={{ bg: "bg-primary-100", text: "text-primary-600" }}
                />
                <div className="flex-1 min-w-0">
                  <h3
                    onClick={() => onOpenMeeting(meeting)}
                    className="font-bold text-lg text-slate-800 hover:text-primary-600 cursor-pointer transition-colors line-clamp-1"
                  >
                    {meeting.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 mt-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(meeting.createdAt).toLocaleString("vi-VN")}
                    </span>
                    <span className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border",
                      config.intent === "success" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                      config.intent === "primary" && "bg-primary-50 text-primary-700 border-primary-200",
                      config.intent === "neutral" && "bg-slate-50 text-slate-600 border-slate-200"
                    )}>
                      <StatusIcon className="w-3 h-3" />
                      {config.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {hasData ? (
                  <>
                    <Button intent="primary" size="sm" onClick={() => onViewDetails(meeting)} leftIcon={<Eye className="w-4 h-4" />}>
                      Xem chi tiết
                    </Button>
                    <Button
                      intent="ghost"
                      size="sm"
                      onClick={() => onExtract(meeting)}
                      disabled={isProcessing}
                      aria-label="Trích xuất lại"
                      title="Trích xuất lại"
                    >
                      {isProcessingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    </Button>
                  </>
                ) : (
                  <Button
                    intent="primary"
                    size="sm"
                    onClick={() => onExtract(meeting)}
                    disabled={!meeting.segments || isProcessing}
                    leftIcon={isProcessingThis ? undefined : <ArrowRightFromLine className="w-4 h-4" />}
                    loading={isProcessingThis}
                  >
                    {isProcessingThis ? "Đang xử lý..." : "Trích xuất Task"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### Kết quả
- ✅ Card đẹp, dùng `<Button>`, `<Badge>`, `<Avatar>`, `<EmptyState>` chuẩn
- ✅ Status badge với icon

---

## 5.3 Tasks: Redesign `tasks/page.tsx`

### Lý do
- File 534 dòng, dùng `alert()` + `confirm()` native
- Cần redesign header + dùng `TaskList` + `useTaskExtraction`

### File: `app/tasks/page.tsx` (CẬP NHẬT)
```tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardList, ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTaskExtraction } from "../hooks/useTaskExtraction";
import { Meeting, Member, getMembers, getAllMeetings } from "../lib/db";
import PageHeader from "../components/ui/PageHeader";
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
    if (user) {
      setLoadingMeetings(true);
      getAllMeetings(user.uid)
        .then((data) => setMeetings(data.filter((m) => !m.isDeleted)))
        .finally(() => setLoadingMeetings(false));
      getMembers(user.uid).then(setMembers);
    }
  }, [user]);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-slate-500">Vui lòng đăng nhập để sử dụng tính năng này.</p>
        <Link href="/" className="px-4 py-2 bg-primary-600 text-white rounded-lg">Về trang chủ</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 font-sans overflow-hidden">
      <PageHeader
        variant="default"
        sticky
        onBack={() => router.push("/")}
        title="Danh sách cuộc họp cần xử lý"
        subtitle="Trích xuất công việc từ biên bản bằng AI"
        icon={<ClipboardList className="w-5 h-5" />}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-6">
            Trích xuất công việc từ biên bản
          </h2>

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
  );
}
```

### Kết quả
- ✅ File gọn từ 534 → ~100 dòng
- ✅ Header đồng nhất
- ✅ Không còn `alert()` / `confirm()` native (dùng `useGlobalUI`)

---

## 5.4 Team: Tạo `MemberFormModal`

### Lý do
- Form inline trong `team/page.tsx` (dòng ~280-435) → tách ra modal riêng

### File: `app/components/Team/MemberFormModal.tsx` (MỚI)
```tsx
"use client";
import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import Modal from "../ui/Modal";
import Input from "../ui/Input";
import Select from "../ui/Select";
import Button from "../ui/Button";
import { useGlobalUI } from "../../context/GlobalUIProvider";
import { Member, saveMember } from "../../lib/db";

interface MemberFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingMember?: Partial<Member>;
  userId: string;
  departmentSuggestions: string[];
  teamSuggestions: string[];
}

export default function MemberFormModal({
  isOpen, onClose, onSuccess, editingMember, userId,
  departmentSuggestions, teamSuggestions
}: MemberFormModalProps) {
  const { toast } = useGlobalUI();
  const [form, setForm] = useState<Partial<Member>>(editingMember || { name: "", email: "", department: "", team: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setForm(editingMember || { name: "", email: "", department: "", team: "" });
  }, [isOpen, editingMember]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.department) {
      toast.error("Vui lòng điền đủ thông tin bắt buộc");
      return;
    }
    setSaving(true);
    try {
      await saveMember(userId, form as Member);
      toast.success(editingMember?.id ? "Đã cập nhật nhân viên" : "Đã thêm nhân viên mới");
      onSuccess();
      onClose();
    } catch (error) {
      toast.error("Lỗi khi lưu dữ liệu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingMember?.id ? "Sửa nhân viên" : "Thêm nhân viên mới"}
      icon={<UserPlus className="w-5 h-5" />}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button intent="outline" onClick={onClose}>Hủy</Button>
          <Button intent="primary" onClick={handleSave} loading={saving} leftIcon={<Save className="w-4 h-4" />}>
            {editingMember?.id ? "Cập nhật" : "Thêm"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSave} className="space-y-4">
        <Input
          label="Họ và tên *"
          value={form.name || ""}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          label="Email *"
          type="email"
          value={form.email || ""}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Select
          label="Phòng ban *"
          value={form.department || ""}
          onChange={(e) => setForm({ ...form, department: e.target.value })}
          options={[
            ...departmentSuggestions.map(d => ({ value: d, label: d })),
          ]}
        />
        <Input
          label="Team"
          value={form.team || ""}
          onChange={(e) => setForm({ ...form, team: e.target.value })}
        />
      </form>
    </Modal>
  );
}
```

### Kết quả
- ✅ Form tách riêng, dùng `<Modal>`, `<Input>`, `<Select>` chuẩn
- ✅ Auto-fill suggestions

---

## 5.5 Team: Tạo `DepartmentTree` component

### Lý do
- Tree view phức tạp trong `team/page.tsx` (dòng 237-435) → tách ra component

### File: `app/components/Team/DepartmentTree.tsx` (MỚI)
```tsx
"use client";
import { useState, useMemo } from "react";
import { Building2, ChevronRight, ChevronDown, Plus, User as UserIcon, Trash2, Edit2, Search } from "lucide-react";
import type { Member } from "../../lib/db";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import Input from "../ui/Input";
import EmptyState from "../ui/EmptyState";
import { cn } from "../../lib/cn";

interface DepartmentTreeProps {
  members: Member[];
  expandedNodes: Set<string>;
  onToggleNode: (id: string) => void;
  onAddMember: (defaultDept?: string, defaultTeam?: string) => void;
  onEditMember: (m: Member) => void;
  onDeleteMember: (m: Member) => void;
  searchTerm: string;
  onSearchChange: (q: string) => void;
}

export default function DepartmentTree({
  members, expandedNodes, onToggleNode,
  onAddMember, onEditMember, onDeleteMember,
  searchTerm, onSearchChange
}: DepartmentTreeProps) {
  const query = searchTerm.toLowerCase();
  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(query) ||
    m.email.toLowerCase().includes(query) ||
    m.department?.toLowerCase().includes(query) ||
    m.team?.toLowerCase().includes(query)
  );

  const grouped = useMemo(() => {
    const groups: Record<string, Record<string, Member[]>> = {};
    filtered.forEach((member) => {
      const dept = member.department || "Khác (Chưa phân phòng)";
      const team = member.team || "Chung";
      if (!groups[dept]) groups[dept] = {};
      if (!groups[dept][team]) groups[dept][team] = [];
      groups[dept][team].push(member);
    });
    return groups;
  }, [filtered]);

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="w-8 h-8" />}
        title={searchTerm ? "Không tìm thấy nhân sự" : "Chưa có nhân sự nào"}
        description={searchTerm ? "Thử từ khóa khác." : "Tạo nhân sự đầu tiên để bắt đầu."}
        action={
          !searchTerm ? (
            <Button intent="primary" onClick={() => onAddMember()}>
              Tạo nhân sự đầu tiên
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Search */}
      <div className="p-4 border-b border-slate-200">
        <Input
          placeholder="Tìm theo tên, email, phòng ban..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
        />
      </div>

      {/* Tree */}
      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([deptName, teams]) => {
        const isExpanded = expandedNodes.has(deptName);
        const totalCount = Object.values(teams).flat().length;
        return (
          <div key={deptName} className="border-b border-slate-100 last:border-0">
            <DeptNode
              name={deptName}
              count={totalCount}
              isExpanded={isExpanded}
              onToggle={() => onToggleNode(deptName)}
              onAdd={() => onAddMember(deptName, "")}
            />
            {isExpanded && (
              <div className="pl-4 md:pl-8 pr-2 md:pr-4 bg-white">
                {Object.entries(teams).sort(([a], [b]) => a.localeCompare(b)).map(([teamName, membersInTeam]) => (
                  <TeamNode
                    key={teamName}
                    deptName={deptName}
                    teamName={teamName}
                    members={membersInTeam}
                    isExpanded={expandedNodes.has(`${deptName}::${teamName}`)}
                    onToggle={() => onToggleNode(`${deptName}::${teamName}`)}
                    onAdd={() => onAddMember(deptName, teamName)}
                    onEdit={onEditMember}
                    onDelete={onDeleteMember}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DeptNode({ name, count, isExpanded, onToggle, onAdd }: { name: string; count: number; isExpanded: boolean; onToggle: () => void; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 hover:bg-primary-50/50 cursor-pointer transition-colors group">
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1" onClick={onToggle}>
        <button className="text-slate-400 group-hover:text-primary-600 transition-colors shrink-0">
          {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
        <Building2 className="w-5 h-5 text-primary-500 shrink-0" />
        <h2 className="text-base md:text-lg font-bold text-slate-800 truncate">{name}</h2>
        <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full font-medium">
          {count} nhân sự
        </span>
      </div>
      <Button intent="ghost" size="sm" onClick={onAdd} leftIcon={<Plus className="w-4 h-4" />} className="opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="hidden sm:inline">Thêm</span>
      </Button>
    </div>
  );
}

function TeamNode({ deptName, teamName, members, isExpanded, onToggle, onAdd, onEdit, onDelete }: any) {
  return (
    <div className="border-l-2 border-slate-100 ml-2 md:ml-5">
      <div
        className="flex items-center justify-between p-2 md:p-3 hover:bg-slate-50 cursor-pointer transition-colors group"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button className="text-slate-400 group-hover:text-primary-600 transition-colors shrink-0">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <UserIcon className="w-4 h-4 text-slate-500 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-700 truncate">{teamName}</h3>
          <span className="text-xs text-slate-500">({members.length})</span>
        </div>
        <Button intent="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onAdd(); }} className="opacity-0 group-hover:opacity-100 transition-opacity">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {isExpanded && (
        <div className="pl-4 md:pl-6 pb-2 space-y-1.5">
          {members.map((m: Member) => (
            <MemberCard key={m.id} member={m} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberCard({ member, onEdit, onDelete }: { member: Member; onEdit: (m: Member) => void; onDelete: (m: Member) => void }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 group">
      <Avatar name={member.name} size="sm" colorScheme={{ bg: "bg-primary-100", text: "text-primary-700" }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{member.name}</p>
        <p className="text-xs text-slate-500 truncate">{member.email}</p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button intent="ghost" size="sm" onClick={() => onEdit(member)} aria-label="Sửa">
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        <Button intent="ghost" size="sm" onClick={() => onDelete(member)} aria-label="Xóa" className="text-red-600 hover:bg-red-50">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
```

### Kết quả
- ✅ Tree view tách riêng, dễ đọc
- ✅ Dùng `<Button>`, `<Input>`, `<Avatar>`, `<EmptyState>` chuẩn
- ✅ Hover action rõ ràng

---

## 5.6 Team: Tạo `MemberCard` component

Đã tích hợp vào `DepartmentTree.tsx` ở 5.5.

---

## 5.7 Team: Redesign `team/page.tsx`

### Lý do
- File 435 dòng, lẫn logic + form + tree render
- Tách hết rồi, file chỉ còn coordinator

### File: `app/team/page.tsx` (CẬP NHẬT)
```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { getMembers, deleteMember, getExistingDepartments, Member } from "../lib/db";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";
import DepartmentTree from "../components/Team/DepartmentTree";
import MemberFormModal from "../components/Team/MemberFormModal";

const DEFAULT_DEPARTMENTS = [
  "Ban Giám Đốc", "Phòng IT", "Phòng Kế toán",
  "Phòng Nhân sự", "Phòng Marketing", "Phòng Sale", "Phòng Vận hành"
];

export default function TeamPage() {
  const { user, loading } = useAuth();
  const { toast, confirm } = useGlobalUI();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [deptSuggestions, setDeptSuggestions] = useState<string[]>(DEFAULT_DEPARTMENTS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Partial<Member>>({});

  // ... useEffect fetch, handlers (giữ nguyên)

  // ... (render đơn giản hơn nhiều)
  return (
    <div className="flex flex-col h-full bg-slate-50 font-sans text-slate-800 overflow-hidden">
      <PageHeader
        variant="default"
        sticky
        onBack={() => router.push("/")}
        title="Quản lý Nhân sự"
        subtitle="Danh bạ dùng để giao việc tự động"
        icon={<Users className="w-5 h-5" />}
        actions={
          <Button intent="primary" onClick={() => { setEditingMember({}); setIsModalOpen(true); }} leftIcon={<Plus className="w-4 h-4" />}>
            Thêm nhân sự
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <DepartmentTree
            members={members}
            expandedNodes={expandedNodes}
            onToggleNode={toggleNode}
            onAddMember={(defaultDept, defaultTeam) => {
              setEditingMember({ name: "", email: "", department: defaultDept || "", team: defaultTeam || "" });
              setIsModalOpen(true);
            }}
            onEditMember={(m) => { setEditingMember(m); setIsModalOpen(true); }}
            onDeleteMember={handleDelete}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
          />
        </div>
      </div>
      <MemberFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchMembers}
        editingMember={editingMember}
        userId={user!.uid}
        departmentSuggestions={deptSuggestions}
        teamSuggestions={[]}
      />
    </div>
  );
}
```

### Kết quả
- ✅ File gọn từ 435 → ~120 dòng
- ✅ Logic + UI tách bạch

---

## 5.8 Live: Redesign `Live/Controls.tsx`

### File: `app/components/Live/Controls.tsx` (CẬP NHẬT)
- Dùng `<Button>` cho play/pause/stop
- Bỏ inline `bg-slate-900`

---

## 5.9 Live: Redesign `Live/StatusBar.tsx`

### File: `app/components/Live/StatusBar.tsx` (CẬP NHẬT)
- Dùng `<ProgressBar>` (Phase 0)
- Dùng `<Badge>` cho status

---

## 5.10 Live: Redesign `Live/Header.tsx`

### File: `app/components/Live/Header.tsx` (CẬP NHẬT)
- Dùng `<PageHeader>`
- Dùng `<Button>` cho actions

(Code tương tự Phase 3.1)

---

## 5.11 Live: Redesign `Live/TranscriptView.tsx`

### Lý do
- Transcript view ở Live cũng dùng pattern tương tự Editor
- Có thể dùng chung `<TranscriptRow>` (Phase 3.2)

### File: `app/components/Live/TranscriptView.tsx` (CẬP NHẬT)
- Dùng `<TranscriptRow>` (Phase 3) thay vì code riêng
- Props tương tự: segment, speaker, isActive, isAudioPlaying, activeWordIndex

(Chi tiết implementation tương tự `Editor/SegmentList.tsx`)

---

## 5.12 Live: Redesign `LiveRecordingState.tsx`

### Lý do
- File rất lớn (theo refactor phase 2.3C), cần tách hooks

### Plan tách
- `useLiveRecording.ts` — WebSocket, audio recording
- `useLiveDraft.ts` — IndexedDB draft
- Component `LiveRecordingState.tsx` chỉ còn ~300 dòng

(Chi tiết tương tự Phase 3.7)

---

## 5.13 Training: Review & apply nếu có page

### Lý do
- Cần check xem có `app/training/page.tsx` không
- Nếu có: áp design system tương tự

### Action
```bash
ls app/training/
```

Nếu có `page.tsx`:
- Dùng `<PageHeader>`
- Dùng các component từ ui/
- Tách hooks nếu cần

---

## Verify Phase 5

### Checklist
- [ ] Vào `/tasks` → header đẹp, list dùng `<TaskList>`
- [ ] Click "Trích xuất Task" → loading → navigate `/tasks/[id]`
- [ ] Click "Làm lại" → confirm modal → xử lý lại
- [ ] Vào `/team` → header đẹp, tree view dùng `<DepartmentTree>`
- [ ] Click "+ Thêm" trong dept → modal mở với default department
- [ ] Submit form → toast success → tree refresh
- [ ] Search "Lan" → filter members
- [ ] Expand/collapse dept/team hoạt động
- [ ] Vào `/live` (nếu có) → header đẹp, controls dùng `<Button>`
- [ ] Live recording: audio level, timer, transcript đều hoạt động
- [ ] **Không còn `alert()` / `confirm()` native** (dùng `useGlobalUI`)
- [ ] `npm run build` pass
- [ ] `npm run lint` pass

### Rollback
- Revert Phase 5, restore các file cũ
- Phase 0-4 vẫn giữ

---

## Output Phase 5

Sau Phase 5:
- ✅ Tasks page gọn (534 → ~100 dòng)
- ✅ Team page gọn (435 → ~120 dòng)
- ✅ Live page đồng nhất với design system
- ✅ 6 file mới: `useTaskExtraction`, `TaskList`, `MemberFormModal`, `DepartmentTree`, `MemberCard`, redesign Live/*
- ✅ Toàn bộ trang phụ đã apply design system

Sẵn sàng cho Phase 6 (Auth & Onboarding).
