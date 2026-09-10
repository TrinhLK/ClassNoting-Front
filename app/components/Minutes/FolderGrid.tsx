"use client";
import { FolderOpen, Folder } from "lucide-react";
import { cn } from "@/app/lib/cn";
import type { Folder as FolderType } from "@/app/lib/db";

interface FolderGridProps {
  folders: FolderType[];
  currentFolder: FolderType | null;
  dragOverFolderId: string | null;
  onSelectFolder: (folder: FolderType | null) => void;
  onDragOver: (e: React.DragEvent, folderId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, folderId: string) => void;
}

export default function FolderGrid({
  folders, currentFolder, dragOverFolderId,
  onSelectFolder, onDragOver, onDragLeave, onDrop
}: FolderGridProps) {
  if (folders.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Folder className="w-4 h-4" /> Thư mục của bạn
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {folders.map((folder) => (
          <button
            key={folder.id}
            onClick={() => onSelectFolder(folder)}
            onDragOver={(e) => onDragOver(e, folder.id)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, folder.id)}
            className={cn(
              "group relative bg-white rounded-2xl border p-4 text-left transition-all",
              "hover:shadow-md hover:-translate-y-0.5",
              currentFolder?.id === folder.id
                ? "border-primary-300 ring-2 ring-primary-200"
                : "border-slate-200",
              dragOverFolderId === folder.id && "border-primary-400 bg-primary-50 ring-2 ring-primary-300"
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                currentFolder?.id === folder.id
                  ? "bg-primary-600 text-white"
                  : "bg-primary-50 text-primary-600 group-hover:bg-primary-100"
              )}>
                <FolderOpen className="w-5 h-5" />
              </div>
            </div>
            <h3 className="font-bold text-slate-800 truncate text-sm">{folder.name}</h3>
          </button>
        ))}
      </div>
    </section>
  );
}
