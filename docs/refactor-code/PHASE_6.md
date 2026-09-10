# Phase 6 — Routing: SPA → Proper Routes

> **Tham chiếu:** Plan tổng thể ở [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md) (dòng 575-639). File này ghi lại chi tiết implementation Phase 6.
>
> **Phase trước:** [`PHASE_5.md`](./PHASE_5.md) — UI Polish (✅)
>
> **Trạng thái:** ✅ **HOÀN THÀNH**

## Tổng quan

| Task | Tên | Effort | Impact | Dependency | Trạng thái |
|------|-----|--------|--------|-----------|-----------|
| **6A** | Tạo 3 route pages mới (`/meeting/[id]`, `/edit/[id]`, `/live`) | 2 ngày | 🔴 Cao | — | ✅ |
| **6B** | Tạo `(dashboard)/layout.tsx` với sidebar + PollingManager | 1 ngày | 🔴 Cao | 6A | ✅ |
| **6C** | Refactor `page.tsx` — xóa state machine | 1 ngày | 🔴 Cao | 6A, 6B | ✅ |
| **6D** | Auth middleware (`middleware.ts`) | 0.5 ngày | 🟡 Trung bình | 6B | ✅ |
| **6E** | Breadcrumb `href` + URL params cho search/filter | 0.5 ngày | 🟢 Thấp | 6C | ✅ |
| **6F** | Cleanup + docs | 0.5 ngày | 🟢 Thấp | 6C | ✅ |

**Tổng effort:** ~5-6 ngày

---

## Thứ tự thực hiện

```
Day 1-2: 6A — Tạo 3 route pages mới + helpers
Day 3:   6B — Tạo (dashboard)/layout.tsx
Day 4:   6C — Refactor page.tsx (xóa state machine)
Day 5:   6D + 6E — Auth middleware + Breadcrumb href
Day 6:   6F — Cleanup + docs + test
```

---

## Vấn đề chính cần giải quyết

### 1. Data flow: Meeting object → Route params

Hiện tại `page.tsx` truyền `meeting` object + `audioUrl` trực tiếp qua props:

```
Dashboard → handleViewDetail(meeting) → setAudioUrl + setCurrentMeeting → MeetingDetailState
```

Với routing, mỗi page phải **tự fetch data từ DB** bằng meeting ID từ URL.

**Giải pháp:** Tạo helper `loadMeetingAudio(meeting)` trong `app/lib/utils/audio.ts` — xử lý cả draft (IndexedDB) và cloud (Firestore).

### 2. `handleBackgroundSummarize` nằm trong `page.tsx`

Hiện tại hàm này dùng `user` từ context và `toast` từ GlobalUI. Cả EditorState và MeetingDetailState đều gọi nó.

**Giải pháp:** Tạo custom hook `app/hooks/useSummarize.ts` — extract logic ra ngoài, bất kỳ page nào cũng import được.

### 3. Live recording params

Hiện tại `handleLiveStart(language, title, objectives)` set state rồi chuyển. Với routing, cần truyền qua URL search params: `/live?lang=vi&title=...&objectives=...`

### 4. PollingManager phải persist across routes

Hiện tại render trong `page.tsx` (chỉ Dashboard). Cần move lên `(dashboard)/layout.tsx`.

---

## 6A. Tạo 3 route pages mới

### 6A.1 Helper: `app/lib/utils/audio.ts` (tạo mới)

Tạo hàm helper để resolve audio URL từ meeting — xử lý cả draft (IndexedDB blob) và cloud (Firestore URL):

```typescript
import { Meeting } from "../db";
import { MEETING_STATUS } from "../constants";

/**
 * Resolve audio URL for a meeting.
 * For drafts: loads audio blob from IndexedDB and creates object URL.
 * For cloud meetings: returns the stored Firebase Storage URL.
 */
export async function resolveAudioUrl(meeting: Meeting): Promise<string> {
  if (meeting.status === MEETING_STATUS.DRAFT) {
    try {
      const { getDraftFull } = await import("../indexedDB");
      const fullDraft = await getDraftFull(meeting.id);
      if (fullDraft?.audioBlob) {
        return URL.createObjectURL(fullDraft.audioBlob);
      }
    } catch (e) {
      console.error("Failed to load draft audio", e);
    }
  }
  return meeting.audioUrl || "";
}
```

### 6A.2 Hook: `app/hooks/useSummarize.ts` (tạo mới)

Extract `handleBackgroundSummarize` từ `page.tsx` thành custom hook:

```typescript
"use client";
import { useCallback } from "react";
import { Meeting, updateMeetingProcess } from "../lib/db";
import { MEETING_STATUS } from "../lib/constants";
import { uploadAudioToFirebase, requestSummary } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useGlobalUI } from "../context/GlobalUIProvider";

export function useSummarize() {
  const { user } = useAuth();
  const { toast } = useGlobalUI();

  return useCallback(async (
    meeting: Meeting,
    transcriptText: string,
    templateStructure?: string
  ) => {
    const isDraft = meeting.status === MEETING_STATUS.DRAFT;
    const meetingId = meeting.id;

    if (isDraft) {
      toast.info("Đang đồng bộ bản nháp lên Cloud trước khi tóm tắt...");
      try {
        const { getDraftFull } = await import("../lib/indexedDB");
        const draftFull = await getDraftFull(meetingId);
        if (draftFull) {
          const file = new File(
            [draftFull.audioBlob],
            `${draftFull.meta.title}.webm`,
            { type: "audio/webm" }
          );
          const url = await uploadAudioToFirebase(file, user?.uid || "");

          const finalMeeting = {
            ...draftFull.meta,
            audioUrl: url,
            status: MEETING_STATUS.SUMMARIZING,
            jobId: undefined,
          };
          const { saveMeeting } = await import("../lib/db");
          await saveMeeting(finalMeeting);
        }
      } catch (err) {
        toast.error("Lỗi đồng bộ bản nháp: " + (err as Error).message);
        return;
      }
    } else {
      await updateMeetingProcess(meetingId, {
        status: MEETING_STATUS.SUMMARIZING,
      });
    }

    try {
      toast.info("Đang gửi AI tóm tắt...");
      const summary = await requestSummary(
        transcriptText,
        meeting.title,
        templateStructure,
        meeting.objectives
      );

      await updateMeetingProcess(meetingId, {
        summary: summary,
        status: MEETING_STATUS.COMPLETED,
      });
      toast.success("Tóm tắt hoàn tất!");
    } catch (summaryError) {
      console.error("Lỗi tóm tắt:", summaryError);
      toast.error("Lỗi khi gọi AI tóm tắt: " + (summaryError as Error).message);
      await updateMeetingProcess(meetingId, {
        status: MEETING_STATUS.TRANSCRIBED,
      });
    }
  }, [user, toast]);
}
```

### 6A.3 `app/(dashboard)/meeting/[id]/page.tsx` (tạo mới)

```typescript
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getMeetingById, Meeting } from "@/app/lib/db";
import { resolveAudioUrl } from "@/app/lib/utils/audio";
import { useSummarize } from "@/app/hooks/useSummarize";
import MeetingDetailState from "@/app/components/MeetingDetailState";

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params?.id as string;
  const summarize = useSummarize();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meetingId) return;

    const load = async () => {
      try {
        setLoading(true);
        const data = await getMeetingById(meetingId);
        if (!data) {
          setError("Cuộc họp không tồn tại");
          return;
        }
        setMeeting(data);
        const url = await resolveAudioUrl(data);
        setAudioUrl(url);
      } catch (e) {
        console.error("Failed to load meeting", e);
        setError("Không thể tải dữ liệu cuộc họp");
      } finally {
        setLoading(false);
      }
    };
    load();

    // Cleanup object URL nếu có
    return () => {
      if (audioUrl && audioUrl.startsWith("blob:")) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [meetingId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-slate-500">{error || "Không tìm thấy"}</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
        >
          Về Dashboard
        </button>
      </div>
    );
  }

  return (
    <MeetingDetailState
      meeting={meeting}
      audioSrc={audioUrl}
      onBack={() => router.push("/")}
      onEdit={() => router.push(`/edit/${meeting.id}`)}
      onSummarize={summarize}
    />
  );
}
```

### 6A.4 `app/(dashboard)/edit/[id]/page.tsx` (tạo mới)

```typescript
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getMeetingById, Meeting } from "@/app/lib/db";
import { resolveAudioUrl } from "@/app/lib/utils/audio";
import { useSummarize } from "@/app/hooks/useSummarize";
import EditorState from "@/app/components/EditorState";

export default function EditPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params?.id as string;
  const summarize = useSummarize();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meetingId) return;

    const load = async () => {
      try {
        setLoading(true);
        const data = await getMeetingById(meetingId);
        if (!data) {
          setError("Cuộc họp không tồn tại");
          return;
        }
        setMeeting(data);
        const url = await resolveAudioUrl(data);
        setAudioUrl(url);
      } catch (e) {
        console.error("Failed to load meeting", e);
        setError("Không thể tải dữ liệu cuộc họp");
      } finally {
        setLoading(false);
      }
    };
    load();

    return () => {
      if (audioUrl && audioUrl.startsWith("blob:")) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [meetingId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-slate-500">{error || "Không tìm thấy"}</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
        >
          Về Dashboard
        </button>
      </div>
    );
  }

  return (
    <EditorState
      audioSrc={audioUrl}
      initialData={meeting}
      onBack={() => router.push("/")}
      onSummarize={summarize}
    />
  );
}
```

### 6A.5 `app/(dashboard)/live/page.tsx` (tạo mới)

```typescript
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useGlobalUI } from "@/app/context/GlobalUIProvider";
import LiveRecordingState from "@/app/components/LiveRecordingState";

export default function LiveRecordingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useGlobalUI();

  const language = (searchParams.get("lang") as "vi" | "en") || "vi";
  const title = searchParams.get("title") || "";
  const objectives = searchParams.get("objectives") || "";

  return (
    <LiveRecordingState
      initialLanguage={language}
      initialTitle={title || `Cuộc họp trực tiếp ${new Date().toLocaleDateString("vi-VN")}`}
      initialObjectives={objectives}
      onFinish={() => {
        toast.success("Đã lưu ghi âm!");
        router.push("/");
      }}
      onBack={() => router.push("/")}
    />
  );
}
```

---

## 6B. Tạo `(dashboard)/layout.tsx`

### Cấu trúc thư mục mới

```
app/
├── (dashboard)/
│   ├── layout.tsx              ← MỚI: shared layout
│   ├── page.tsx                ← Dashboard (refactored từ app/page.tsx)
│   ├── edit/[id]/page.tsx      ← MỚI
│   ├── meeting/[id]/page.tsx   ← MỚI
│   ├── live/page.tsx           ← MỚI
│   ├── minutes/page.tsx        ← MOVE từ app/minutes/
│   ├── minutes/[id]/page.tsx   ← MOVE từ app/minutes/[id]/
│   ├── tasks/page.tsx          ← MOVE từ app/tasks/
│   ├── tasks/[id]/page.tsx     ← MOVE từ app/tasks/[id]/
│   ├── team/page.tsx           ← MOVE từ app/team/
│   └── training/page.tsx       ← MOVE từ app/training/
├── api/                        ← giữ nguyên
├── share/[id]/page.tsx         ← giữ nguyên (public)
├── live/[id]/page.tsx          ← giữ nguyên (viewer, khác live recording)
├── layout.tsx                  ← root layout (AuthProvider + GlobalUI)
└── middleware.ts               ← MỚI
```

### `app/(dashboard)/layout.tsx` (tạo mới)

```typescript
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import PollingManager from "@/app/components/PollingManager";
import Sidebar from "@/app/components/Dashboard/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Shared Sidebar */}
      <Sidebar onLogout={logout} />

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        <PollingManager onUpdate={() => {}} />
        {children}
      </main>
    </div>
  );
}
```

### Lưu ý quan trọng về Sidebar

`Sidebar.tsx` hiện tại nhận props `currentTab` và `onTabChange` — chỉ có ý nghĩa cho Dashboard. Cần refactor:

1. **Navigation links** (Dashboard, Tasks, Team, Minutes, Training) → render trong layout, dùng `usePathname()` để highlight
2. **Dashboard-specific tabs** (All, Trash) → giữ trong `DashboardState`, render như sub-tabs

**Thay đổi `Sidebar.tsx`:**
- Thêm prop `onLogout` (thay vì lấy từ DashboardState)
- Bỏ prop `currentTab` / `onTabChange` (chuyển sang DashboardState)
- Dùng `usePathname()` cho active state của navigation links

---

## 6C. Refactor `page.tsx` — xóa state machine

### Trước (hiện tại)

```typescript
// page.tsx có:
type AppState = "DASHBOARD" | "PROCESSING" | "EDITOR" | "LIVE_RECORDING" | "MEETING_DETAIL";
const [currentState, setCurrentState] = useState<AppState>("DASHBOARD");
const [currentMeeting, setCurrentMeeting] = useState<Meeting | null>(null);
const [audioUrl, setAudioUrl] = useState<string | null>(null);
// + 10 handlers navigation
```

### Sau

`(dashboard)/page.tsx` chỉ còn Dashboard logic:

```typescript
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardState from "@/app/components/DashboardState";
import DriveImportModal from "@/app/components/DriveImportModal";
import BotJoinModal from "@/app/components/BotJoinModal";
// ... other imports

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useGlobalUI();
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isBotModalOpen, setIsBotModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const triggerRefresh = () => setRefreshSignal((prev) => prev + 1);

  const handleFileUpload = async (file, language, title, objectives) => {
    // ... upload logic (giữ nguyên, không navigate)
  };

  const handleReprocess = async (meeting) => {
    // ... reprocess logic (giữ nguyên)
  };

  return (
    <>
      <DashboardState
        refreshSignal={refreshSignal}
        onImport={handleFileUpload}
        onUseSample={handleStartDemo}
        onLive={(lang, title, obj) => {
          const params = new URLSearchParams();
          if (lang) params.set("lang", lang);
          if (title) params.set("title", title);
          if (obj) params.set("objectives", obj);
          router.push(`/live?${params.toString()}`);
        }}
        onOpenMeeting={(m) => router.push(`/meeting/${m.id}`)}
        onReprocess={handleReprocess}
        onOpenDrive={() => setIsDriveModalOpen(true)}
        onOpenBot={() => setIsBotModalOpen(true)}
      />

      <DriveImportModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onImportSuccess={triggerRefresh}
      />
      <BotJoinModal
        isOpen={isBotModalOpen}
        onClose={() => setIsBotModalOpen(false)}
        onUpdate={triggerRefresh}
      />

      {/* Upload Progress Widget */}
      {uploadProgress !== null && (
        <UploadProgressWidget progress={uploadProgress} />
      )}
    </>
  );
}
```

### Xóa khỏi `page.tsx`

- `AppState` type export
- `currentState`, `currentMeeting`, `audioUrl` state
- `handleDirectEdit`, `handleViewDetail`, `handleSwitchToEdit`
- `handleBackToDashboard`, `handleBackFromEditor`
- `handleLiveStart`, `handleFinishLive`
- `handleBackgroundSummarize` → đã move sang `useSummarize` hook
- Render blocks cho `PROCESSING`, `EDITOR`, `LIVE_RECORDING`, `MEETING_DETAIL`

### Xử lý `handleBackgroundSummarize` từ EditorState/MeetingDetailState

Cả 2 component này đều gọi `onSummarize(meeting, text, templateStructure)`. Sau refactor:

- `MeetingDetailState` nhận `onSummarize` prop → route page truyền `summarize` từ `useSummarize()`
- `EditorState` nhận `onSummarize` prop → route page truyền `summarize` từ `useSummarize()`

---

## 6D. Auth Middleware

### `app/middleware.ts` (tạo mới)

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/share", "/api", "/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public routes
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Check session cookie
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|static|favicon.ico).*)"],
};
```

### Lưu ý về Firebase Auth + Cookie

Hiện tại auth完全是client-side Firebase SDK. Middleware chỉ check cookie cơ bản.

Để sync Firebase token sang cookie:
1. Trong `AuthContext.tsx`, thêm `onIdTokenChanged` listener
2. Khi token thay đổi, gọi API route `/api/session` để set cookie
3. Cookie sẽ được middleware check

```typescript
// Trong AuthContext.tsx — thêm effect
useEffect(() => {
  if (!user) return;
  const unsubscribe = user.getIdToken().then((token) => {
    document.cookie = `session=${token}; path=/; max-age=3600; SameSite=Strict`;
  });
  return () => { /* cleanup */ };
}, [user]);
```

**Lưu ý:** Đây là optional cho Phase 6. Có thể giữ auth client-side như hiện tại và chỉ thêm middleware cơ bản.

---

## 6E. Breadcrumb `href`

### Cập nhật `app/components/Breadcrumb.tsx`

```typescript
"use client";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;        // MỚI: dùng next/link
  onClick?: () => void; // giữ backward compat
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-slate-500 px-4 md:px-6 py-2 bg-white border-b shrink-0">
      <Link href="/" className="hover:text-slate-700 transition-colors">
        <Home className="w-4 h-4 text-slate-400 shrink-0" />
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-slate-700 transition-colors font-medium truncate max-w-[200px]"
            >
              {item.label}
            </Link>
          ) : item.onClick ? (
            <button
              onClick={item.onClick}
              className="hover:text-slate-700 transition-colors font-medium truncate max-w-[200px]"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-slate-800 font-semibold truncate max-w-[200px]">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
```

### Cập nhật usage trong route pages

```tsx
// MeetingDetailState — Breadcrumb hiện tại:
<Breadcrumb items={[
  { label: "Dashboard", onClick: onBack },
  { label: meeting.title },
]} />

// MeetingDetailState — Breadcrumb mới (trong route page):
<Breadcrumb items={[
  { label: "Dashboard", href: "/" },
  { label: meeting.title },
]} />

// EditorState — Breadcrumb mới:
<Breadcrumb items={[
  { label: "Dashboard", href: "/" },
  { label: `Sửa: ${title}` },
]} />
```

---

## 6F. Cleanup

### Xóa

- `AppState` type từ `page.tsx`
- `handleSwitchToEdit` prop từ `MeetingDetailState` interface (không cần nữa, dùng `router.push`)
- Các unused imports trong `page.tsx`

### Di chuyển files

| Từ | Đến |
|-----|-----|
| `app/minutes/page.tsx` | `app/(dashboard)/minutes/page.tsx` |
| `app/minutes/[id]/page.tsx` | `app/(dashboard)/minutes/[id]/page.tsx` |
| `app/tasks/page.tsx` | `app/(dashboard)/tasks/page.tsx` |
| `app/tasks/[id]/page.tsx` | `app/(dashboard)/tasks/[id]/page.tsx` |
| `app/team/page.tsx` | `app/(dashboard)/team/page.tsx` |
| `app/training/page.tsx` | `app/(dashboard)/training/page.tsx` |

### Cập nhật imports trong moved files

Các file moved cần update import paths (thêm `@/app/` prefix nếu cần).

### Docs

- Tạo `docs/PHASE_6.md` (file này)
- Cập nhật `docs/REFACTOR_PLAN.md` — Phase 6 status

---

## Files cần tạo/sửa

| # | File | Action | Task |
|---|------|--------|------|
| 1 | `app/lib/utils/audio.ts` | **Tạo** | 6A.1 |
| 2 | `app/hooks/useSummarize.ts` | **Tạo** | 6A.2 |
| 3 | `app/(dashboard)/meeting/[id]/page.tsx` | **Tạo** | 6A.3 |
| 4 | `app/(dashboard)/edit/[id]/page.tsx` | **Tạo** | 6A.4 |
| 5 | `app/(dashboard)/live/page.tsx` | **Tạo** | 6A.5 |
| 6 | `app/(dashboard)/layout.tsx` | **Tạo** | 6B |
| 7 | `app/components/Dashboard/Sidebar.tsx` | **Sửa** | 6B |
| 8 | `app/page.tsx` → `app/(dashboard)/page.tsx` | **Refactor** | 6C |
| 9 | `app/components/DashboardState.tsx` | **Sửa** | 6C |
| 10 | `app/middleware.ts` | **Tạo** | 6D |
| 11 | `app/context/AuthContext.tsx` | **Sửa** (optional) | 6D |
| 12 | `app/components/Breadcrumb.tsx` | **Sửa** | 6E |
| 13 | `app/minutes/` → `app/(dashboard)/minutes/` | **Move** | 6F |
| 14 | `app/tasks/` → `app/(dashboard)/tasks/` | **Move** | 6F |
| 15 | `app/team/` → `app/(dashboard)/team/` | **Move** | 6F |
| 16 | `app/training/` → `app/(dashboard)/training/` | **Move** | 6F |
| 17 | `docs/PHASE_6.md` | **Tạo** | 6F |
| 18 | `docs/REFACTOR_PLAN.md` | **Sửa** | 6F |

**Tổng:** 18 files (7 tạo mới, 5 sửa, 6 move)

---

## Manual test checklist

```
□ Mở /meeting/[id] trực tiếp từ URL → load đúng
□ Mở /edit/[id] trực tiếp → load đúng, audio play được
□ Mở /live?lang=vi → bắt đầu recording
□ Back/Forward button → state đúng
□ Deep link: share /meeting/abc123 → mở đúng meeting
□ Draft meeting: mở từ browser khác → hiện lỗi friendly
□ Reload giữa edit → state còn nguyên
□ Multi-tab: 2 tab cùng meeting → không conflict
□ Sidebar: click Tasks → /tasks, click Dashboard → /
□ Sidebar highlight đúng route hiện tại
□ PollingManager: upload file → navigate away → vẫn poll
□ Auth: chưa login → redirect /login
□ /share/[id] → public, không cần auth
□ /live/[id] → viewer page vẫn hoạt động
□ Mobile: back gesture hoạt động
□ Upload từ Dashboard → PollingManager bắt job → status update
```

---

## Risks & giảm thiểu

| Risk | Giảm thiểu |
|------|-----------|
| IndexedDB draft audio chỉ available trên 1 browser | Ghi chú rõ trong UI: "Draft chỉ khả dụng trên trình duyệt này" |
| Move pages có thể break imports | Dùng `@/app/` absolute imports, test kỹ sau move |
| Sidebar conflict với pages có layout riêng | Tách sidebar: nav links ở layout, dashboard tabs giữ trong DashboardState |
| Firebase auth cookie không sync | Dùng `onIdTokenChanged` để set cookie, hoặc giữ auth client-side |
| Route group `(dashboard)` thay đổi URL structure | Route group không ảnh hưởng URL — `/tasks` vẫn là `/tasks`, không phải `/(dashboard)/tasks` |
| `handleBackgroundSummarize` cần `user` + `toast` | Extract thành `useSummarize` hook, import ở route pages |

---

## Rollback plan

1. **Mỗi task có thể revert độc lập** — các task ít dependency nhau
2. **6A:** Xóa 3 route pages mới, giữ state machine cũ
3. **6B:** Xóa `(dashboard)/layout.tsx`, move files về vị trí cũ
4. **6C:** Khôi phục state machine trong `page.tsx`
5. **6D:** Xóa `middleware.ts`
6. **6E:** Revert Breadcrumb về `onClick` only
7. **Toàn bộ:** `git revert` Phase 6 commit

**Quy tắc:** Giữ code cũ trong 1 tuần trên Vercel preview trước khi xóa.

---

## Bước tiếp theo

Sau Phase 6, dự án sẽ có:
- 9 routes chính thức với proper Next.js routing
- Back/Forward button hoạt động đúng
- Deep link support (share URL)
- Auth middleware
- PollingManager persist across routes

**Navigation:** [⬅️ Phase 5](./PHASE_5.md) • [REFACTOR_PLAN.md](./REFACTOR_PLAN.md)
