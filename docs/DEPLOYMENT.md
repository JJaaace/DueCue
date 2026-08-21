# Deployment guide

DueCue is designed for Vercel (frontend), Render (Express API), Neon Postgres, and optional Clerk accounts. Public recruiter walkthroughs use isolated, expiring in-memory demo sessions and do not require a shared seeded database user.

## Startup architecture

The frontend resolves startup in one controlled sequence: Clerk loads (when configured), `/api/health` wakes the process, the visitor is classified as signed-in or anonymous, then either the protected database workspace or an isolated public demo session is resolved. Retryable network, timeout, rate-limit, and `5xx` failures use a bounded four-attempt backoff. Authorization and other `4xx` failures are not retried. `/api/health` checks the Express process; `/api/ready` separately checks database connectivity and verifies that the core migrated `User` table exists.

Anonymous browsers receive an opaque UUID stored under `duecue:anonymous-demo-session:v1`. It is accepted only by `/api/public/demo/*`, grants no private-data access, expires after two hours, and is recreated safely after a server restart. Tour completion/skipping is a separate browser marker. Clerk bearer tokens are required for every personal data endpoint, and authenticated onboarding completion remains in PostgreSQL.

## 1. Neon Postgres

1. Create a Neon project/database.
2. Copy the pooled connection string, including `sslmode=require` when Neon supplies it, into Render as `DATABASE_URL`.
3. If your Neon configuration separates pooled runtime access from direct migration access, use the direct URL only for migration jobs and the pooled URL at runtime.

## 2. Render API

Create a Node web service from this repository.

| Setting | Value |
| --- | --- |
| Root directory | repository root |
| Build command | `npm ci && npm run build` |
| Start command | `npm run db:deploy --workspace=@duecue/backend && npm run start --workspace=@duecue/backend` |
| Health check | `/api/health` |
| Migration/release command | Included in the start command for free services; paid services should use the same command as Render's pre-deploy command |

Set the variables below. The API validates configuration at startup; production rejects `AUTH_MODE=dev` and Resend mode requires a key.

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | Yes | `production` |
| `DATABASE_URL` | Yes | Neon connection string |
| `FRONTEND_URL` | Yes | Exact deployed Vercel origin |
| `FRONTEND_URLS` | Preview use | Comma-separated additional exact Vercel Preview origins; trailing slashes are normalized and wildcards are not supported |
| `PUBLIC_API_URL` | Yes | Public HTTPS API origin used in one-click email feedback links |
| `AUTH_MODE` | Yes | `clerk` for production; anonymous demo routes remain public and isolated |
| `CLERK_SECRET_KEY` | Yes* | Clerk backend secret key used to verify session tokens (`sk_…`) |
| `CLERK_JWT_KEY` | Optional | Clerk PEM JWT verification key for networkless verification; use this or the secret key, preferably both |
| `CLERK_AUTHORIZED_PARTIES` | Recommended | Comma-separated allowed frontend origins, e.g. `https://your-duecue.vercel.app` |
| `PORT` | Render supplied | Defaults to 4000 locally |
| `EMAIL_MODE` | No | `preview` is safe default; `resend` enables delivery |
| `RESEND_API_KEY` | Only Resend | Required when `EMAIL_MODE=resend` |
| `EMAIL_FROM` | Only Resend | Verified sender address |

## 3. Vercel frontend

Import the same repository and set the project root directory to `frontend`.

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://your-render-service.onrender.com` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_…`); safe for browser use |

The Vercel project root must be `frontend`. `frontend/vercel.json` rewrites direct SPA routes to `index.html`. Deploy, then copy the production Vercel HTTPS origin into Render's `FRONTEND_URL`. Put explicitly approved Preview origins in `FRONTEND_URLS`, separated by commas. Include every origin that may use signed-in Clerk flows in `CLERK_AUTHORIZED_PARTIES` as well. DueCue CORS accepts only this normalized allowlist and the `Authorization`, `Content-Type`, and `X-DueCue-Demo-Session` headers; it does not use a wildcard production origin. Changing a Vite variable requires a new Vercel deployment.

## Separate Render Preview backend

Do not point a branch Preview frontend at the production API until the same backend commit is deployed. To test `agent/duecue-planning-intelligence` without replacing production:

1. In Render, choose **New → Web Service** and connect the DueCue repository.
2. Name the service `duecue-api-planning-preview`. This produces `https://duecue-api-planning-preview.onrender.com` if the name is available.
3. Select branch `agent/duecue-planning-intelligence`; do not select `main`.
4. Use the repository root as the root directory.
5. Set build command to `npm ci && npm run build`.
6. Set start command to `npm run db:deploy --workspace=@duecue/backend && npm run start --workspace=@duecue/backend`.
7. Set health-check path to `/api/health`.
8. Prefer a separate Neon branch/database for Preview so migrations and signed-in test data do not share production state.
9. Configure the Render Preview environment:

```env
NODE_ENV=production
AUTH_MODE=clerk
DATABASE_URL=<Preview Neon pooled URL with required SSL parameters>
FRONTEND_URL=https://due-cue-frontend.vercel.app
FRONTEND_URLS=<Exact current Vercel Preview origin, with no path>
PUBLIC_API_URL=https://duecue-api-planning-preview.onrender.com
CLERK_SECRET_KEY=<DueCue Clerk backend secret>
CLERK_JWT_KEY=<optional Clerk PEM JWT key>
CLERK_AUTHORIZED_PARTIES=https://due-cue-frontend.vercel.app,<Exact current Vercel Preview origin>
EMAIL_MODE=preview
ENABLE_JOBS=false
```

`PORT` is supplied by Render. `RESEND_API_KEY` and `EMAIL_FROM` are not required while `EMAIL_MODE=preview`. `RECRUITER_DEMO_CLERK_USER_ID` is not required because anonymous recruiter sessions are isolated in memory.

10. Deploy the Preview backend and wait for both endpoints to return `200`:

```text
https://duecue-api-planning-preview.onrender.com/api/health
https://duecue-api-planning-preview.onrender.com/api/ready
```

11. In the Vercel Preview environment—not Production—set and then redeploy. If Vercel issues a new generated Preview origin, add that new exact origin to `FRONTEND_URLS` and `CLERK_AUTHORIZED_PARTIES` on the Render Preview service before testing:

```env
VITE_API_BASE_URL=https://duecue-api-planning-preview.onrender.com
```

Keep `VITE_CLERK_PUBLISHABLE_KEY` set to the DueCue Clerk publishable key.

12. Verify the pair before merging: open the protected Vercel Preview URL, confirm `OPTIONS /api/health`, `GET /api/health`, `GET /api/public/demo/state`, and `POST /api/public/demo/session` succeed; then complete a demo sync, refresh, reset the demo, and confirm an unrelated Origin receives `403`.

## 4. Prisma migration and demo seed

Run production migrations before API startup:

```bash
npm run db:deploy --workspace=@duecue/backend
```

Seeding is optional for production because the public recruiter demo does not use PostgreSQL. If you need a local development workspace, seed after migration:

```bash
npm run db:seed --workspace=@duecue/backend
```

The seed deletes and recreates only `demo@duecue.local`. In the anonymous UI, **Reset demo** replaces only that browser's temporary session and restores Stage 1.

## 5. Clerk authentication and workspace isolation

Before deployment, create a **separate DueCue Clerk application** and configure its allowed origins for the DueCue Vercel URL. Set `VITE_CLERK_PUBLISHABLE_KEY` only on Vercel, and set `CLERK_SECRET_KEY` (and optionally `CLERK_JWT_KEY`) only on Render. The frontend sends the signed-in Clerk session token as a bearer token; the API verifies it before every protected request.

DueCue maps Clerk's stable user subject to `User.authProviderId`, creating a private workspace on first sign-in. The local `demo@duecue.local` fallback exists only under `AUTH_MODE=dev`; configuration validation prevents it from starting in production. Signed-out visitors render the public sandbox while Sign in/Create account remain available. Never put `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, or a database URL in Vercel frontend variables.

## Fresh-visitor and recovery checks

1. Open the Vercel URL in a clean browser context. Confirm the branded loader appears, Stage 1 loads, and the walkthrough begins.
2. Skip the tour and refresh. Confirm the sample dashboard returns without forcing the tour; use **Replay walkthrough** to start it manually.
3. Select **Reset demo** and confirm only that browser returns to Stage 1.
4. Sign in with a new Clerk test account. Confirm `/api/ready` succeeds, onboarding begins once, and refresh preserves completion.
5. Temporarily stop the Render service or point a preview build at an unavailable test API. Confirm bounded retries, long-wait copy, and the Try again screen.

If `/api/health` succeeds but `/api/ready` fails, inspect `DATABASE_URL`, Neon availability, and migration status. Run `npm run db:deploy --workspace=@duecue/backend` against the exact production URL. If browser calls fail while curl succeeds, compare `FRONTEND_URL` with the browser Origin exactly. A missing `VITE_API_BASE_URL` now produces a configuration recovery screen rather than silently calling the Vercel origin.

## 6. Operational checklist

- Confirm `/api/health` returns 200 after deployment.
- Confirm `/api/ready` returns 200 after migrations.
- Verify the exact Vercel origin passes CORS.
- Keep `EMAIL_MODE=preview` until a verified sender and opt-in path are tested.
- Add error monitoring (for example, Sentry) without sending task descriptions, calendar tokens, or credentials in events.
- Use HTTPS only; private calendar feed URLs are bearer tokens and should not be logged.
- Back up Neon and test migrations against a non-production database first.
