
"use client";

import { useState, useEffect } from 'react';
import { Upload, CheckCircle, RefreshCcw, HardDrive, FileVideo } from 'lucide-react';
import { uploadAudioToFirebase, startTranscriptionJob } from '../lib/api';
import { saveMeeting, Meeting } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useGlobalUI } from '../context/GlobalUIProvider';
import { convertToMp3 } from '../lib/converter';
import { MEETING_STATUS } from '../lib/constants';
import Modal from './ui/Modal';
import Select from './ui/Select';
import Button from './ui/Button';
import Spinner from './ui/Spinner';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

export default function DriveImportModal({ isOpen, onClose, onImportSuccess }: { isOpen: boolean; onClose: () => void; onImportSuccess: () => void }) {
    const { user } = useAuth();
    const { toast } = useGlobalUI();

    const [isConnected, setIsConnected] = useState(false);
    const [initializing, setInitializing] = useState(true);
    const [files, setFiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [importingId, setImportingId] = useState<string | null>(null);
    const [conversionProgress, setConversionProgress] = useState(0);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showAll, setShowAll] = useState(false);
    const [language, setLanguage] = useState<"vi" | "en">("vi");

    // Check connection status on mount or open
    useEffect(() => {
        if (isOpen) {
            checkDriveStatus();
        } else {
            setInitializing(true); // Reset on close
        }
    }, [isOpen, showAll]);

    // Check if we have a token (by trying to fetch files)
    const checkDriveStatus = async () => {
        if (!files.length) setLoading(true);
        try {
            const mode = showAll ? 'all' : 'meet';
            const res = await fetch(`/api/drive/list?mode=${mode}`);
            if (res.ok) {
                const data = await res.json();
                setFiles(data.files || []);
                setIsConnected(true);
            } else {
                if (res.status === 401) {
                    setIsConnected(false);
                }
            }
        } catch (error) {
            console.error("DRIVE CHECK ERROR", error);
            setIsConnected(false);
        } finally {
            setLoading(false);
            setInitializing(false);
        }
    };

    const handleConnect = () => {
        // Redirect to auth endpoint
        window.location.href = '/api/drive/auth';
    };

    const handleImport = async (file: DriveFile) => {
        if (!user) {
            toast.error("Vui lòng đăng nhập để import.");
            return;
        }

        setImportingId(file.id);
        setConversionProgress(0); // Reset progress
        setUploadProgress(0);
        
        try {
            // 1. Download from Drive via Proxy (Server)
            const downloadRes = await fetch(`/api/drive/download?fileId=${file.id}`);
            if (!downloadRes.ok) throw new Error("Failed to download from Drive");

            const blob = await downloadRes.blob();
            let fileObj = new File([blob], file.name, { type: blob.type });

            const mimeType = file.mimeType || '';
            const isVideo = mimeType.includes('video');
            const isNonMp3Audio = mimeType.includes('audio') && !mimeType.includes('mp3');

            if (isVideo || isNonMp3Audio) {
                toast.info("Đang chuyển đổi sang MP3 để tối ưu...");
                try {
                    fileObj = await convertToMp3(fileObj, (progress) => {
                        setConversionProgress(progress);
                    });
                    toast.success("Chuyển đổi xong! Đang upload...");
                } catch (convErr) {
                    console.error("Conversion failed", convErr);
                    toast.warning("Lỗi chuyển đổi, sẽ dùng file gốc.");
                }
            }

            // 2. Upload to Firebase (Client SDK - Authenticated)
            const firebaseUrl = await uploadAudioToFirebase(fileObj, user.uid, (progress) => {
                setUploadProgress(progress);
            });

            // 3. Trigger Transcription
            const jobId = await startTranscriptionJob(firebaseUrl, language);

            // 4. Create local DB Record
            const tempId = crypto.randomUUID();
            const newMeeting: Meeting = {
                id: tempId,
                userId: user.uid,
                jobId: jobId,
                title: file.name.replace(/\.[^/.]+$/, ""),
                createdAt: Date.now(),
                duration: 0,
                audioUrl: firebaseUrl,
                segments: [],
                speakers: [],
                status: MEETING_STATUS.TRANSCRIBING,
                isDeleted: false,
                language: language
            };
            await saveMeeting(newMeeting);

            toast.success("Đã bắt đầu xử lý file!");
            onImportSuccess();
            onClose();

        } catch (e: unknown) {
            console.error("Import Error:", e);
            toast.error("Lỗi Import: " + (e instanceof Error ? e.message : String(e)));
        } finally {
            setImportingId(null);
            setConversionProgress(0);
            setUploadProgress(0);
        }
    };

    const formatSize = (bytes: string) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(parseInt(bytes)) / Math.log(k));
        return parseFloat((parseInt(bytes) / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Google Drive Import"
            description="Import recordings trực tiếp từ Google Drive"
            icon={<HardDrive className="w-5 h-5" />}
            size="lg"
        >
            {initializing ? (
                <div className="text-center py-10 text-gray-500 flex flex-col items-center">
                    <Spinner size="lg" intent="primary" />
                    <p className="mt-2">Checking connection...</p>
                </div>
            ) : !isConnected ? (
                <div className="text-center py-10">
                    <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <HardDrive className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">Connect to Google Drive</h3>
                    <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                        Connect your account to import recordings directly from the "Meet Recordings" folder.
                    </p>
                    <Button variant="outline" onClick={handleConnect} className="mx-auto">
                        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                        Sign in with Google
                    </Button>
                </div>
            ) : (
                <div>
                    {loading ? (
                        <div className="text-center py-10 text-gray-500 animate-pulse">Loading recordings...</div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                                <h3 className="font-medium">Recent Recordings</h3>

                                <div className="flex flex-wrap items-center gap-4">
                                    <Select
                                        value={language}
                                        onChange={(e) => setLanguage(e.target.value as "vi" | "en")}
                                        options={[
                                            { value: "vi", label: "🇻🇳 Tiếng Việt" },
                                            { value: "en", label: "🇬🇧 English" },
                                        ]}
                                    />

                                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={showAll}
                                            onChange={(e) => setShowAll(e.target.checked)}
                                            className="w-4 h-4 rounded text-green-600 focus:ring-green-500 border-gray-300"
                                        />
                                        Show all videos
                                    </label>

                                    <button onClick={checkDriveStatus} className="text-sm text-green-600 hover:underline flex items-center gap-1">
                                        <RefreshCcw className="w-3 h-3" /> Refresh
                                    </button>
                                </div>
                            </div>

                            {files.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                    No recordings found in "Meet Recordings" folder.
                                </div>
                            ) : (
                                files.map((file) => (
                                    <div key={file.id} className="flex items-center justify-between p-4 border rounded-lg hover:border-green-300 hover:bg-green-50 transition group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-red-100 text-red-600 rounded flex items-center justify-center">
                                                <FileVideo className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-900 line-clamp-1 break-all">{file.name}</div>
                                                <div className="text-sm text-gray-500 flex items-center gap-3 mt-1">
                                                    <span>{new Date(file.createdTime).toLocaleDateString()}</span>
                                                    <span>•</span>
                                                    <span>{formatSize(file.size)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleImport(file)}
                                            disabled={importingId === file.id}
                                            leftIcon={importingId === file.id ? undefined : <Upload className="w-4 h-4" />}
                                        >
                                            {importingId === file.id ? (
                                                conversionProgress > 0 && conversionProgress < 100 ? (
                                                    `Đang chuyển đổi ${conversionProgress}%`
                                                ) : uploadProgress > 0 && uploadProgress < 100 ? (
                                                    `Đang tải lên ${uploadProgress}%`
                                                ) : (
                                                    "Đang xử lý..."
                                                )
                                            ) : (
                                                "Import"
                                            )}
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}


