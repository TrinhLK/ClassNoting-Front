# Cloudflare Workers deployment

Production: https://noting.io.vn

Worker: `ez-noting`, account `875a5519bf3e8796eee6c43411f8ebff`, Workers Free.
Fallback URL: https://ez-noting.trinhlk-vnu.workers.dev (Google login is authorized on the production domain).
Deployment date: 2026-11-06. Version: `4737de34-9d23-4fe3-91f6-cc4c7823e23a`.

## Architecture

- Next.js App Router is built with vinext/Vite and runs on Workers, including API routes. Static assets use the Workers ASSETS binding. This is a fullstack Workers deployment, rather than a Pages static export.
- Firebase Authentication, Firestore and Storage retain the existing project and data. `noting.io.vn` was added to Firebase Authorized domains with the owner's approval.
- Firestore uses pinned `@ljoukov/firebase-admin-cloudflare@0.0.2`, a community REST implementation. The official SDK's runtime protobuf code generation fails in workerd. The compatibility boundary retains the existing TypeScript Firestore interface; only the application-used subset is intended. Review API support before adding new Firestore methods.
- Firebase Auth retains the official Admin SDK. Its service-account token exchange uses Web Crypto and fetch, preserving the official SDK's OAuth scopes. Storage URL signing retains the official SDK.
- Runpod job submission/polling moved behind authenticated `/api/transcription`. Server credentials use `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID`. Audio URLs must point into the signed-in user's Firebase Storage folder. New job ownership is stored in `transcription_jobs`; legacy jobs use meeting ownership.
- Existing ASR servers/tunnels remain separate. No GPU/serverless inference worker was moved onto Cloudflare.
- No KV, R2, D1, Durable Objects or paid plan was provisioned. Existing Firebase, AI, domain and ASR provider costs remain separate from Workers hosting.

## Build and deploy again

Use Node 22.12+ (tested with the isolated Node 22 installation under `/tmp/classnoting-cf-tools`). The temporary installation is not a permanent Node setup.

```sh
npm ci
npm run typecheck:cloudflare
npm run build:cloudflare
npm run deploy:cloudflare
```

`build:cloudflare` sets both public application URLs to `https://noting.io.vn`. Existing Next.js scripts remain available. Use the worker TypeScript config because vinext's generated route declarations differ from the cached Next.js validator.

Wrangler login has only `user:read`, `account:read`, `workers_scripts:write` and OAuth background access. Its warning about other missing scopes is expected; the other product permissions are not needed for this deployment. Custom domain `noting.io.vn` is managed in the Cloudflare dashboard → Worker → Domains. The existing `asr.noting.io.vn` and `asr-live.noting.io.vn` records were preserved.

Secrets were uploaded with Wrangler's `--secrets-file` using a temporary JSON file. Future normal deployments retain existing secrets. Change secrets through Cloudflare's encrypted secret settings or Wrangler; never commit `.env.local`, `.dev.vars`, or a secrets JSON file. `NEXT_PUBLIC_RUNPOD_API_KEY` is intentionally excluded. Keep the Firebase service-account key/encryption material consistent so existing encrypted Gemini keys remain readable.

Runtime public URLs and `GOOGLE_REDIRECT_URI` use `https://noting.io.vn`; the Drive callback is `https://noting.io.vn/api/drive/callback`. The separate Google OAuth client's allowed redirect list has **not** been changed. Add this exact callback in Google Cloud if the Drive integration reports `redirect_uri_mismatch`; retain the old callback while the old site remains active.

## Verification and limits

- Production HTTPS page returns 200; unauthenticated transcription API returns 401; missing share token returns 404 after a real Firestore query; temporary local probe route returns 404 after removal.
- Google login succeeded in Cốc Cốc on `noting.io.vn`. The dashboard loaded existing meetings and live sessions from the existing Firebase project.
- A local workerd probe verified document reads, read-only transactions, projected document-name queries, Firebase Auth lookup and Storage signed URLs. No probe document was created; probe code was removed before deployment.
- Worker TypeScript check passed. All 194 API/relevant unit tests passed. Full suite: 654 passed / 5 failed across 3 files. The same 5 failures reproduce with the original `app/lib/api.ts`: `AIChatModal.session.test.tsx` (3), `MeetingListView.test.tsx` (1), `ai-session.test.ts` (1). These fixtures were left outside this deployment change.
- Scanned 149 public asset files against configured private credentials: no matches. Public Firebase client configuration is expected in browser assets.
- A new paid Runpod transcription, Gemini generation, SMTP email, Drive OAuth import and a new live recording were not executed. Test these paths before considering the migration fully validated for every feature. Check ASR CORS/origin settings if a new live recording rejects the new origin.
- The legacy `/api/upload` Vercel Blob route remains in source; no UI caller was found during migration. It was not validated or replaced. The normal audio upload path uses Firebase Storage.
- Workers Free has request/CPU limits. Successful basic checks do not establish the maximum meeting size or capacity for long AI responses; observe real workloads before retiring the old deployment.

The existing Vercel deployment was not deleted. Roll back a Worker version through Cloudflare Deployments if necessary; schema/data remain shared with Firebase. Do not deploy an older client bundle containing public Runpod credentials without first removing that exposure.
