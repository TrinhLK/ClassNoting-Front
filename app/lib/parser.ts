// src/lib/parser.ts

import { Segment, Speaker } from "./mockData";

// Hàm chuyển đổi "01:30" -> 90 (giây)
const parseTime = (timeStr: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
};

// Hàm gán màu ngẫu nhiên cho Speaker mới
const getSpeakerColor = (index: number) => {
  const colors = [
    "bg-blue-50 text-blue-700 border-blue-200",
    "bg-green-50 text-green-700 border-green-200",
    "bg-purple-50 text-purple-700 border-purple-200",
    "bg-orange-50 text-orange-700 border-orange-200",
    "bg-pink-50 text-pink-700 border-pink-200",
    "bg-teal-50 text-teal-700 border-teal-200",
  ];
  return colors[index % colors.length];
};

export const parseTranscriptFile = (rawText: string) => {
  const lines = rawText.split("\n");
  const segments: Segment[] = [];
  const speakersMap = new Map<string, Speaker>();
  
  // Regex khớp với format của Python v3: 
  // [SPEAKER_00] (00:00 -> 00:04): Nội dung...
  const regex = /^\[(.+?)\] \((.+?) -> (.+?)\): (.+)$/;

  lines.forEach((line, index) => {
    const match = line.trim().match(regex);
    if (match) {
      const [, speakerId, startStr, endStr, text] = match;
      
      // 1. Tạo Segment
      segments.push({
        id: index.toString(),
        speakerId: speakerId.trim(),
        start: parseTime(startStr),
        end: parseTime(endStr),
        text: text.trim()
      });

      // 2. Tạo Speaker nếu chưa có
      if (!speakersMap.has(speakerId)) {
        speakersMap.set(speakerId, {
          id: speakerId,
          name: speakerId, // Mặc định tên = mã
          color: getSpeakerColor(speakersMap.size)
        });
      }
    }
  });

  return {
    segments,
    speakers: Array.from(speakersMap.values())
  };
};