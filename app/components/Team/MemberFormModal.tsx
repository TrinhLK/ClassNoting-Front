"use client";
import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
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
}

export default function MemberFormModal({ isOpen, onClose, onSuccess, editingMember, userId, departmentSuggestions }: MemberFormModalProps) {
  const { toast } = useGlobalUI();
  const [form, setForm] = useState<Partial<Member>>({ name: "", email: "", department: "", team: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setForm(editingMember || { name: "", email: "", department: "", team: "" });
  }, [isOpen, editingMember]);

  const handleSave = async () => {
    if (!form.name || !form.email || !form.department) {
      toast.error("Vui lòng điền đủ thông tin bắt buộc");
      return;
    }
    setSaving(true);
    try {
      await saveMember(userId, form as Member);
      toast.success(editingMember?.id ? "Đã cập nhật" : "Đã thêm mới");
      onSuccess();
      onClose();
    } catch {
      toast.error("Lỗi khi lưu dữ liệu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen} onClose={onClose}
      title={editingMember?.id ? "Sửa nhân viên" : "Thêm nhân viên mới"}
      icon={<Plus className="w-5 h-5" />} size="md"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Hủy</Button><Button variant="primary" onClick={handleSave} loading={saving}>Lưu</Button></div>}
    >
      <div className="space-y-4">
        <Input label="Họ và tên *" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Email *" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Select label="Phòng ban *" value={form.department || ""} onChange={(e) => setForm({ ...form, department: e.target.value })} options={departmentSuggestions.map((d) => ({ value: d, label: d }))} />
        <Input label="Team" value={form.team || ""} onChange={(e) => setForm({ ...form, team: e.target.value })} />
      </div>
    </Modal>
  );
}
