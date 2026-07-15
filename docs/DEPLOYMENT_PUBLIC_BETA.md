# Deployment and Public Beta

## Architecture

- Next.js web: public HTTPS domain, for example `https://pacelingo.example`.
- NestJS API: separate HTTPS domain, for example `https://api.pacelingo.example`.
- Managed PostgreSQL with automated daily backups and point-in-time recovery if available.
- Cloudflare R2 custom domain for candidate snapshots, images and audio.

`Dockerfile.client` and `Dockerfile.server` use the monorepo root as build context.

## Required production environment

API:

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://...
CLIENT_URL=https://pacelingo.example
API_URL=https://api.pacelingo.example
JWT_SECRET=<at-least-32-random-characters>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_TTL_DAYS=30
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_URL=https://media.pacelingo.example
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=30
ENABLE_SWAGGER=false
```

Web build arguments/environment:

```env
NEXT_PUBLIC_API_URL=https://api.pacelingo.example
NEXT_PUBLIC_SITE_URL=https://pacelingo.example
```

Production validation refuses HTTP URLs, short/default JWT secrets, missing Google OAuth or incomplete R2 configuration.

## Release commands

```text
npm ci
cd pace-lingo-server
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start:prod
```

Build `NEXT_PUBLIC_*` values into the client image; changing them requires a new client build.

## External configuration

1. Google OAuth callback: `https://api.pacelingo.example/auth/google/callback`.
2. R2 CORS: allow `GET`/`HEAD` from the web origin; use a custom HTTPS domain.
3. Reverse proxy/platform: force HTTP to HTTPS and preserve `X-Forwarded-For`.
4. PostgreSQL: enable daily backups and test a restore before launch.
5. Uptime monitor: check `/health/live` frequently and `/health/ready` every few minutes.
6. Retain structured API logs and alert on repeated 5xx responses.

Manual backup is available with `npm run db:backup --workspace pace-lingo-server`; it requires `pg_dump`. Store backup files outside the application container and encrypt them at rest.

## Readiness semantics

- `/health/live`: process is running.
- `/health/ready`: database reachable, R2 configured and at least one published full test has 200 questions, all seven Parts, full Listening audio, `LISTENING_END` and all three immutable snapshots.

The readiness route returns HTTP 503 with individual checks until every required condition is met. This is expected before the first complete test is published.

Run the same content gate without starting the API:

```text
npm run audit:readiness
```

## Smoke test

1. Open home, Privacy, Terms and Contact over HTTPS.
2. Sign in with Google; reload and verify the session restores.
3. Open a published full test and verify candidate/media URLs load.
4. Answer, reload, submit, review and create a retry quiz.
5. Send a contact message and a question report; verify both in `/admin/feedback`.
6. Confirm `/health/ready` returns 200 before directing public traffic.
7. Inspect response security, CORS, rate-limit and request-id headers.

## Disclaimer

PaceLingo is an independent practice platform and is not affiliated with, sponsored by or endorsed by ETS or IIG Vietnam. TOEIC is a trademark of ETS.
