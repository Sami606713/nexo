# Postline — architecture & build contracts

Working name **Postline** (rename freely). An AI-powered social media management platform.
MVP scope = plan Phases 0–3: publishing, AI writing, team/approvals. See `../OCOYA_ANALYSIS_AND_BUILD_PLAN.md`.

## Layout

```
apps/web          Next.js 15 App Router + Mantine 8 + Auth.js v5 + SWR + Tiptap
apps/worker       BullMQ workers (publish, delete, AI generation, maintenance) — run with tsx
packages/core     Shared contracts: types, zod schemas, limits, permissions, status rollup, queue names, crypto
packages/db       Prisma schema + client (`import { prisma } from "@postline/db"`)
packages/integrations  NetworkAdapter implementations (server) + browser-safe validation (`/client`)
packages/ai       Claude-backed AiService, credits ledger, deterministic post score (`/score`, browser-safe)
```

All packages are consumed as TypeScript source (no build step). Web uses `transpilePackages`; worker uses `tsx`.

## Local dev

```
cp .env.example .env           # set AUTH_SECRET, TOKEN_ENCRYPTION_KEY (openssl rand -base64 32), ANTHROPIC_API_KEY
docker compose up -d           # Postgres :5433, Redis :6380
npm install
npm run db:generate && npm run db:push
npm run dev                    # web :3000 + worker
```

## URL structure (web)

| Page | Path |
|---|---|
| Sign in / sign up | `/login`, `/signup` (magic link in dev is printed to the server console) |
| Onboarding (create first brand) | `/onboarding` |
| Brand switcher redirect | `/app` → last/first brand → `/app/[brandId]/planner` |
| Planner (list / calendar / board) | `/app/[brandId]/planner?view=list|calendar|board` |
| Post editor (new / edit) | `/app/[brandId]/posts/new`, `/app/[brandId]/posts/[groupId]` |
| AI post composer | `/app/[brandId]/posts/ai` |
| Channels | `/app/[brandId]/channels` |
| Brand profile | `/app/[brandId]/brand` |
| Settings: team, billing, labels, hashtags | `/app/[brandId]/settings/{team,billing,labels,hashtags}` |
| Public shared calendar | `/share/calendar/[token]` |
| Accept invite | `/invite/[token]` |

## Internal API (route handlers, all JSON, all wrapped in `route()` from `src/lib/http.ts`)

Brand-scoped routes always start with `requireBrand(brandId, permission?)` from `src/lib/session.ts`.

| Owner | Route |
|---|---|
| platform | `/api/auth/[...nextauth]`, `POST /api/signup` |
| platform | `GET/POST /api/brands`, `GET/PATCH/DELETE /api/brands/[brandId]` |
| platform | `POST /api/brands/[brandId]/fetch-brand` (AI, 1 credit) |
| platform | `GET /api/brands/[brandId]/members`, `PATCH/DELETE /api/brands/[brandId]/members/[membershipId]` |
| platform | `GET/POST /api/brands/[brandId]/invites`, `DELETE /api/brands/[brandId]/invites/[inviteId]`, `POST /api/invites/[token]/accept` |
| platform | `GET /api/brands/[brandId]/channels`, `DELETE /api/brands/[brandId]/channels/[channelId]`, `GET /api/brands/[brandId]/channels/networks` |
| platform | `POST /api/brands/[brandId]/channels/connect/[network]` (credentials/webhook kinds) |
| platform | `GET /api/channels/oauth/[network]/start?brandId=`, `GET /api/channels/oauth/[network]/callback` |
| platform | `GET /api/brands/[brandId]/credits`, `GET /api/me` |
| platform | `GET/POST /api/brands/[brandId]/labels`, `PATCH/DELETE .../labels/[id]`; same for `hashtag-libraries` |
| posts | `GET/POST /api/brands/[brandId]/posts` (list w/ filters: status, from, to, labelId, q) |
| posts | `GET/PATCH/DELETE /api/brands/[brandId]/posts/[groupId]` |
| posts | `POST /api/brands/[brandId]/posts/[groupId]/duplicate` |
| posts | `POST /api/brands/[brandId]/posts/[groupId]/approval` (request), `POST .../approval/decide` |
| posts | `GET/POST /api/brands/[brandId]/posts/[groupId]/comments` |
| posts | `POST /api/brands/[brandId]/media` (multipart upload), `GET /api/brands/[brandId]/media` |
| posts | `POST /api/brands/[brandId]/ai/post` · `/ai/rewrite` · `/ai/hashtags` · `/ai/score` · `/ai/score-fix` |
| posts | `GET/POST /api/brands/[brandId]/calendar-share`, `GET /api/share/calendar/[token]` |

## Publishing pipeline (worker)

1. Web saves PostGroup with `scheduledAt` → status `SCHEDULED` (or `PENDING_APPROVAL`) and creates one `Post` per channel.
2. Web calls `enqueueGroupPublish(groupId, scheduledAt)` (only when SCHEDULED; approval decides re-enqueue).
3. Worker `publish-group`: re-loads group; if not SCHEDULED or time changed → no-op. Sets `PUBLISHING`, `lockedAt`, fans out `publish-post` (jobId `post:<id>`), skipping Posts already `POSTED`.
4. Worker `publish-post`: decrypt credentials → `adapter.validate` → `adapter.publish` → persist externalId/url or error. Error kinds drive retry (`AdapterError.kind`): `transient`/`rate_limit` retry with backoff; `auth` → channel `NEEDS_RECONNECT`, no retry; `rejected`/`unknown` → no retry.
5. After each child finishes, recompute group status with `rollupGroupStatus`. Notify on ERROR / NEEDS_ATTENTION.

## Credits

`withCredits({brandId, actorId, reason, amount}, fn)` from `@postline/ai` charges the brand OWNER's pool, refunds on failure. Every AI route must use it. HTTP 402 is returned by `route()` on `InsufficientCreditsError`.

## Rules for all contributors

- Don't change files you don't own; contracts in `packages/core`, `packages/db/prisma/schema.prisma`, `apps/web/src/lib/{http,queue,fetcher}.ts` are owned by the lead — request changes, don't edit.
- Never send `Channel.credentialsEnc` to the client. Select explicit fields.
- Never run `npm install` — dependencies are pre-installed. Need a new one? Report it.
- Typecheck your workspace with `npx tsc --noEmit -p <workspace>`; don't run `next build`.
