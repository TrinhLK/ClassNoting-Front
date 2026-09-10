import { useCallback } from "react";

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function useHighlightedSnippet() {
  return useCallback((content: string, query: string): React.ReactNode => {
    if (!query.trim() || !content) return content;
    const parts = content.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-amber-100 text-amber-900 font-bold px-0.5 rounded">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }, []);
}

export function useSummaryPreview() {
  return useCallback((summary: string): string => {
    return summary.replace(/[#*`>]/g, "").substring(0, 200) + (summary.length > 200 ? "..." : "");
  }, []);
}
