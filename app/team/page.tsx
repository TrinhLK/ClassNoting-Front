"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, ChevronRight, ChevronDown, Building2, Search, Edit2, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { getMembers, saveMember, deleteMember, getExistingDepartments, Member } from "../lib/db";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Avatar from "../components/ui/Avatar";
import EmptyState from "../components/ui/EmptyState";
import Spinner from "../components/ui/Spinner";
import AppShell from "../components/AppShell";
import MemberFormModal from "../components/Team/MemberFormModal";

// Danh sách gợi ý mặc định (Base suggestions)
const DEFAULT_DEPARTMENTS = [
  "Ban Giám Đốc",
  "Phòng IT",
  "Phòng Kế toán",
  "Phòng Nhân sự",
  "Phòng Marketing",
  "Phòng Sale",
  "Phòng Vận hành"
];

export default function TeamPage() {
  const { user, loading } = useAuth();
  const { toast, confirm } = useGlobalUI();
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // State cho Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Partial<Member>>({});

  // State quản lý độ mở của Cây (Tree)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // THÊM: State lưu danh sách gợi ý phòng ban
  const [deptSuggestions, setDeptSuggestions] = useState<string[]>(DEFAULT_DEPARTMENTS);

  // 1. Load dữ liệu khi vào trang
  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
      return;
    }
    if (user) {
      fetchMembers();
      // Load thêm gợi ý phòng ban
      fetchDepartmentSuggestions();
    }
  }, [user, loading]);

  const fetchMembers = async () => {
    if (!user) return;
    setIsLoadingData(true);
    const data = await getMembers(user.uid);
    setMembers(data);
    setIsLoadingData(false);
  };

  // THÊM: Hàm lấy danh sách phòng ban dynamic
  const fetchDepartmentSuggestions = async () => {
    if (!user) return;
    try {
      // Lấy danh sách đang có trong DB
      const dbDepts = await getExistingDepartments(user.uid);

      // Gộp với danh sách mặc định + Xóa trùng lặp
      const merged = Array.from(new Set([...DEFAULT_DEPARTMENTS, ...dbDepts]));
      setDeptSuggestions(merged.sort());
    } catch (e) {
      console.error("Lỗi load suggestions", e);
    }
  };

  // 2. Xử lý Lưu (Thêm mới hoặc Edit)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!editingMember.name || !editingMember.email || !editingMember.department) {
      toast.error("Vui lòng điền đủ thông tin bắt buộc");
      return;
    }

    try {
      await saveMember(user.uid, editingMember as Member);
      toast.success(editingMember.id ? "Đã cập nhật nhân viên" : "Đã thêm nhân viên mới");
      setIsModalOpen(false);

      // Reload cả list member và list gợi ý phòng ban (nhỡ có phòng ban mới)
      fetchMembers();
      fetchDepartmentSuggestions();
    } catch (error) {
      console.error(error);
      toast.error("Lỗi khi lưu dữ liệu");
    }
  };

  // 3. Xử lý Xóa
  const handleDelete = async (id: string) => {
    if (!user) return;
    const ok = await confirm({
      title: "Xóa nhân viên?",
      message: "Bạn có chắc muốn xóa nhân viên này khỏi danh sách?",
      type: "danger",
      confirmText: "Xóa ngay"
    });

    if (ok) {
      await deleteMember(user.uid, id);
      toast.success("Đã xóa thành công");
      fetchMembers();
      fetchDepartmentSuggestions(); // Update lại list gợi ý
    }
  };

  // 4. Mở Modal
  const openModal = (member?: Member | null, defaultDept?: string, defaultTeam?: string) => {
    if (member) {
      setEditingMember(member);
    } else {
      setEditingMember({
        name: "",
        email: "",
        department: defaultDept || "",
        team: defaultTeam || ""
      });
    }
    setIsModalOpen(true);
  };

  const query = searchTerm.toLowerCase();
  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(query) ||
    m.email.toLowerCase().includes(query) ||
    m.department?.toLowerCase().includes(query) ||
    m.team?.toLowerCase().includes(query)
  );

  // Nhóm data thành Tree (Cây)
  const groupedData = React.useMemo(() => {
    const groups: Record<string, Record<string, Member[]>> = {};

    filteredMembers.forEach(member => {
      const dept = member.department || "Khác (Chưa phân phòng)";
      const team = member.team || "Chung";

      if (!groups[dept]) groups[dept] = {};
      if (!groups[dept][team]) groups[dept][team] = [];

      groups[dept][team].push(member);
    });

    return groups;
  }, [filteredMembers]);

  // Handle auto-expand on search
  useEffect(() => {
    if (searchTerm.trim().length > 0) {
      const allKeys = new Set<string>();
      Object.keys(groupedData).forEach(dept => {
        allKeys.add(dept);
        Object.keys(groupedData[dept]).forEach(team => {
          allKeys.add(`${dept}::${team}`);
        });
      });
      setExpandedNodes(allKeys);
    }
  }, [searchTerm, groupedData]);

  const toggleNode = (nodeId: string) => {
    const newSet = new Set(expandedNodes);
    if (newSet.has(nodeId)) newSet.delete(nodeId);
    else newSet.add(nodeId);
    setExpandedNodes(newSet);
  };

  if (loading) return <div className="p-8 text-center"><Spinner /></div>;

  return (
    <AppShell hideTopbar>
    <div className="h-full bg-slate-50 font-sans text-slate-800 overflow-y-auto">
      {/* HEADER */}
      <PageHeader
        variant="default"
        sticky
        title="Quản lý Nhân sự"
        subtitle="Danh bạ dùng để giao việc tự động"
        icon={<Users className="w-5 h-5" />}
        actions={<Button variant="primary" onClick={() => openModal()} leftIcon={<Plus className="w-4 h-4" />}>Thêm nhân sự</Button>}
      />

      {/* CONTENT */}
      <main className="max-w-5xl mx-auto p-3 sm:p-4 md:p-6">
        {/* Search Bar */}
        <div className="mb-6 relative">
          <Input placeholder="Tìm theo tên hoặc email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} leftIcon={<Search className="w-4 h-4" />} />
        </div>

        {/* List Member - Tree View */}
        {isLoadingData ? (
          <div className="text-center py-12 text-slate-400">Đang tải danh sách...</div>
        ) : filteredMembers.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-8 h-8" />}
            title={searchTerm ? "Không tìm thấy nhân sự" : "Chưa có nhân sự nào"}
            description={searchTerm ? "Thử thay đổi từ khóa tìm kiếm." : "Tạo dữ liệu nhân sự đầu tiên để bắt đầu."}
            action={!searchTerm ? (
              <Button variant="primary" onClick={() => openModal()}>Tạo nhân sự đầu tiên</Button>
            ) : undefined}
          />
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {Object.entries(groupedData).sort(([a], [b]) => a.localeCompare(b)).map(([deptName, teams]) => {
              const isDeptExpanded = expandedNodes.has(deptName);
              const deptMemberCount = Object.values(teams).flat().length;

              return (
                <div key={deptName} className="border-b border-slate-100 last:border-0">
                  {/* Department Node */}
                  <div
                    className="flex items-center justify-between p-4 bg-slate-50 hover:bg-indigo-50/50 cursor-pointer transition-colors group"
                    onClick={() => toggleNode(deptName)}
                  >
                    <div className="flex items-center gap-2 md:gap-3 min-w-0 pr-2">
                      <button className="text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0">
                        {isDeptExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </button>
                      <Building2 className="w-5 h-5 md:w-6 md:h-6 text-indigo-500 shrink-0" />
                      <h2 className="text-base md:text-lg font-bold text-slate-800 truncate">{deptName}</h2>
                      <span className="bg-slate-200 text-slate-600 text-[10px] md:text-xs px-2 py-0.5 rounded-full font-medium shrink-0">
                        {deptMemberCount} nhân sự
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); openModal(null, deptName !== "Khác (Chưa phân phòng)" ? deptName : "", ""); }}
                      className="opacity-100 md:opacity-0 group-hover:opacity-100 p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all flex items-center gap-1 text-sm font-medium shrink-0"
                    >
                      <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm</span>
                    </button>
                  </div>

                  {/* Teams (Children of Dept) */}
                  {isDeptExpanded && (
                    <div className="pr-2 md:pl-6 bg-white overflow-hidden">
                      {Object.entries(teams).sort(([a], [b]) => a.localeCompare(b)).map(([teamName, membersInTeam]) => {
                        const teamNodeId = `${deptName}::${teamName}`;
                        const isTeamExpanded = expandedNodes.has(teamNodeId);

                        return (
                          <div key={teamNodeId} className="border-l-2 border-slate-100 ml-2 md:ml-5">
                            {/* Team Node */}
                            <div
                              className="flex items-center justify-between p-2 md:p-3 hover:bg-slate-50 cursor-pointer transition-colors group"
                              onClick={() => toggleNode(teamNodeId)}
                            >
                              <div className="flex items-center gap-1 md:gap-2 min-w-0 pr-2 pb-0.5 pl-1">
                                <button className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0">
                                  {isTeamExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                                <Building2 className="w-4 h-4 md:w-5 md:h-5 text-emerald-500 shrink-0" />
                                <h3 className="font-semibold text-sm md:text-base text-slate-700 truncate">{teamName}</h3>
                                <span className="text-slate-400 text-[10px] md:text-xs ml-1 shrink-0">({membersInTeam.length})</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openModal(null, deptName !== "Khác (Chưa phân phòng)" ? deptName : "", teamName !== "Chung" ? teamName : "");
                                }}
                                className="opacity-100 md:opacity-0 group-hover:opacity-100 p-1 md:p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-all shrink-0"
                                title="Thêm vào team này"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Members (Children of Team) */}
                            {isTeamExpanded && (
                              <div className="pl-4 md:pl-8 pb-3 space-y-1">
                                {membersInTeam.map(member => (
                                  <div key={member.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg group transition-colors">
                                    <div className="flex items-center gap-2 md:gap-3 min-w-0 pr-2">
                                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs shrink-0 border border-slate-200">
                                        {member.name.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="font-medium text-slate-800 text-xs md:text-sm truncate">{member.name}</div>
                                        <div className="text-[10px] md:text-xs text-slate-500 truncate">{member.email}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                      <button onClick={() => openModal(member)} className="p-1 md:p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Sửa">
                                        <Edit2 className="w-3 h-3 md:w-4 md:h-4" />
                                      </button>
                                      <button onClick={() => handleDelete(member.id)} className="p-1 md:p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Xóa">
                                        <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <MemberFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => { fetchMembers(); fetchDepartmentSuggestions(); }}
        editingMember={editingMember}
        userId={user!.uid}
        departmentSuggestions={deptSuggestions}
      />
    </div>
    </AppShell>
  );
}