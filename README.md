# AI Meeting Assistant (demo-meet)

A smart web application built with **Next.js 16** + **React 19** to record, transcribe, edit, and summarize meetings. Turns long audio recordings into accurate transcripts and actionable insights.

**Status:** Frontend companion to [`Server-local-ai-meeting-assistant`](https://github.com/NguyenVanHung2004/Server-local-ai-meeting-assistant) (RunPod Serverless ASR backend). This repo handles UI, AI summarization, storage, and export.

---

## 📋 Mục lục

- [Tính năng](#-tính-năng)
- [Tech stack](#-tech-stack)
- [Cài đặt](#-cài-đặt)
- [Cấu hình môi trường](#-cấu-hình-môi-trường)
- [Scripts](#-scripts)
- [Cấu trúc dự án](#-cấu-trúc-dự-án)
- [API Routes](#-api-routes-server-side)
- [Tích hợp Backend ASR (Server-local)](#-tích-hợp-backend-asr-server-local)
- [Triển khai](#-triển-khai)
- [Tài liệu](#-tài-liệu)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Tính năng

### 🎙️ Ghi âm & Phiên âm
- **Live Recording**: Ghi âm trực tiếp trong trình duyệt, transcript realtime
- **Upload audio**: Upload file có sẵn (mp3, wav, m4a, webm) → chuyển lên Firebase Storage
- **Hybrid pipeline**: Tích hợp MeetingBaaS bot cho phòng họp Zoom/Meet/Teams

### 📝 Chỉnh sửa Transcript
- **Karaoke highlighting**: Highlight từ theo thời gian thực khi phát audio
- **Inline edit**: Click đúp để sửa text mà không mất timestamp
- **Split / Merge**: Tách/ghép câu bằng `Enter` / `Backspace` (tại đầu dòng)
- **Speaker management**: Đổi tên người nói, sắp xếp

### ✨ AI-Powered Summarization (OpenCode Go)
- **Biên bản cuộc họp**: Tóm tắt theo template Markdown tùy chỉnh
- **Live summary**: Tóm tắt incremental trong khi nghe (mode `segment`)
- **Action items**: Trích xuất task từ transcript (mode `extract_json`)
- **Placeholder fill**: Tự động điền placeholder trong file Word (mode `fill_placeholders`)
- **Q&A**: Hỏi đáp dựa trên nội dung cuộc họp (mode `qa`)

### 📄 Export
- **DOCX**: Xuất file Word với format đầy đủ
- **PDF**: Render PDF từ Markdown
- **Plain text**: Copy nhanh

### 🔗 Tích hợp Cloud
- **Firebase Auth**: Đăng nhập với email/Google
- **Firestore + Storage**: Lưu meeting metadata + audio files
- **Google Drive**: Import file từ Google Drive vào workspace
- **Share link**: Chia sẻ read-only qua URL công khai

### 🎯 UX
- **Onboarding tour**: Hướng dẫn tương tác cho người mới (`driver.js`)
- **Command palette**: Truy cập nhanh chức năng bằng phím tắt
- **IndexedDB**: Draft offline (không cần mạng để edit)

---

## 🛠 Tech stack

### Frontend
- **Framework**: Next.js 16 (App Router) + React 19
- **Styling**: Tailwind CSS v4 + `clsx` + `class-variance-authority`
- **UI Components**: Radix-style primitives + `lucide-react` icons
- **Rich Text Editor**: TipTap v3 (extension-placeholder, starter-kit)
- **Forms**: React Hook Form + Zod validation
- **Markdown**: `react-markdown` + `remark-gfm`
- **Toast**: `sonner`
- **Tour**: `driver.js`
- **Audio (browser)**: `@ffmpeg/ffmpeg` + `@ffmpeg/util` (in-browser processing)

### Backend & Storage
- **Auth + DB + Storage**: Firebase (`firebase`, `firebase-admin`)
- **Local cache**: IndexedDB (offline draft support)
- **Email**: `nodemailer` (SMTP)
- **Cloud storage (alternative)**: `@vercel/blob`

### AI / ML
- **LLM**: OpenCode Go (`https://opencode.ai/zen/go/v1`, model `mimo-v2.5`)
- **ASR**: Server từ repo [`Server-local-ai-meeting-assistant`](https://github.com/NguyenVanHung2004/Server-local-ai-meeting-assistant) deploy trên RunPod Serverless (Sherpa-ONNX Zipformer + Pyannote)
- **Bot recording**: MeetingBaaS API
- **Zoom integration**: Zoom OAuth + Recording API

### Export
- **DOCX**: `docx`
- **PDF**: `html2pdf.js` + `jsPDF` + `html2canvas`

### Testing
- **Unit**: Vitest + `@testing-library/react` + `happy-dom`
- **E2E**: Playwright
- **Mocks**: MSW (Mock Service Worker) + `fake-indexeddb`

---

## 📦 Cài đặt

### Prerequisites

- **Node.js**: v20+ (Next.js 16 yêu cầu tối thiểu)
- **npm** hoặc **yarn** hoặc **pnpm**
- **Firebase project** (Auth + Firestore + Storage enabled)
- **OpenCode Go API key** (lấy tại https://opencode.ai/zen/go/v1)
- **RunPod Serverless endpoint** (ASR backend) — xem [Tích hợp Server-local](#-tích-hợp-backend-asr-server-local)

### Bước 1: Clone & install

```bash
git clone https://github.com/NguyenVanHung2004/demo-meet.git
cd demo-meet
npm install
```

### Bước 2: Tạo file `.env.local`

```bash
cp .env.example .env.local
```

Sửa `.env.local`, điền các giá trị thật (xem chi tiết ở [Cấu hình môi trường](#-cấu-hình-môi-trường)).

### Bước 3: Chạy dev server

```bash
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

### Bước 4: Build production

```bash
npm run build
npm start
```

---

## 🔐 Cấu hình môi trường

File `.env.example` liệt kê **22 biến** đã được verify là đang được sử dụng trong code (grep verified). Xem chi tiết tại [`.env.example`](./.env.example).

| Nhóm | Biến chính | Mục đích |
|---|---|---|
| **RunPod** | `NEXT_PUBLIC_RUNPOD_API_KEY`, `NEXT_PUBLIC_RUNPOD_ENDPOINT_ID` | Gọi ASR backend |
| **AI/LLM** | `OPEN_CODE_GO_API_KEY` | Tóm tắt, action items, Q&A |
| **Firebase** | `NEXT_PUBLIC_FIREBASE_*` (7 vars), `FIREBASE_SERVICE_ACCOUNT_KEY` | Auth + Storage |
| **Email** | `EMAIL_USER`, `EMAIL_PASS` | Gửi task assignment |
| **Google OAuth** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Drive import |
| **MeetingBaaS** | `MEETINGBAAS_API_KEY`, `MEETINGBAAS_WEBHOOK_SECRET` | Bot recording |
| **Vercel Blob** | `BLOB_READ_WRITE_TOKEN` | Alternative storage |
| **Realtime WS** | `NEXT_PUBLIC_REALTIME_PROCESSING_SERVER` | Live transcription |
| **App URLs** | `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL` | OAuth callbacks, email links |

**Lưu ý ký hiệu:**
- `NEXT_PUBLIC_*` → có trong browser bundle (an toàn công khai)
- Các biến không có prefix → chỉ server-side API routes

Xem [`.env.example`](./.env.example) để có example đầy đủ cho từng biến.

---

## 🏃 Scripts

```bash
npm run dev              # Start Next.js dev server (port 3000)
npm run build            # Production build
npm run lint              # ESLint
npm test                 # Run Vitest unit tests
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Vitest with coverage report
npm run test:ui          # Vitest UI
npm run test:e2e         # Run Playwright E2E tests
npm run test:e2e:ui      # Playwright UI
```

---

## 📂 Cấu trúc dự án

```
demo-meet/
├── app/                              # Next.js App Router
│   ├── (dashboard)/                  # Auth-protected dashboard routes
│   │   ├── edit/[id]/                # Editor page
│   │   ├── live/                     # Live recording list
│   │   └── meeting/[id]/             # Meeting detail
│   ├── api/                          # Server-side API routes
│   │   ├── bots/                     # MeetingBaaS bot integration
│   │   │   ├── join/                 # POST: dispatch a bot
│   │   │   └── status/               # GET: poll bot status
│   │   ├── drive/                    # Google Drive import
│   │   ├── email/                    # SMTP send (task assignment)
│   │   ├── gemini/                   # OpenCode Go LLM (5 modes)
│   │   ├── proxy-file/               # Proxy files (CORS workaround)
│   │   ├── training-data/            # Export training data
│   │   ├── upload/                   # Vercel Blob client upload
│   │   ├── webhooks/meetingbaas/     # MeetingBaaS webhook handler
│   │   └── zoom/                     # Zoom OAuth + recording import
│   ├── components/                   # React components
│   │   ├── Dashboard/                # Dashboard widgets
│   │   ├── Editor/                   # Transcript editor
│   │   ├── Live/                     # Live recording UI
│   │   ├── Meeting/                  # Meeting cards/headers
│   │   ├── Minutes/                  # Meeting minutes
│   │   ├── Tasks/                    # Task lists
│   │   ├── Team/                     # Team management
│   │   └── ui/                       # Design system (button, button, etc.)
│   ├── context/                      # React Context (Auth, GlobalUI)
│   ├── hooks/                        # Custom hooks
│   │   ├── useAuth.ts                # Firebase auth hook
│   │   ├── useSpeechRecognition.ts # Browser Web Speech API
│   │   ├── useLocalTranscription.ts # WebSocket live transcription
│   │   ├── useSummarize.ts          # AI summary hook
│   │   ├── useTaskExtraction.ts     # Action items extraction
│   │   └── ...
│   ├── lib/                          # Shared libraries
│   │   ├── api.ts                    # RunPod API client
│   │   ├── firebase.ts               # Firebase client SDK
│   │   ├── firebase-admin.ts         # Firebase Admin SDK (server)
│   │   ├── db.ts                     # IndexedDB wrapper
│   │   ├── indexedDB.ts              # IndexedDB helpers
│   │   ├── docx/                     # DOCX generation
│   │   ├── db/                       # DB layer (folder, live, meeting, etc.)
│   │   └── ...
│   ├── live/[id]/                    # Live recording detail page
│   ├── minutes/[id]/                 # Read-only minutes page
│   ├── share/[id]/                   # Public read-only share page
│   ├── tasks/                        # Tasks dashboard
│   ├── team/                         # Team management
│   ├── training/                     # Training data view
│   ├── globals.css                   # Tailwind + design tokens
│   └── layout.tsx                    # Root layout
├── tests/                            # Test suites
│   ├── api/                          # API route tests (Vitest)
│   ├── components/                   # Component tests
│   ├── e2e/                          # Playwright E2E tests
│   ├── hooks/                        # Hook tests
│   └── lib/                          # Library tests
├── scripts/
│   └── hybrid_server_extension.py    # Helper script for hybrid transcription
├── docs/
│   ├── refactor-code/                # Refactor history (PHASE_3..6)
│   └── ui-redesign/                  # UI redesign history (PHASE_1..7)
├── public/                           # Static assets
├── .env.example                      # ← START HERE
├── next.config.ts
├── tailwind.config (via postcss.config.mjs)
├── tsconfig.json
├── vitest.config.mts
├── playwright.config.ts
└── package.json
```

---

## 🔌 API Routes (server-side)

Tất cả dưới `/app/api/*`. **Đa số cần auth** (Firebase ID token trong header `Authorization: Bearer ...`).

### AI / LLM
| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/gemini` | Tóm tắt / extract action items / placeholder fill / Q&A. Mode: `segment`, `full`, `extract_json`, `fill_placeholders`, `detect_fill`, `qa` |

### RunPod ASR proxy
| Method | Path | Mô tả |
|---|---|---|
| (client-side) | gọi trực tiếp `https://api.runpod.ai/v2/{ID}/run` | Xem [Server-local README](https://github.com/NguyenVanHung2004/Server-local-ai-meeting-assistant) |

### Bot recording (MeetingBaaS)
| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/bots/join` | Dispatch bot vào meeting room |
| `GET` | `/api/bots/status?botId=...` | Poll bot status |
| `POST` | `/api/webhooks/meetingbaas` | Webhook nhận khi bot xong |

### File storage
| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/upload` | Vercel Blob client upload (token-bucket) |
| `GET` | `/api/proxy-file` | Proxy file (CORS workaround) |

### Google Drive
| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/drive/auth` | Bắt đầu OAuth flow |
| `GET` | `/api/drive/callback` | OAuth callback |
| `GET` | `/api/drive/list` | List user's Drive files |
| `GET` | `/api/drive/download` | Download file |
| `POST` | `/api/drive/import` | Import vào workspace |

### Zoom
| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/zoom/auth` | OAuth start |
| `GET` | `/api/zoom/callback` | OAuth callback |
| `GET` | `/api/zoom/recordings` | List cloud recordings |
| `POST` | `/api/zoom/import` | Import vào workspace |

### Email & Data
| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/email` | Gửi task assignment email |
| `POST` | `/api/training-data` | Export training data (download) |

---

## 🔗 Tích hợp Backend ASR (Server-local)

Frontend **không tự chạy ASR**. Nó gọi [Server-local-ai-meeting-assistant](https://github.com/NguyenVanHung2004/Server-local-ai-meeting-assistant) deploy trên **RunPod Serverless**.

### Setup Server-local:
1. Deploy repo [Server-local](https://github.com/NguyenVanHung2004/Server-local-ai-meeting-assistant) lên RunPod (xem README bên đó)
2. Lấy **Endpoint ID** và **API Key** từ RunPod Console

### Config trong frontend:
```bash
NEXT_PUBLIC_RUNPOD_API_KEY=rpa_xxx_your_api_key
NEXT_PUBLIC_RUNPOD_ENDPOINT_ID=your_endpoint_id
```

### Flow tích hợp:

```
User upload audio (frontend)
   ↓
Upload to Firebase Storage → get URL
   ↓
Frontend gọi RunPod API: POST https://api.runpod.ai/v2/{ID}/run
   { input: { action: "transcribe", audio_url: "https://...", language: "vi" } }
   ↓
RunPod trả { id: "job-uuid" }
   ↓
Frontend poll: GET https://api.runpod.ai/v2/{ID}/status/{job-id}
   (mỗi 3-5 giây cho tới khi status = COMPLETED)
   ↓
RunPod trả { output: { transcript: [...segments...] } }
   ↓
Frontend render editor + trigger summarize
```

Chi tiết API xem tại: https://github.com/NguyenVanHung2004/Server-local-ai-meeting-assistant/blob/cleanup/remove-unused-files/README.md

---

## 🚀 Triển khai

### Vercel (khuyến nghị cho Next.js)

1. Push repo lên GitHub
2. Vào https://vercel.com → **New Project** → import repo `demo-meet`
3. Set **Environment Variables** (paste tất cả từ `.env.local`)
4. **Build settings**: mặc định (Next.js auto-detect)
5. **Deploy**

### Các services cần setup trước khi go-live:

- [ ] Firebase project với Auth + Firestore + Storage enabled
- [ ] Storage rules deployed (`storage.rules`)
- [ ] Authorized redirect URIs trong Google Cloud Console (cho Drive + Zoom OAuth)
- [ ] MeetingBaaS webhook URL trỏ về `https://your-app.com/api/webhooks/meetingbaas`
- [ ] Email SMTP (Gmail App Password recommended)
- [ ] OpenCode Go API key
- [ ] RunPod Serverless endpoint running

---

## 📚 Tài liệu

Tài liệu kỹ thuật nằm trong folder [`docs/`](./docs/):

- [`docs/refactor-code/REFACTOR_PLAN.md`](./docs/refactor-code/REFACTOR_PLAN.md) — Kế hoạch refactor tổng thể
- [`docs/refactor-code/PHASE_3.md`](./docs/refactor-code/PHASE_3.md) — Phase 3: Structure + Type Safety
- [`docs/refactor-code/PHASE_4.md`](./docs/refactor-code/PHASE_4.md) — Phase 4: Performance
- [`docs/refactor-code/PHASE_5.md`](./docs/refactor-code/PHASE_5.md)
- [`docs/refactor-code/PHASE_6.md`](./docs/refactor-code/PHASE_6.md)
- [`docs/ui-redesign/UI-IMPROVEMENT-PLAN.md`](./docs/ui-redesign/UI-IMPROVEMENT-PLAN.md) — UI redesign plan
- [`docs/ui-redesign/PHASE_1.md`](./docs/ui-redesign/PHASE_1.md) đến [`PHASE_7.md`](./docs/ui-redesign/PHASE_7.md) — UI redesign history
- [`docs/TEST_PLAN.md`](./docs/TEST_PLAN.md) — Test plan

---

## 🐛 Troubleshooting

### ❌ Lỗi "Missing or insufficient permissions" (Firestore)
- Kiểm tra Firestore security rules đã deploy chưa
- User chưa login → redirect về `/login`

### ❌ Upload file fails
- Kiểm tra `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` đúng chưa
- File > 100 MB sẽ bị reject (`maximumSizeInBytes` trong `/api/upload`)

### ❌ ASR job treo (không có transcript)
- Check RunPod endpoint health: `GET https://api.runpod.ai/v2/{ID}/health`
- Xem logs RunPod → tìm `[INIT ERROR]`
- Cold start lần đầu mất 30-60s, bình thường

### ❌ Email không gửi được
- `EMAIL_PASS` phải là Gmail App Password (không phải password thường)
- Kiểm tra 2FA đã bật trên Gmail

### ❌ Google Drive OAuth fail
- `GOOGLE_REDIRECT_URI` phải match đúng với callback URL config trong Google Cloud Console
- Nếu deploy lên production, đổi `http://localhost:3000` thành `https://your-app.com`

### ❌ MeetingBaaS bot không join meeting
- Kiểm tra `MEETINGBAAS_API_KEY` còn valid
- Webhook URL phải public (HTTPS) — dùng Vercel URL không phải localhost

---

## 📄 License

This project is created as part of a graduation thesis (Khoá luận tốt nghiệp).

## 🔗 Related repositories

- **Backend (ASR)**: [`Server-local-ai-meeting-assistant`](https://github.com/NguyenVanHung2004/Server-local-ai-meeting-assistant) — RunPod Serverless deployment với Zipformer + Pyannote