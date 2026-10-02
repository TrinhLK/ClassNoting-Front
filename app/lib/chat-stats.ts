import type { ChatMessage, MeetingParticipant } from "./mockData";

export interface ChatSenderStat {
  sender: string;
  count: number;
  /** % trên tổng số tin nhắn. */
  pct: number;
}

export interface ChatStats {
  totalMessages: number;
  uniqueSenders: number;
  bySender: ChatSenderStat[];
  /** Những người trong roster có gửi ít nhất 1 tin (đã phản hồi chat). */
  responders: string[];
  /** Những người trong roster chưa gửi tin nào. */
  silent: string[];
  /** % roster có phản hồi. */
  responseRate: number;
}

/**
 * Thống kê tương tác khung chat: ai đã phản hồi, ai im lặng.
 * Khớp tên không phân biệt hoa/thường và khoảng trắng thừa.
 */
export function computeChatStats(
  chatMessages: ChatMessage[],
  participants: MeetingParticipant[] = []
): ChatStats {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

  const counts = new Map<string, { sender: string; count: number }>();
  for (const m of chatMessages) {
    const text = (m.text || "").trim();
    if (!text) continue;
    const key = norm(m.sender || "Khách");
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { sender: (m.sender || "Khách").trim(), count: 1 });
  }

  const totalMessages = [...counts.values()].reduce((a, b) => a + b.count, 0);
  const bySender: ChatSenderStat[] = [...counts.values()]
    .map((c) => ({
      sender: c.sender,
      count: c.count,
      pct: totalMessages > 0 ? Math.round((c.count / totalMessages) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const rosterNames = participants
    .map((p) => (p.displayName || p.name || "").trim())
    .filter(Boolean);
  const senderKeys = new Set(counts.keys());
  const responders: string[] = [];
  const silent: string[] = [];
  for (const name of rosterNames) {
    if (senderKeys.has(norm(name))) responders.push(name);
    else silent.push(name);
  }

  return {
    totalMessages,
    uniqueSenders: counts.size,
    bySender,
    responders,
    silent,
    responseRate:
      rosterNames.length > 0
        ? Math.round((responders.length / rosterNames.length) * 1000) / 10
        : 0,
  };
}
