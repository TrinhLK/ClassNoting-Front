"use client";

import React, { useState, useEffect, useRef } from "react";
import { Loader2, MessageSquare, X, Send, Sparkles, Folder as FolderIcon, FolderOpen, FileText } from "lucide-react";
import { getAllMeetings, Meeting, saveMeeting, Folder, getFolders, saveFolder, updateMeetingFolder } from "../lib/db";
import { MEETING_STATUS } from "../lib/constants";
import { useAuth } from "../context/AuthContext";
import { useGlobalUI } from "../context/GlobalUIProvider";
import { useRouter } from "next/navigation";
import AIChatModal from "./AIChatModal";
import MinutesHeader from "./Minutes/Header";
import FolderGrid from "./Minutes/FolderGrid";
import MeetingList from "./Minutes/MeetingList";
import BulkActionBar from "./ui/BulkActionBar";

export default function MinutesState() {
    const { user } = useAuth();
    const { toast } = useGlobalUI();
    const router = useRouter();
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);
    const [loading, setLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 🟢 SELECTION & QA STATE
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showAIChat, setShowAIChat] = useState(false);

    // 🟢 FOLDER STATE
    const [folders, setFolders] = useState<Folder[]>([]);
    const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
    const [showNewFolderModal, setShowNewFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [showMoveDropdown, setShowMoveDropdown] = useState(false);
    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

    const toggleSelection = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const loadData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const [allMeetings, allFolders] = await Promise.all([
                getAllMeetings(user.uid),
                getFolders(user.uid)
            ]);
            // Filter only meetings with summaries and not deleted
            const withSummaries = allMeetings.filter(m => m.summary && m.summary.trim().length > 0 && !m.isDeleted);
            setMeetings(withSummaries);
            setFolders(allFolders);
        } catch (error) {
            console.error("Error loading data:", error);
            toast.error("Không thể tải dữ liệu");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [user]);


    const handleImportFile = async (file: File) => {
        if (!user) return;

        const allowedTypes = [
            "text/plain",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];

        if (!allowedTypes.includes(file.type)) {
            toast.error("Chỉ hỗ trợ file .txt, .doc, .docx");
            return;
        }

        try {
            toast.info("Đang xử lý file...");

            let content = "";

            if (file.type === "text/plain") {
                content = await file.text();
            } else {
                // For .doc/.docx files, use mammoth
                const mammoth = (await import("mammoth")).default;
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                content = result.value;

                if (result.messages.length > 0) {
                    console.warn("Mammoth warnings:", result.messages);
                }
            }

            if (!content.trim()) {
                toast.error("File không có nội dung");
                return;
            }

            // Extract title from first line or use filename
            const lines = content.split("\n").filter(l => l.trim());
            const title = lines[0]?.trim() || file.name.replace(/\.[^/.]+$/, "");
            const summary = content;

            const newMeeting: Meeting = {
                id: crypto.randomUUID(),
                userId: user.uid,
                title: title.substring(0, 100), // Limit title length
                createdAt: Date.now(),
                duration: 0,
                segments: [],
                speakers: [],
                summary: summary,
                status: MEETING_STATUS.COMPLETED,
                isDeleted: false,
                isMinuteOnly: true, // Flag this as imported minute, not a real meeting
            };

            await saveMeeting(newMeeting);
            toast.success("Đã import biên bản thành công!");
            loadData();
        } catch (error) {
            console.error("Error importing file:", error);
            toast.error("Lỗi khi import file: " + (error as Error).message);
        }
    };

    const handleCreateFolder = async () => {
        if (!user || !newFolderName.trim()) return;
        try {
            const newFolder: Folder = {
                id: crypto.randomUUID(),
                userId: user.uid,
                name: newFolderName.trim(),
                createdAt: Date.now()
            };
            await saveFolder(user.uid, newFolder);
            toast.success("Tạo thư mục thành công");
            setNewFolderName("");
            setShowNewFolderModal(false);
            loadData();
        } catch (e) {
            toast.error("Lỗi khi tạo thư mục");
        }
    };

    const handleMoveToFolder = async (folderId: string | null) => {
        if (selectedIds.size === 0) return;
        try {
            toast.info("Đang chuyển...");
            const promises = Array.from(selectedIds).map(id => updateMeetingFolder(id, folderId));
            await Promise.all(promises);
            toast.success("Đã chuyển biên bản");
            setSelectedIds(new Set());
            setShowMoveDropdown(false);
            loadData();
        } catch (e) {
            toast.error("Lỗi khi chuyển thư mục");
        }
    };

    const handleDragDropMove = async (meetingId: string, folderId: string) => {
        try {
            toast.info("Đang chuyển...");
            await updateMeetingFolder(meetingId, folderId);
            toast.success("Đã chuyển biên bản");
            if (selectedIds.has(meetingId)) {
                const newSet = new Set(selectedIds);
                newSet.delete(meetingId);
                setSelectedIds(newSet);
            }
            loadData();
        } catch (e) {
            toast.error("Lỗi khi chuyển thư mục");
        }
    };

    const cleanText = (text: string) => {
        if (!text) return "";
        return text
            // HTML Entities
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            // Thêm dấu cách trước khi xóa block tags để tránh chữ bị dính vào nhau (VD: </p><p> -> khoảng cách)
            .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, ' </$1>')
            .replace(/<br\s*\/?>/gi, ' ')
            // Xóa HTML tags
            .replace(/<[^>]*>/g, '')
            // Xóa Markdown
            .replace(/#{1,6}\s/g, '')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/^[-*+]\s/gm, '')
            // Xóa khoảng trắng thừa
            .replace(/\s+/g, ' ')
            .trim();
    };

    const filteredMeetings = meetings.filter((m) => {
        const query = debouncedQuery.trim().toLowerCase().normalize('NFC');
        const titleMatch = m.title.toLowerCase().normalize('NFC').includes(query);
        const summaryMatch = cleanText(m.summary || "").toLowerCase().normalize('NFC').includes(query);
        const matchesSearch = titleMatch || summaryMatch;
        const matchesFolder = currentFolder 
            ? m.folderId === currentFolder.id 
            : (!m.folderId || m.folderId === "");
        return matchesSearch && matchesFolder;
    });

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString("vi-VN", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const getSummaryPreview = (summary: string) => {
        const maxLength = 150;
        let plainText = cleanText(summary);
        if (plainText.length <= maxLength) return plainText;
        return plainText.substring(0, maxLength) + "...";
    };

    // 🟢 HÀM MỚI: TẠO SNIPPET HIGHLIGHT KHI SEARCH
    const getHighlightedSnippet = (content: string, query: string): string => {
        if (!query.trim()) return getSummaryPreview(content);

        // 1. Clean content (giống preview)
        const plainText = cleanText(content);

        // 2. Tìm vị trí match case-insensitive
        const lowerText = plainText.toLowerCase().normalize('NFC');
        const lowerQuery = query.toLowerCase().trim().normalize('NFC');
        const index = lowerText.indexOf(lowerQuery);

        // Nếu không tìm thấy (có thể match ở title), trả về preview thường
        if (index === -1) return getSummaryPreview(content);

        // 3. Trích xuất window text (60 ký tự trước, 100 sau)
        const start = Math.max(0, index - 60);
        const end = Math.min(plainText.length, index + lowerQuery.length + 100);

        let snippet = plainText.substring(start, end);

        // Highlight từ khóa
        // Dùng replace với regex case-insensitive, giữ nguyên case gốc của text
        const regex = new RegExp(`(${lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        snippet = snippet.replace(regex, '<mark class="bg-yellow-200 text-slate-900 rounded-sm px-0.5">$1</mark>');

        // Thêm ellipsis nếu cắt bớt
        if (start > 0) snippet = "..." + snippet;
        if (end < plainText.length) snippet = snippet + "...";

        return snippet;
    };

    return (
        <div className="h-full bg-slate-50 font-sans overflow-y-auto">
            <MinutesHeader
                loading={loading}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onRefresh={loadData}
                onImport={handleImportFile}
                onNewFolder={() => setShowNewFolderModal(true)}
            />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <FolderGrid
                    folders={folders}
                    currentFolder={currentFolder}
                    dragOverFolderId={dragOverFolderId}
                    onSelectFolder={setCurrentFolder}
                    onDragOver={(e, folderId) => { e.preventDefault(); setDragOverFolderId(folderId); }}
                    onDragLeave={() => setDragOverFolderId(null)}
                    onDrop={(e, folderId) => {
                        e.preventDefault();
                        setDragOverFolderId(null);
                        const meetingId = e.dataTransfer.getData("meetingId");
                        if (meetingId) handleDragDropMove(meetingId, folderId);
                    }}
                />

                {!loading && currentFolder && (
                    <div className="mb-6 flex items-center justify-between animate-in fade-in slide-in-from-left-4 duration-500">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setCurrentFolder(null)}
                                className="p-2 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors bg-slate-100"
                                title="Quay lại"
                            >
                                <X className="w-4 h-4" />
                            </button>
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <FolderOpen className="w-6 h-6 text-indigo-500 fill-indigo-50" />
                                {currentFolder.name}
                            </h2>
                        </div>
                    </div>
                )}

                <MeetingList
                    meetings={filteredMeetings}
                    loading={loading}
                    searchQuery={debouncedQuery}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelection}
                    getHighlightedSnippet={getHighlightedSnippet}
                    getSummaryPreview={getSummaryPreview}
                    formatDate={formatDate}
                    formatDuration={formatDuration}
                    onNavigateToDashboard={() => router.push('/')}
                />
            </main>

            {/* 🟢 FLOATING ACTION PANEL */}
            <BulkActionBar
              selectedCount={selectedIds.size}
              actions={[
                {
                  label: "Hỏi AI",
                  icon: <Sparkles className="w-4 h-4" />,
                  onClick: () => setShowAIChat(true),
                  intent: "primary",
                },
                {
                  label: "Chuyển vào...",
                  icon: <FolderOpen className="w-4 h-4" />,
                  onClick: () => setShowMoveDropdown(!showMoveDropdown),
                  intent: "success",
                },
              ]}
              onClear={() => { setSelectedIds(new Set()); setShowMoveDropdown(false); }}
            />
            {showMoveDropdown && folders.length > 0 && (
              <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-bottom-2">
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Chọn thư mục</div>
                {folders.map(f => (
                  <button key={f.id} onClick={() => handleMoveToFolder(f.id)} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-primary-600 transition-colors flex items-center gap-2">
                    <FolderIcon className="w-4 h-4 text-slate-400" /> <span className="truncate">{f.name}</span>
                  </button>
                ))}
                <div className="h-px bg-slate-100 my-1" />
                <button onClick={() => handleMoveToFolder(null)} className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  Đưa ra ngoài (Gỡ khỏi thư mục)
                </button>
              </div>
            )}

            {/* 🟢 AI CHAT MODAL */}
            <AIChatModal
                isOpen={showAIChat}
                onClose={() => setShowAIChat(false)}
                contextText={meetings.filter(m => selectedIds.has(m.id)).map(m => `
--- DOCUMENT ID: ${m.id} | TITLE: ${m.title} (${new Date(m.createdAt).toLocaleDateString()}) ---
${m.summary}
---------------------------------------------
`).join("\n\n")}
                contextCount={selectedIds.size}
                onClearContext={() => {
                    setShowAIChat(false);
                    setSelectedIds(new Set());
                }}
            />
            {/* 🟢 NEW FOLDER MODAL */}
            {showNewFolderModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-800">Tạo thư mục mới</h3>
                            <button onClick={() => setShowNewFolderModal(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Tên thư mục</label>
                                <input
                                    type="text"
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    placeholder="Nhập tên thư mục..."
                                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateFolder();
                                    }}
                                />
                            </div>
                        </div>
                        <div className="p-6 pt-0 flex justify-end gap-3">
                            <button onClick={() => setShowNewFolderModal(false)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Hủy</button>
                            <button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 rounded-lg font-medium shadow-md transition-all">Tạo</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
