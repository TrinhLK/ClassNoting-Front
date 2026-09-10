"use client";
import { useRef } from "react";
import { UploadCloud, Mic, Sparkles } from "lucide-react";
import HeroCard from "./HeroCard";

interface StatsCardsProps {
  onFileSelected: (file: File) => void;
  onLiveClick: () => void;
}

export default function StatsCards({
  onFileSelected, onLiveClick
}: StatsCardsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div className="space-y-4 md:space-y-6 mb-6 md:mb-8">
      <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleFileChange} />

      <HeroCard
        icon={<Sparkles className="w-7 h-7 md:w-8 md:h-8" />}
        title="Bắt đầu một cuộc họp mới"
        primaryAction={{
          label: "Tải file lên",
          icon: <UploadCloud className="w-4 h-4" />,
          onClick: () => fileInputRef.current?.click(),
        }}
        secondaryAction={{
          label: "Ghi âm trực tiếp",
          icon: <Mic className="w-4 h-4" />,
          onClick: onLiveClick,
        }}
      />
    </div>
  );
}
