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
| `AUTH_MODE` | Yes | `clerk` for production |
| `PORT` | Render supplied | Defaults to 4000 locally |
| `EMAIL_MODE` | No | `preview` is safe default; `resend` enables delivery |
| `RESEND_API_KEY` | Only Resend | Required when `EMAIL_MODE=resend` |
| `EMAIL_FROM` | Only Resend | Verified sender address |

## 3. Vercel frontend

Import the same repository and set the project root directory to `frontend`.

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://your-render-service.onrender.com` |

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

## 5. Authentication blocker before public launch

The data model supports a stable external identity through `User.authProviderId`, and production already requires `AUTH_MODE=clerk`. The remaining implementation task is to verify Clerk bearer/session tokens in the Express middleware, resolve/create a user by Clerk subject, and remove the local demo-user fallback from public production traffic. Do not deploy a public multi-user app before this is done.

## 6. Operational checklist

- Confirm `/api/health` returns 200 after deployment.
- Verify the exact Vercel origin passes CORS.
- Keep `EMAIL_MODE=preview` until a verified sender and opt-in path are tested.
- Add error monitoring (for example, Sentry) without sending task descriptions, calendar tokens, or credentials in events.
- Use HTTPS only; private calendar feed URLs are bearer tokens and should not be logged.
- Back up Neon and test migrations against a non-production database first.
