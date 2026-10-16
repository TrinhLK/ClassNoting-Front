"use client";

import AddAssignee from "@/app/components/Tasks/AddAssignee";
import React, { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation"; // Lấy ID từ URL
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Send,
  Trash2,
  Plus,
  Calendar,
  User,
  Clock,
  CheckCircle,
  ExternalLink,
  Download,
} from "lucide-react";
import {
  getMeetingById,
  updateMeetingProcess,
  getMembers,
  Member,
  TaskItem,
} from "@/app/lib/db"; // Import đúng đường dẫn
import { useAuth } from "@/app/context/AuthContext";
import { Loader2 } from "lucide-react";
import { useGlobalUI } from "@/app/context/GlobalUIProvider";
import { sendTaskEmails } from "@/app/lib/api";
export default function ActionItemPage() {
  const { id } = useParams(); // Lấy ID meeting
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [savingTasks, setSavingTasks] = useState(false);
  const saveLock = useRef(false);
  const [pageError, setPageError] = useState("");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [isSendingMail, setIsSendingMail] = useState(false);
  const { toast, confirm } = useGlobalUI();
  useEffect(() => {
    if (!id || authLoading || !user) return;

    const fetchData = async () => {
      try {
        // A. Lấy danh sách Member mới nhất từ Firestore (cần userId)
        // Lưu ý: db.ts mới của bạn hàm getMembers là async và cần truyền user.uid
        const loadedMembers = await getMembers(user.uid);
        setMembers(loadedMembers);

        // B. Lấy Meeting
        const meeting = await getMeetingById(id as string);
        if (!meeting || meeting.userId !== user.uid) {
          setPageError("Không tìm thấy cuộc họp hoặc bạn không có quyền quản lý.");
          setLoading(false);
          return;
        }
        if (meeting) {
          setMeetingTitle(meeting.title);

          const rawTasks = meeting.actionItems || [];
          // --- LOGIC MAPPING MỚI (Ưu tiên: Team -> Dept -> Name) ---
          const mappedTasks = rawTasks.map((t: any) => {
            const normalize = (str: unknown) => str ? String(str).normalize("NFC").toLowerCase().trim() : "";

            let currentEmails: string[] = [];
            if (Array.isArray(t.email)) currentEmails = t.email;
            else if (typeof t.email === "string" && t.email) currentEmails = [t.email];

            // 2. Tìm danh sách email theo Team/Department (Luôn tính toán sẵn)
            let autoEmails: string[] = [];

            // Tìm theo TEAM
            if (t.team) {
              const targetTeam = normalize(t.team);
              autoEmails = loadedMembers
                .filter(m => normalize(m.team) === targetTeam)
                .map(m => m.email);
            }
            // Tìm theo DEPARTMENT
            else if (t.department) {
              const targetDept = normalize(t.department);
              autoEmails = loadedMembers
                .filter(m => normalize(m.department) === targetDept)
                .map(m => m.email);
            }

            // 3. QUYẾT ĐỊNH CHỌN EMAIL:
            // Nếu assignee là "Chưa rõ", "Team", "Mọi người"... -> ƯU TIÊN dùng autoEmails (từ Dept/Team)
            // Ngược lại -> Giữ nguyên email cũ, chỉ dùng autoEmails nếu cũ bị rỗng
            const isVague = !t.assigneeName || ["chưa rõ", "team", "mọi người", "cả phòng", "nhóm"].some(k => normalize(t.assigneeName).includes(k));

            if (currentEmails.length === 0 && isVague && autoEmails.length > 0) {
              // Ghi đè bằng danh sách phòng ban
              currentEmails = autoEmails;
            } else if (currentEmails.length === 0 && autoEmails.length > 0) {
              // Fill nếu đang rỗng
              currentEmails = autoEmails;
            }

            return {
              ...t,
              email: currentEmails
            };
          });

          setTasks(mappedTasks);
        }
        setLoading(false);
      } catch (error) {
        console.error("Lỗi load data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, [id, authLoading, user]);

  // 🟢 HELPER: Tạo link Google Calendar (Thư ký mời người khác)
  const createCalendarLink = (taskItem: TaskItem) => {
    const title = encodeURIComponent(`[Task] ${taskItem.task}`);
    const details = encodeURIComponent(`Nhiệm vụ từ cuộc họp: ${meetingTitle}\n\nNgười thực hiện: ${taskItem.email.join(", ")}`);

    // Xử lý thời gian
    // Nếu có deadline -> Set thời gian là Deadline (trong 1 tiếng)
    // Nếu không -> Set là ngày mai 9h sáng
    let startDate = new Date();
    let endDate = new Date();

    if (taskItem.deadline && taskItem.deadline.includes("T")) {
      startDate = new Date(taskItem.deadline);
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 tiếng
    } else {
      startDate.setDate(startDate.getDate() + 1);
      startDate.setHours(9, 0, 0, 0); // 9h sáng mai
      endDate.setHours(10, 0, 0, 0);
    }

    const formatTime = (d: Date) => d.toISOString().replace(/-|:|\.\d+/g, "");

    // Tham số 'add' là để điền sẵn email khách mời (Assignee)
    const emails = taskItem.email.length > 0 ? `&add=${taskItem.email.join(",")}` : "";

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${formatTime(startDate)}/${formatTime(endDate)}${emails}`;
  };

  // 🟢 HELPER: Xuất tất cả ra file .ics (cho Outlook/Google Calendar Import)
  const handleExportToICS = () => {
    if (tasks.length === 0) return toast.error("Chưa có nhiệm vụ nào để xuất!");

    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//DemoMeet//Task Manager//EN\n";

    tasks.forEach((task) => {
      // 1. Thời gian (Mặc định +1 ngày nếu không có deadline)
      let startDate = new Date();
      if (task.deadline && task.deadline.includes("T")) {
        startDate = new Date(task.deadline);
      } else {
        startDate.setDate(startDate.getDate() + 1);
        startDate.setHours(9, 0, 0, 0);
      }
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 tiếng

      const formatICSDate = (d: Date) => d.toISOString().replace(/-|:|\.\d+/g, "");

      // 2. Tạo Event
      icsContent += "BEGIN:VEVENT\n";
      icsContent += `UID:${Date.now()}_${Math.random().toString(36).substr(2, 9)}@demomeet.com\n`;
      icsContent += `DTSTAMP:${formatICSDate(new Date())}\n`;
      icsContent += `DTSTART:${formatICSDate(startDate)}\n`;
      icsContent += `DTEND:${formatICSDate(endDate)}\n`;
      icsContent += `SUMMARY:[Task] ${task.task}\n`;
      icsContent += `DESCRIPTION:Nhiệm vụ từ: ${meetingTitle}\\nNgười thực hiện: ${task.email.join(", ")}\n`;

      // 3. Thêm Attendee (Khách mời)
      task.email.forEach(email => {
        icsContent += `ATTENDEE;RSVP=TRUE:mailto:${email}\n`;
      });

      icsContent += "END:VEVENT\n";
    });

    icsContent += "END:VCALENDAR";

    // 4. Trigger Download
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `tasks_${Date.now()}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Đã tải file lịch (.ics). Hãy mở nó để Import!");
  };

  const addAssignee = (index: number, member: Member) => {
    setMembers(previous => previous.some(m => m.id === member.id) ? previous : [...previous, member]);
    setTasks(previous => previous.map((task, i) => i !== index ? task : {
      ...task, email: [...new Set([...task.email, member.email])],
      assigneeName: task.email.length ? `${task.assigneeName || ""}, ${member.name}` : member.name,
    }));
  };

  const persistTasks = async (next: TaskItem[]) => {
    if (saveLock.current || !user) return;
    saveLock.current = true; setSavingTasks(true);
    try {
      await updateMeetingProcess(id as string, { actionItems: next });
      setTasks(next);
      toast.success("Đã lưu nhiệm vụ.");
    } catch { toast.error("Không thể lưu nhiệm vụ. Vui lòng thử lại."); }
    finally { saveLock.current = false; setSavingTasks(false); }
  };
  const handleSave = () => persistTasks(tasks);
  const toggleComplete = (taskId: number, completed: boolean) => persistTasks(tasks.map(t => t.id === taskId ? { ...t, completed, completedAt: completed ? Date.now() : null } : t));

  // 3. Hàm Gửi Mail
  const handleSendMail = async () => {
    // 🟢 SỬA LẠI: Chỉ cần check mảng có phần tử (length > 0)
    // (Vì dữ liệu trong mảng lấy từ Member đã chuẩn email rồi)
    const validTasks = tasks.filter((t) => t.email && t.email.length > 0);

    if (validTasks.length === 0) {
      return toast.error(
        "Chưa giao nhiệm vụ cho ai cả (vui lòng chọn người nhận)!"
      );
    }

    // Đếm tổng số người nhận (Unique)
    const allRecipients = new Set<string>();
    // Dùng flatMap hoặc forEach lồng nhau để lấy hết email
    validTasks.forEach((t) => t.email.forEach((e) => allRecipients.add(e)));

    // Xác nhận trước khi gửi
    const confirmSend = await confirm({
      title: "Gửi Email",
      message: `Bạn chuẩn bị gửi thông báo cho ${allRecipients.size} người với tổng cộng ${validTasks.length} nhiệm vụ. Tiếp tục?`,
      confirmText: "Gửi ngay",
      type: "info",
    });

    if (!confirmSend) return;

    setIsSendingMail(true);

    try {
      // Gọi helper gửi mail (tự đính kèm Firebase ID token)
      await updateMeetingProcess(id as string, { actionItems: tasks });
      const data = await sendTaskEmails(validTasks, meetingTitle);
      toast.success(`Đã gửi thành công cho ${data.count} người!`);

      // Cập nhật trạng thái 'sent' vào DB
      await updateMeetingProcess(id as string, { actionStatus: "sent" });

      router.push("/tasks");
    } catch (e: any) {
      console.error(e);
      const message = e?.message;
      if (message === "AUTH_REQUIRED") {
        toast.error("Bạn chưa đăng nhập. Vui lòng đăng nhập để gửi email.");
      } else if (message === "AUTH_EXPIRED") {
        toast.error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      } else if (message === "RATE_LIMITED") {
        toast.error("Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.");
      } else if (message === "SERVER_CONFIG") {
        toast.error(
          "Máy chủ chưa cấu hình Firebase Admin. Liên hệ admin để thêm FIREBASE_SERVICE_ACCOUNT_KEY."
        );
      } else {
        toast.error("Gửi mail thất bại. Vui lòng kiểm tra lại cấu hình server.");
      }
    } finally {
      setIsSendingMail(false);
    }
  };
  if (loading)
    return <div className="p-10 text-center">Đang tải dữ liệu...</div>;

  if (pageError) return <p role="alert" className="p-8">{pageError}</p>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* HEADER HEADER STICKY */}
      <div className="bg-white border-b sticky top-0 z-20 px-4 py-4 md:px-8 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/tasks"
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800 line-clamp-1">
              Phân công: {meetingTitle}
            </h1>
            <p className="text-xs text-slate-500 hidden md:block">
              Hãy rà soát kỹ trước khi gửi email.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Nút Xuất Lịch (MỚI) */}
          <button
            onClick={handleExportToICS}
            className="px-3 py-2 text-indigo-600 bg-indigo-50 border border-indigo-100 font-bold rounded-lg hover:bg-indigo-100 flex items-center gap-2 transition"
            title="Tải file lịch để Import vào Google Calendar/Outlook"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Xuất Lịch (.ics)</span>
          </button>

          <button
            onClick={handleSave}
            disabled={savingTasks || isSendingMail}
            className="px-4 py-2 text-slate-600 bg-white border border-slate-300 font-medium rounded-lg hover:bg-slate-50 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />{" "}
            <span className="hidden sm:inline">Lưu nháp</span>
          </button>
          <button
            onClick={handleSendMail}
            disabled={isSendingMail || savingTasks} // Disable khi đang gửi
            className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-200 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSendingMail ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Đang gửi...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />{" "}
                <span className="hidden sm:inline">Gửi Email</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* BODY - RESPONSIVE */}
      <div className="flex-1 max-w-6xl mx-auto w-full p-4 md:p-8">
        <section aria-label="Checklist nhiệm vụ" className="mb-6 p-4 rounded-xl border bg-white">
          <h2 className="font-bold mb-2">Tiến độ nhiệm vụ: {tasks.filter(t => t.completed).length}/{tasks.length} hoàn thành</h2>
          <p className="text-sm text-slate-500 mb-3">Đánh dấu để xác nhận hoàn thành. Trạng thái được lưu tự động.</p>
          {tasks.filter(t => t.email.length > 0).map(task => <label key={task.id} className="flex gap-3 py-3 border-t items-start">
            <input type="checkbox" checked={!!task.completed} disabled={savingTasks || isSendingMail} onChange={e => toggleComplete(task.id, e.target.checked)} aria-label={`Hoàn thành: ${task.task}`} className="mt-1" />
            <span className="min-w-0"><span className={task.completed ? "line-through text-slate-400" : "text-slate-800"}>{task.task}</span>
              <span className="block text-xs text-slate-500 mt-1">{task.email.map(email => members.find(m => m.email === email)?.name || email).join(", ")}{task.deadline ? ` · Hạn: ${task.deadline.replace("T", " ")}` : ""}</span>
            </span>
          </label>)}
          {!tasks.some(t => t.email.length) && <p className="text-sm text-slate-500">Thêm người nhận bên dưới để quản lý nhiệm vụ bằng checklist.</p>}
        </section>
        <fieldset disabled={savingTasks || isSendingMail} className="min-w-0">
        {/* DESKTOP TABLE */}
        <div className="hidden md:block bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-4 w-[40%]">Nhiệm vụ</th>
                <th className="px-4 py-4 w-[25%]">Người nhận</th>
                <th className="px-4 py-4 w-[20%]">Deadline</th>
                <th className="px-4 py-4 w-[5%]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((task, idx) => (
                <tr key={idx} className="hover:bg-indigo-50/10 transition">
                  <td className="px-6 py-4 align-top">
                    <div className="flex gap-2 mb-1">
                      {task.team && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                          Team: {task.team}
                        </span>
                      )}
                      {task.department && !task.team && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                          Phòng: {task.department}
                        </span>
                      )}
                    </div>
                    <textarea
                      value={task.task}
                      rows={2}
                      onChange={(e) => {
                        const newT = [...tasks];
                        newT[idx].task = e.target.value;
                        setTasks(newT);
                      }}
                      className="w-full border-none focus:ring-0 resize-none bg-transparent p-0 text-slate-700 font-medium placeholder-slate-300"
                      placeholder="Nhập nội dung..."
                    />
                  </td>
                  {/* CỘT NGƯỜI NHẬN (MULTI-SELECT) */}
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-col gap-2">
                      {/* 1. Hiển thị các Badge người đã chọn */}
                      <div className="flex flex-wrap gap-1.5">
                        {task.email.map((email) => {
                          const mem = members.find((m) => m.email === email);
                          return (
                            <span
                              key={email}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100"
                            >
                              {mem?.name || email}
                              <button
                                onClick={() => {
                                  // Xóa người này khỏi task
                                  const newEmails = task.email.filter(
                                    (e) => e !== email
                                  );
                                  const newT = [...tasks];
                                  newT[idx].email = newEmails;
                                  setTasks(newT);
                                }}
                                className="hover:text-red-500 rounded-full p-0.5 ml-1"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>

                      {/* 2. Dropdown để chọn thêm thủ công */}
                      <select
                        value="" // Luôn để rỗng
                        onChange={(e) => {
                          const selectedEmail = e.target.value;
                          if (!selectedEmail) return;

                          // Logic: Thêm vào mảng nếu chưa có
                          if (!task.email.includes(selectedEmail)) {
                            const newT = [...tasks];
                            newT[idx].email = [...task.email, selectedEmail];
                            setTasks(newT);
                          }
                        }}
                        className="w-full p-1.5 text-xs border border-slate-200 rounded text-slate-500 outline-none focus:border-indigo-500"
                      >
                        <option value="">+ Thêm người...</option>
                        {members.map((m) => (
                          <option
                            key={m.id}
                            value={m.email}
                            disabled={task.email.includes(m.email)} // Ẩn người đã chọn
                            className={
                              task.email.includes(m.email)
                                ? "text-slate-300"
                                : ""
                            }
                          >
                            {m.name}
                          </option>
                        ))}
                      </select>

                      {user && <AddAssignee userId={user.uid} members={members} onAdd={member => addAssignee(idx, member)} />}
                      {members.length === 0 && <p className="text-xs text-slate-500">Danh bạ trống. Nhập người mới để phân công.</p>}
                      {/* Text gợi ý AI */}
                      {task.assigneeName && (
                        <p
                          className="text-[10px] text-slate-400 italic mt-0.5 truncate"
                          title={task.assigneeName}
                        >
                          Gợi ý: {[task.assigneeName, task.department, task.team].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <input
                      type="datetime-local"
                      value={task.deadline === "Chưa rõ" ? "" : task.deadline}
                      onChange={(e) => {
                        const newT = [...tasks];
                        newT[idx].deadline = e.target.value;
                        setTasks(newT);
                      }}
                      className="w-full p-2 border border-slate-200 rounded text-sm text-slate-600"
                    />
                  </td>
                  <td className="px-4 py-4 align-middle text-center">
                    <button
                      onClick={() =>
                        setTasks(tasks.filter((_, i) => i !== idx))
                      }
                      className="text-slate-300 hover:text-red-500 p-2"
                      title="Xóa task"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    {/* Nút Calendar */}
                    <a
                      href={createCalendarLink(task)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-300 hover:text-indigo-600 p-2 inline-block"
                      title="Tạo lịch mời & Nhắc việc (Google Calendar)"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARDS (Updated for Multi-Select) */}
        <div className="md:hidden space-y-4 pb-20">
          {tasks.map((task, idx) => (
            <div
              key={idx}
              className="bg-white p-4 rounded-xl border shadow-sm space-y-3 relative"
            >
              {/* Nút xóa */}
              <button
                onClick={() => setTasks(tasks.filter((_, i) => i !== idx))}
                className="absolute top-3 right-3 text-slate-300 hover:text-red-500"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              {/* Phần Task Content */}
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">
                  Nhiệm vụ
                </label>
                <textarea
                  value={task.task}
                  rows={3}
                  onChange={(e) => {
                    const newT = [...tasks];
                    newT[idx].task = e.target.value;
                    setTasks(newT);
                  }}
                  className="w-full mt-1 p-2 bg-slate-50 rounded border border-slate-200 text-sm focus:bg-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="flex flex-col gap-3">
                {/* Phần Chọn Người (Multi-Select) */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                    Người nhận
                  </label>

                  {/* 1. List Badge đã chọn */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    {task.email.map((email) => {
                      const mem = members.find((m) => m.email === email);
                      return (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100"
                        >
                          {mem?.name || email}
                          <button
                            onClick={() => {
                              const newEmails = task.email.filter(
                                (e) => e !== email
                              );
                              const newT = [...tasks];
                              newT[idx].email = newEmails;
                              setTasks(newT);
                            }}
                            className="text-indigo-400 hover:text-red-500 ml-1"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>

                  {/* 2. Dropdown thêm người */}
                  <select
                    value=""
                    onChange={(e) => {
                      const selectedEmail = e.target.value;
                      if (!selectedEmail) return;

                      // Logic thêm vào mảng
                      if (!task.email.includes(selectedEmail)) {
                        const newT = [...tasks];
                        newT[idx].email = [...task.email, selectedEmail];
                        setTasks(newT);
                      }
                    }}
                    className="w-full p-2 rounded border border-slate-200 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="">+ Thêm người...</option>
                    {members.map((m) => (
                      <option
                        key={m.id}
                        value={m.email}
                        disabled={task.email.includes(m.email)}
                        className={
                          task.email.includes(m.email) ? "text-slate-300" : ""
                        }
                      >
                        {m.name}
                      </option>
                    ))}
                  </select>

                  {user && <AddAssignee userId={user.uid} members={members} onAdd={member => addAssignee(idx, member)} />}
                  {/* AI Suggestion */}
                  {task.assigneeName && (
                    <p className="text-[10px] text-slate-400 mt-1 italic">
                      AI detect: "{task.assigneeName}"
                    </p>
                  )}
                </div>

                {/* Phần Deadline */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">
                    Deadline
                  </label>
                  <input
                    type="datetime-local"
                    value={
                      task.deadline && task.deadline.includes("T")
                        ? task.deadline
                        : ""
                    }
                    onChange={(e) => {
                      const newT = [...tasks];
                      newT[idx].deadline = e.target.value;
                      setTasks(newT);
                    }}
                    className="w-full mt-1 p-2 border border-slate-200 rounded text-sm"
                  />
                  {/* Link Calendar Mobile */}
                  <a
                    href={createCalendarLink(task)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 mt-3 text-indigo-600 text-xs font-bold"
                  >
                    <ExternalLink className="w-3 h-3" /> Tạo lịch nhắc việc
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ADD BUTTON (Updated) */}
        <button
          onClick={() =>
            setTasks([
              ...tasks,
              {
                id: Date.now(),
                task: "",
                assigneeName: "",
                email: [], // 🟢 SỬA: Khởi tạo mảng rỗng thay vì string rỗng
                deadline: "",
              },
            ])
          }
          className="mt-6 w-full py-3 border-2 border-dashed border-indigo-200 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" /> Thêm nhiệm vụ thủ công
        </button>
        </fieldset>
      </div>
    </div>
  );
}