# Next.js App Router

- /tasks → `app/tasks/page.tsx`; Root layout; page manages authentication
- /training → `app/training/page.tsx`; Root layout; page manages authentication
- /minutes → `app/minutes/page.tsx`; Root layout; page manages authentication
- /team → `app/team/page.tsx`; Root layout; page manages authentication
- / → `app/(dashboard)/page.tsx`; AppShell authenticated dashboard
- /login → `app/login/page.tsx`; Root layout; page manages authentication
- /share/[id] → `app/share/[id]/page.tsx`; Root layout; page manages authentication
- /live → `app/(dashboard)/live/page.tsx`; AppShell authenticated dashboard
- /meeting/[id] → `app/(dashboard)/meeting/[id]/page.tsx`; AppShell authenticated dashboard
- /edit/[id] → `app/(dashboard)/edit/[id]/page.tsx`; AppShell authenticated dashboard
- /live/[id] → `app/live/[id]/page.tsx`; Root layout; page manages authentication
- /minutes/[id] → `app/minutes/[id]/page.tsx`; Root layout; page manages authentication
- /ext/[id] → `app/ext/[id]/page.tsx`; Root layout; page manages authentication
- /tasks/[id] → `app/tasks/[id]/page.tsx`; Root layout; page manages authentication

Dashboard: meeting actions, live sessions, meeting list. Login: Google sign in. Extension installation guide: new public route planned /extension.
