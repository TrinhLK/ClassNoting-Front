import type { Metadata } from "next";
import Link from "next/link";
import MarkdownContent from "../components/ui/MarkdownContent";
import { EXTENSION_PRIVACY } from "../lib/extension-privacy";

export const metadata: Metadata = { title: "Quyền riêng tư | Smart Noting · ClassNoting", description: "Dữ liệu ClassNoting xử lý, nơi lưu trữ, quyền kiểm soát và cách yêu cầu xóa dữ liệu." };
export default function PrivacyPage() {
  return <main className="mx-auto max-w-3xl px-4 py-8 md:py-12">
    <nav aria-label="Điều hướng quyền riêng tư" className="mb-6 flex flex-wrap gap-5 text-sm font-semibold text-primary-600"><Link href="/extension">Hướng dẫn ClassNoting</Link><Link href="/">Mở Smart Noting</Link></nav>
    <article className="rounded-2xl border border-slate-200 bg-white p-6 md:p-10"><MarkdownContent content={EXTENSION_PRIVACY} /></article>
  </main>;
}
