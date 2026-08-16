# Deployment guide

DueCue is designed for Vercel (frontend), Render (Express API), and Neon Postgres. Use a dedicated demo database for portfolio walkthroughs; do not share a single seeded user in a public multi-user environment.

## 1. Neon Postgres

1. Create a Neon project/database.
2. Copy the pooled connection string into Render as `DATABASE_URL`.
3. If your Neon configuration separates pooled runtime access from direct migration access, use the direct URL only for migration jobs and the pooled URL at runtime.

## 2. Render API

Create a Node web service from this repository.

| Setting | Value |
| --- | --- |
| Root directory | repository root |
| Build command | `npm ci && npm run build` |
| Start command | `npm run start --workspace=@duecue/backend` |
| Health check | `/api/health` |
| Migration/release command | `npm run db:deploy --workspace=@duecue/backend` |

Set the variables below. The API validates configuration at startup; production rejects `AUTH_MODE=dev` and Resend mode requires a key.

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | Yes | `production` |
| `DATABASE_URL` | Yes | Neon connection string |
| `FRONTEND_URL` | Yes | Exact deployed Vercel origin |
| `PUBLIC_API_URL` | Yes | Public HTTPS API origin used in one-click email feedback links |
| `AUTH_MODE` | Yes | `clerk` for production; never use the local demo auth mode publicly |
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

Deploy, then copy the Vercel HTTPS origin into Render's `FRONTEND_URL`. DueCue CORS accepts the configured frontend origin plus local development origins; do not use a wildcard production origin.

## 4. Prisma migration and demo seed

Run production migrations before API startup:

```bash
npm run db:deploy --workspace=@duecue/backend
```

For a separate recruiter demo database, seed after migration:

```bash
npm run db:seed --workspace=@duecue/backend
```

The seed deletes and recreates only `demo@duecue.local` in that database. In the UI, **Reset recruiter demo** resets staged provider data and clears demo-derived feedback, previews, and history.

## 5. Clerk authentication and workspace isolation

Before deployment, create a **separate DueCue Clerk application** and configure its allowed origins for the DueCue Vercel URL. Set `VITE_CLERK_PUBLISHABLE_KEY` only on Vercel, and set `CLERK_SECRET_KEY` (and optionally `CLERK_JWT_KEY`) only on Render. The frontend sends the signed-in Clerk session token as a bearer token; the API verifies it before every protected request.

DueCue maps Clerk's stable user subject to `User.authProviderId`, creating a private workspace on first sign-in. The local `demo@duecue.local` fallback exists only under `AUTH_MODE=dev`; it cannot be selected or reached in production. Keep a recruiter demo in a **separate database**. If a controlled Clerk demo account should access its seeded data, set `RECRUITER_DEMO_CLERK_USER_ID` only for that dedicated demo seed run. Never set it on a shared user database.

## 6. Operational checklist

- Confirm `/api/health` returns 200 after deployment.
- Verify the exact Vercel origin passes CORS.
- Keep `EMAIL_MODE=preview` until a verified sender and opt-in path are tested.
- Add error monitoring (for example, Sentry) without sending task descriptions, calendar tokens, or credentials in events.
- Use HTTPS only; private calendar feed URLs are bearer tokens and should not be logged.
- Back up Neon and test migrations against a non-production database first.
