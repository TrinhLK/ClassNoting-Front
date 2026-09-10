"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
    ArrowLeft,
    Calendar,
    Clock,
    Edit2,
    Save,
    X,
    Loader2,
    Trash2,
    ChevronUp,
    ChevronDown,
    Search,
} from "lucide-react";
import { getMeetingById, updateMeetingProcess } from "@/app/lib/db";
import { useAuth } from "@/app/context/AuthContext";
import { useGlobalUI } from "@/app/context/GlobalUIProvider";
import Link from "next/link";
import RichTextEditor from "@/app/components/RichTextEditor";
import ErrorBoundary from "@/app/components/ErrorBoundary";
import DocsFillModal from "@/app/components/DocsFillModal";
import { sanitizeHtml } from "@/app/lib/sanitizeHtml";
import { parseMarkdown } from "@/app/lib/minuteMarkdown";
import { FileType } from "lucide-react";


function MinuteDetailPage() {
    const params = useParams();
    const router = useRouter();
    // 🟢 LẤY SEARCH PARAMS ĐỂ HIGHLIGHT
    const searchParams = useSearchParams();
    const highlightQuery = searchParams.get("highlight");

    const { user } = useAuth();
    const { toast, confirm } = useGlobalUI();

    const [meeting, setMeeting] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [showDocsFill, setShowDocsFill] = useState(false);

    // 🟢 SEARCH NAVIGATION STATE
    const [matchCount, setMatchCount] = useState(0);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

    // 🟢 FLOATING WIDGET STATE
    const [showSearch, setShowSearch] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const searchInputRef = React.useRef<HTMLInputElement>(null);

    // Sync URL param to local input
    useEffect(() => {
        if (highlightQuery) {
            setSearchInput(highlightQuery);
            setShowSearch(true);
        } else {
            if (!showSearch) setSearchInput("");
        }
    }, [highlightQuery, showSearch]);

    // 🟢 KEYBOARD SHORTCUT (Ctrl+F)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                setShowSearch(true);
                setTimeout(() => searchInputRef.current?.focus(), 50);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // 🟢 SCROLL TO HIGHLIGHT EFFECT (UPDATED)
    useEffect(() => {
        if (highlightQuery && !loading) {
            // Đợi render xong
            setTimeout(() => {
                const marks = document.querySelectorAll('mark[data-match-index]');
                const uniqueIndices = new Set(Array.from(marks).map(m => m.getAttribute('data-match-index')));
                setMatchCount(uniqueIndices.size);
                if (uniqueIndices.size > 0) {
                    setCurrentMatchIndex(0);
                }
            }, 800);
        }
    }, [highlightQuery, loading]);

    // 🟢 HANDLE NAVIGATION
    const handleNavigation = (direction: 'next' | 'prev') => {
        if (matchCount === 0) return;

        let newIndex = direction === 'next' ? currentMatchIndex + 1 : currentMatchIndex - 1;
        if (newIndex >= matchCount) newIndex = 0;
        if (newIndex < 0) newIndex = matchCount - 1;

        setCurrentMatchIndex(newIndex);
    };

    // 🟢 APPLY ACTIVE STYLE EFFECT (Runs after render/state change)
    useEffect(() => {
        const marks = document.querySelectorAll('mark[data-match-index]');
        if (marks.length === 0) return;

        let scrolled = false;
        marks.forEach((m) => {
            const index = parseInt(m.getAttribute('data-match-index') || "0", 10);
            if (index === currentMatchIndex) {
                if (!scrolled) {
                    m.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    scrolled = true;
                }
                m.className = "bg-indigo-600 text-white ring-2 ring-indigo-300 shadow-sm scale-110 transition-transform rounded-sm px-0.5";
            } else {
                m.className = "bg-yellow-200 text-slate-900 rounded-sm px-0.5 transition-colors";
            }
        });
    }, [currentMatchIndex, matchCount, highlightQuery]);

    // 🟢 HÀM HELPER: HIGHLIGHT TEXT TRONG HTML (VIEW MODE)
    const getHighlightedContent = (htmlContent: string, query: string | null) => {
        if (!query || !query.trim()) return htmlContent;
        try {
            const cleanQuery = query.trim().normalize('NFC');
            const tokens = cleanQuery.split(/\s+/);
            
            // Xây dựng regex tìm đúng cụm từ, bỏ qua các thẻ HTML/khoảng trắng nằm giữa các chữ.
            // VD: "Ngọc mở" sẽ match được "Ngọc</strong> mở"
            const pattern = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:\\s|<[^>]*>|&nbsp;)+');
            const regex = new RegExp(`(${pattern})(?![^<]*>)`, 'gi');

            let matchIndex = 0;
            return htmlContent.normalize('NFC').replace(regex, (match) => {
                const currentIdx = matchIndex++;
                // Chỉ bọc thẻ <mark> vào những đoạn chữ, giữ nguyên các thẻ HTML bên trong match
                return match.replace(/(^|>)([^<]+)(<|$)/g, (m, p1, p2, p3) => {
                    if (p2.trim().length === 0) return m; // Bỏ qua nếu chỉ là khoảng trắng
                    return `${p1}<mark data-match-index="${currentIdx}" class="bg-yellow-200 text-slate-900 rounded-sm px-0.5">${p2}</mark>${p3}`;
                });
            });
        } catch (e) {
            return htmlContent;
        }
    };

    const meetingId = params.id as string;

    useEffect(() => {
        const loadMeeting = async () => {
            if (!meetingId) return;
            setLoading(true);
            try {
                const data = await getMeetingById(meetingId);
                if (data) {
                    setMeeting(data);
                    // Convert Markdown to HTML for editing if it's not already HTML
                    const contentForEdit = data.summary?.startsWith('<')
                        ? data.summary
                        : parseMarkdown(data.summary || "");
                    setEditContent(contentForEdit);
                } else {
                    toast.error("Không tìm thấy biên bản");
                    router.push("/minutes");
                }
            } catch (error) {
                console.error("Error loading meeting:", error);
                toast.error("Lỗi khi tải biên bản");
            } finally {
                setLoading(false);
            }
        };

        loadMeeting();
    }, [meetingId]);

    const handleSave = async () => {
        if (!editContent.trim()) {
            toast.error("Nội dung biên bản không được để trống");
            return;
        }

        setSaving(true);
        try {
            await updateMeetingProcess(meetingId, { summary: editContent });
            setMeeting({ ...meeting, summary: editContent });
            setIsEditing(false);
            toast.success("Đã lưu biên bản");
        } catch (error) {
            console.error("Error saving summary:", error);
            toast.error("Lỗi khi lưu biên bản");
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setEditContent(meeting?.summary || "");
        setIsEditing(false);
    };

    const handleDelete = async () => {
        const confirmed = await confirm({
            title: "Xóa biên bản",
            message: meeting.isMinuteOnly
                ? "Bạn có chắc muốn xóa biên bản này? Hành động này không thể hoàn tác."
                : "Bạn có chắc muốn xóa tóm tắt biên bản này?",
            confirmText: "Xóa",
            cancelText: "Hủy",
            type: "danger"
        });

        if (!confirmed) return;

        try {
            // If this is a minute-only import (no audio/transcript), delete the entire meeting
            // Otherwise, just clear the summary
            if (meeting.isMinuteOnly) {
                await updateMeetingProcess(meetingId, { isDeleted: true });
                toast.success("Đã xóa biên bản");
            } else {
                await updateMeetingProcess(meetingId, { summary: "" });
                toast.success("Đã xóa tóm tắt biên bản");
            }
            router.push("/minutes");
        } catch (error) {
            console.error("Error deleting:", error);
            toast.error("Lỗi khi xóa biên bản");
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString("vi-VN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    if (loading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
        );
    }

    if (!meeting) {
        return null;
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans">
            {/* Header */}
            <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                            <button
                                onClick={() => window.history.back()}
                                className="p-2 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                            >
                                <ArrowLeft className="w-5 h-5 text-slate-600" />
                            </button>
                            <div className="flex-1 min-w-0">
                                <h1 className="text-xl md:text-2xl font-bold text-slate-800 truncate">
                                    {meeting.title}
                                </h1>
                                <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-4 h-4" />
                                        {formatDate(meeting.createdAt)}
                                    </span>
                                    {meeting.duration > 0 && (
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-4 h-4" />
                                            {formatDuration(meeting.duration)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {isEditing ? (
                                <>
                                    <button
                                        onClick={handleCancel}
                                        disabled={saving}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2 font-medium"
                                    >
                                        <X className="w-4 h-4" />
                                        <span className="hidden sm:inline">Hủy</span>
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 font-medium shadow-md"
                                    >
                                        {saving ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Save className="w-4 h-4" />
                                        )}
                                        <span className="hidden sm:inline">Lưu</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setShowDocsFill(true)}
                                        className="hidden sm:flex items-center gap-2 px-4 py-2 text-indigo-700 hover:bg-indigo-50 border border-indigo-200 bg-indigo-50 rounded-lg font-medium transition-all"
                                    >
                                        <FileType className="w-4 h-4" />
                                        <span className="hidden md:inline">Tạo từ template</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowSearch(!showSearch);
                                            setTimeout(() => searchInputRef.current?.focus(), 50);
                                        }}
                                        className={`p-2 rounded-lg transition-all ${showSearch ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                                        title="Tìm kiếm (Ctrl+F)"
                                    >
                                        <Search className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={handleDelete}
                                        className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium flex items-center gap-2 transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        <span className="hidden sm:inline">Xóa</span>
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center gap-2 shadow-md transition-all active:scale-95"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                        <span className="hidden sm:inline">Chỉnh sửa</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h2 className="text-lg font-bold text-slate-800">Nội dung biên bản</h2>
                        {highlightQuery && (
                            <div className="flex items-center gap-3">
                                {/* Match Counter */}
                                <span className="text-xs font-semibold text-slate-500">
                                    {matchCount > 0 ? `${currentMatchIndex + 1}/${matchCount}` : "0/0"} matches
                                </span>

                                {/* Navigation Buttons */}
                                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg shadow-sm">
                                    <button
                                        onClick={() => handleNavigation('prev')}
                                        className="p-1 hover:bg-slate-50 text-slate-500 rounded-l-lg border-r border-slate-200 transition-colors"
                                        title="Previous Match"
                                    >
                                        <ChevronUp className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleNavigation('next')}
                                        className="p-1 hover:bg-slate-50 text-slate-500 rounded-r-lg transition-colors"
                                        title="Next Match"
                                    >
                                        <ChevronDown className="w-4 h-4" />
                                    </button>
                                </div>

                                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full border border-yellow-200">
                                    "{highlightQuery}"
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="px-6 py-6">
                        {isEditing ? (
                            <div className="space-y-4">
                                <RichTextEditor
                                    content={editContent}
                                    onChange={setEditContent}
                                    placeholder="Nhập nội dung biên bản..."
                                />
                                <div className="pt-2 border-t border-slate-200">
                                    <span className="text-sm text-slate-500">
                                        {editContent.replace(/<[^>]*>/g, '').length} ký tự
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="summary-content">
                                <style jsx>{`
                                    .summary-content {
                                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                                        font-size: 15px;
                                        line-height: 1.8;
                                        color: #334155;
                                    }
                                    .summary-content pre {
                                        white-space: pre-wrap;
                                        word-wrap: break-word;
                                        font-family: inherit;
                                        margin: 0;
                                        padding: 0;
                                        background: none;
                                        border: none;
                                    }
                                    .summary-content :global(h1) {
                                        font-size: 1.5em;
                                        font-weight: 700;
                                        margin-top: 1.5em;
                                        margin-bottom: 0.5em;
                                        color: #1e293b;
                                        border-bottom: 2px solid #e2e8f0;
                                        padding-bottom: 0.3em;
                                    }
                                    .summary-content :global(h2) {
                                        font-size: 1.3em;
                                        font-weight: 700;
                                        margin-top: 1.5em;
                                        margin-bottom: 0.5em;
                                        color: #1e293b;
                                    }
                                    .summary-content :global(h3) {
                                        font-size: 1.1em;
                                        font-weight: 600;
                                        margin-top: 1.2em;
                                        margin-bottom: 0.5em;
                                        color: #334155;
                                    }
                                    /* Add spacing between paragraphs */
                                    .summary-content :global(p) {
                                        margin-bottom: 1em;
                                        line-height: 1.8;
                                    }
                                    /* Style for lists */
                                    .summary-content :global(ul),
                                    .summary-content :global(ol) {
                                        margin: 1em 0;
                                        padding-left: 2em;
                                    }
                                    .summary-content :global(li) {
                                        margin-bottom: 0.5em;
                                        line-height: 1.6;
                                    }
                                    /* Style for bold text */
                                    .summary-content :global(strong) {
                                        font-weight: 600;
                                        color: #1e293b;
                                    }
                                    /* Style for italic text */
                                    .summary-content :global(em) {
                                        font-style: italic;
                                        color: #475569;
                                    }
                                    /* Style for tables */
                                    .summary-content :global(table) {
                                        border-collapse: collapse;
                                        width: 100%;
                                        margin: 1em 0;
                                        font-size: 14px;
                                    }
                                    .summary-content :global(th),
                                    .summary-content :global(td) {
                                        border: 1px solid #cbd5e1;
                                        padding: 6px 10px;
                                        text-align: left;
                                    }
                                    .summary-content :global(thead) {
                                        background: #f1f5f9;
                                    }
                                    .summary-content :global(th) {
                                        font-weight: 600;
                                        color: #1e293b;
                                    }
                                `}</style>
                                {/* 🟢 SỬ DỤNG DANGEROUSLYSETINNERHTML VỚI CONTENT ĐÃ ĐƯỢC HIGHLIGHT */}
                                <div
                                    className="summary-text"
                                    dangerouslySetInnerHTML={{
                                        __html: sanitizeHtml(getHighlightedContent(
                                            meeting.summary && meeting.summary.trim().startsWith("<")
                                                ? meeting.summary
                                                : parseMarkdown(meeting.summary || ""),
                                            highlightQuery
                                        ))
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* 🟢 FLOATING SEARCH WIDGET */}
            <div className={`fixed top-24 right-6 flex flex-col items-end gap-2 transition-opacity duration-300 ${!highlightQuery && !searchInput && !showSearch ? 'opacity-0 pointer-events-none' : 'opacity-100'} z-50`}>

                {(showSearch || highlightQuery) && (
                    <div className="bg-white p-2 rounded-xl shadow-lg border border-slate-200 flex items-center gap-2 animate-in slide-in-from-top-4 ring-1 ring-black/5">
                        {/* Nav Buttons */}
                        <div className="flex items-center gap-0.5">
                            <button
                                onClick={() => handleNavigation('prev')}
                                className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-md transition-colors active:bg-slate-200"
                                title="Previous Match"
                            >
                                <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => handleNavigation('next')}
                                className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-md transition-colors active:bg-slate-200"
                                title="Next Match"
                            >
                                <ChevronDown className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="w-px h-6 bg-slate-200 mx-1"></div>

                        {/* Input */}
                        <div className="relative group">
                            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500" />
                            <input
                                ref={searchInputRef}
                                autoFocus
                                type="text"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        router.push(`/minutes/${meetingId}?highlight=${encodeURIComponent(searchInput)}`);
                                    }
                                }}
                                placeholder="Tìm kiếm..."
                                className="pl-8 pr-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 w-32 transition-all focus:w-60 focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>

                        <div className="w-px h-6 bg-slate-200 mx-1"></div>

                        {/* Counter */}
                        <span className="text-xs font-semibold text-slate-500 min-w-[40px] text-center select-none">
                            {matchCount > 0 ? `${currentMatchIndex + 1}/${matchCount}` : "0"}
                        </span>

                        <div className="w-px h-6 bg-slate-200 mx-1"></div>

                        {/* Close Button */}
                        <button
                            onClick={() => {
                                setSearchInput("");
                                setShowSearch(false);
                                router.push(`/minutes/${meetingId}`);
                            }}
                            className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-md transition-colors"
                            title="Close Search"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>

            <DocsFillModal
                isOpen={showDocsFill}
                onClose={() => setShowDocsFill(false)}
                context={{
                    summary: meeting?.summary || undefined,
                    speakers: (meeting?.speakers || []).map((s: { name: string }) => s.name),
                    objectives: meeting?.objectives || undefined,
                }}
            />
        </div>
    );
}

export default function WrappedMinuteDetailPage() {
    return (
        <ErrorBoundary>
            <MinuteDetailPage />
        </ErrorBoundary>
    );
}
