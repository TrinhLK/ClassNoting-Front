"use client";
import ReactMarkdown from "react-markdown";
import { cn } from "@/app/lib/cn";
import type { Components } from "react-markdown";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

const components: Components = {
  h1: ({ children }) =>
    <h1 className="text-xl font-bold text-slate-900 mt-6 mb-3 border-b border-slate-200 pb-1 first:mt-0">{children}</h1>,
  h2: ({ children }) =>
    <h2 className="text-lg font-bold text-primary-700 mt-5 mb-2">{children}</h2>,
  h3: ({ children }) =>
    <h3 className="text-base font-bold text-slate-800 mt-4 mb-2">{children}</h3>,
  p: ({ children }) =>
    <p className="text-sm text-slate-700 leading-relaxed mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) =>
    <ul className="list-disc list-outside ml-5 mb-3 space-y-1.5 text-sm text-slate-700">{children}</ul>,
  ol: ({ children }) =>
    <ol className="list-decimal list-outside ml-5 mb-3 space-y-1.5 text-sm text-slate-700">{children}</ol>,
  li: ({ children }) =>
    <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) =>
    <strong className="font-bold text-slate-900">{children}</strong>,
  em: ({ children }) =>
    <em className="italic">{children}</em>,
  code: ({ children }) =>
    <code className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-xs font-mono">{children}</code>,
  pre: ({ children }) =>
    <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto text-xs mb-3">{children}</pre>,
  a: ({ href, children }) =>
    <a href={href} className="text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
  blockquote: ({ children }) =>
    <blockquote className="border-l-4 border-primary-200 pl-4 italic text-slate-600 my-3">{children}</blockquote>,
};

export default function MarkdownContent({ content, className }: MarkdownContentProps) {
  if (!content) return null;
  return (
    <div className={cn("max-w-none", className)}>
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
}
