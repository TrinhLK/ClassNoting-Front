import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Chrome, MessageSquare, Mic, ShieldCheck } from "lucide-react";
import ExtensionSetupCard from "../components/ExtensionSetupCard";
import BrandIcon from "../components/BrandIcon";

export const metadata: Metadata = {
  title: "Cài đặt và sử dụng extension | EzNoting",
  description: "Kết nối extension EzNoting với ứng dụng web để ghi chú Google Meet, xem lời nói và chat trực tiếp, rồi lưu biên bản.",
};

const steps = [
  { title: "Cài và ghim EzNoting", body: "Dùng Google Chrome trên máy tính. Khi bản phát hành đã có trên Chrome Web Store, chọn Thêm vào Chrome. Mở menu Tiện ích (biểu tượng mảnh ghép), tìm EzNoting và bấm ghim để dễ mở trong cuộc họp." },
  { title: "Kết nối tài khoản EzNoting", body: "Đăng nhập EzNoting trong cùng profile Chrome đã cài extension, sau đó tải lại trang này. Bấm Kiểm tra kết nối ở phía trên; trạng thái Đã kết nối tài khoản xác nhận web đã chuyển đăng nhập sang extension. Tài khoản lưu biên bản là tài khoản đăng nhập EzNoting, có thể khác tài khoản tham gia Meet." },
  { title: "Mở Meet và bắt đầu ghi", body: "Mở danh sách người tham gia và khung chat trong Google Meet. Bấm biểu tượng EzNoting rồi chọn Bắt đầu tab này. Extension 0.5.0 mở trang ghi âm EzNoting. Trên trang web, bấm Bắt đầu, chọn tab cuộc họp, bật Chia sẻ âm thanh rồi cho phép micro nếu cần ghi giọng của bạn." },
  { title: "Xem live và lưu biên bản", body: "STT realtime chạy trên trang ghi âm EzNoting. Extension đồng bộ người tham gia và chat trong phiên. Khi xong, kết thúc và lưu ghi âm trên web, sau đó kết thúc thu thập trong popup extension. Audio, transcript và dữ liệu người tham gia được lưu vào cùng một biên bản." },
];
const faqs = [
  ["Tóm tắt miễn phí và Gemini API key riêng?", "Mỗi tài khoản có 10 cuộc họp được AI xử lý miễn phí, kể cả Live insight. Cùng cuộc họp có thể tóm tắt lại nhiều lần; yêu cầu thất bại không tính lượt. Hết 10 cuộc họp, mở Thiết lập tài khoản → AI & Gemini để nhập key riêng cho cuộc họp mới. Key riêng dùng hạn mức và chi phí của project của bạn; cần xác nhận Cloud Billing đang hoạt động để xử lý dữ liệu cuộc họp. Ghi âm, transcript và chat không bị khóa khi hết lượt AI."],
  ["Đã cài nhưng chưa kết nối?", "Kiểm tra web và Meet nằm trong cùng profile Chrome; extension phải đang bật. Chỉ bật một bản EzNoting trong cùng profile để tránh ghi trùng. Tải lại tab EzNoting rồi kiểm tra kết nối. Nếu token hết hạn, mở lại web để làm mới đăng nhập. Bản cài từ mã nguồn cũ có thể cần cấu hình ID riêng; bản Chrome Store dùng ID chính thức."],
  ["Không có tiếng hoặc thiếu lời của chính tôi?", "Trên trang ghi âm EzNoting, chọn chế độ ghi âm tab, chọn đúng tab Meet và bật Chia sẻ âm thanh. Cho phép micro trên web và kiểm tra thiết bị đầu vào nếu cần ghi giọng của bạn. Khi tạm dừng hoặc kết thúc ghi trên web, kiểm tra trạng thái trước khi tiếp tục nói."],
  ["Tên người nói chưa xác định hoặc chưa chính xác?", "Trang ghi âm dùng mô hình STT để phân nhóm giọng nói. Danh sách tài khoản Meet do extension thu thập được lưu kèm biên bản. Kiểm tra và gán tên cho các nhóm giọng khi cần. Nói chen nhau hoặc thiếu âm thanh có thể làm kết quả phân nhóm chưa chính xác."],
  ["Xuất báo cáo người tham gia?", "Sau khi kết thúc ghi và lưu biên bản, mở Tải xuống → Người tham gia (.xlsx). File gồm danh sách tài khoản, tổng thời gian có mặt quan sát được, các khoảng có mặt, tin nhắn và phát biểu. Cần extension 0.4.11 trở lên để có mốc thời gian. Dữ liệu chỉ tính từ lúc ghi; mở danh sách người tham gia giúp tăng độ phủ khi Meet ẩn ô. Khoảng mất quan sát không được cộng. Biên bản cũ ghi Không có dữ liệu; không tự gộp người trùng tên hoặc ID thay đổi khi vào lại."],
  ["Thiếu tin nhắn chat?", "Mở khung chat trong Meet và giữ nó hiển thị khi cần ghi tin nhắn. Extension chỉ đọc nội dung chat mà giao diện Meet cung cấp, không truy xuất lịch sử tin nhắn đã bị Meet ẩn."],
  ["Tại sao tự động ghi chưa thu âm được?", "Chrome có thể cần thao tác của bạn để bắt đầu thu âm tab. Mở popup ngay trên tab Meet và bấm Bắt đầu tab này. Chỉ bật Tự động ghi khi mở phòng họp nếu bạn đã muốn cho phép các phiên sau tự bắt đầu."],
];

export default function ExtensionGuidePage() {
  return <div className="min-h-screen bg-slate-50">
    <header className="border-b border-slate-200 bg-white"><nav aria-label="Điều hướng hướng dẫn" className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
      <Link href="/" className="flex items-center gap-2 font-bold text-slate-800"><span className="rounded-lg bg-primary-600 p-2 text-white"><BrandIcon /></span>EzNoting</Link>
      <div className="flex items-center gap-4 text-sm"><Link href="/privacy" className="text-slate-600 hover:text-primary-600">Quyền riêng tư</Link><Link href="/" className="font-semibold text-primary-600">Mở dashboard</Link></div>
    </nav></header>
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-10">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-primary-600"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Về dashboard</Link>
      <div className="mb-7 mt-5"><p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary-600"><Chrome className="h-4 w-4" aria-hidden="true" />Chrome trên máy tính · Google Meet</p><h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Cài đặt & sử dụng EzNoting</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">Kết nối cuộc họp Meet với EzNoting để theo dõi lời nói và chat trực tiếp, sau đó lưu lại biên bản.</p></div>
      <ExtensionSetupCard detailed />
      <section aria-labelledby="steps-heading"><h2 id="steps-heading" className="mb-4 text-lg font-bold text-slate-800">Bắt đầu với 4 bước</h2><ol className="space-y-3">{steps.map((step, index) => <li key={step.title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-600">{index + 1}</span><div><h3 className="font-bold text-slate-800">{step.title}</h3><p className="mt-2 text-sm leading-7 text-slate-600">{step.body}</p></div></li>)}</ol></section>
      <section aria-labelledby="tips-heading" className="my-6 rounded-2xl border border-primary-100 bg-primary-50/50 p-5 md:p-6"><h2 id="tips-heading" className="mb-3 font-bold text-slate-800">Để bản ghi đầy đủ hơn</h2><ul className="space-y-3 text-sm leading-relaxed text-slate-600">{[
        [Mic, "Mỗi người dùng đúng mic của mình; hạn chế tiếng vọng và nói chồng lên nhau."],
        [MessageSquare, "Mở khung chat để thu tin nhắn; danh sách người tham gia giúp tăng độ phủ. Phụ đề không bắt buộc. Tên người nói dựa vào bằng chứng từ Meet."],
        [Check, "Cùng một tài khoản: mở đoạn mới sau 5 nhịp ngắt, mỗi nhịp im lặng ít nhất 1 giây. Đổi tài khoản: tách đoạn khi kết quả nhận dạng xác định được người mới. Chữ vẫn cập nhật trong lúc nói."],
      ].map(([Icon, text]) => { const I = Icon as typeof Check; return <li key={String(text)} className="flex gap-2"><I className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" /><span>{String(text)}</span></li>; })}</ul></section>
      <section id="troubleshooting" aria-labelledby="faq-heading" className="scroll-mt-6"><h2 id="faq-heading" className="mb-4 text-lg font-bold text-slate-800">Xử lý sự cố</h2><div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-5">{faqs.map(([q,a]) => <details key={q} className="py-4"><summary className="cursor-pointer text-sm font-semibold text-slate-800">{q}</summary><p className="mt-3 text-sm leading-7 text-slate-600">{a}</p></details>)}</div><p className="mt-3 text-sm text-slate-500">Cần hỗ trợ thêm? <a href="mailto:trinhlk.vnu@gmail.com" className="font-semibold text-primary-600 underline">Liên hệ hỗ trợ</a>. Chỉ gửi thông tin lỗi cần thiết; không gửi mật khẩu hay token đăng nhập.</p></section>
      <aside className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5"><ShieldCheck className="h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" /><div><h2 className="font-bold text-slate-800">Trước khi ghi cuộc họp</h2><p className="mt-2 text-sm leading-7 text-slate-600">Hãy thông báo và có sự đồng ý phù hợp của người tham gia. Âm thanh được gửi tới máy chủ nhận dạng và được lưu cùng dữ liệu phiên, transcript và chat. Trang live có Live insight gửi nội dung văn bản tới dịch vụ AI để tóm tắt. <Link href="/privacy" className="font-semibold text-primary-600 underline">Đọc chính sách quyền riêng tư và cách yêu cầu xóa dữ liệu</Link>.</p></div></aside>
    </main>
    <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-xs text-slate-500">© 2026 EzNoting là sản phẩm độc lập, không do Google cung cấp hay chứng thực.</footer>
  </div>;
}
