# Nexo

> AI-powered social media management. Internal package scope: `@postline/*`.

AI-powered social media management: plan, write (with Claude), approve and publish posts across networks.
Working name — rename freely. Architecture and contracts: [ARCHITECTURE.md](ARCHITECTURE.md). Product research & roadmap: [../OCOYA_ANALYSIS_AND_BUILD_PLAN.md](../OCOYA_ANALYSIS_AND_BUILD_PLAN.md).

## What's in the MVP

- **Accounts & teams** — email/password, magic link, Google (optional); multiple brands per account; Owner / Admin / Manager / Client roles; invites.
- **Channels** — Bluesky, Mastodon, Telegram, Discord, Slack (incoming webhook), Custom webhook, LinkedIn and X (OAuth, need app credentials). Facebook/Instagram adapters are stubbed pending Meta app review.
- **Editor** — one caption or per-channel captions, live per-network limits and thread warnings, media upload, labels, hashtag libraries, notes, comments, previews, AI rewrite menu, post score with AI fixes.
- **AI** (Claude) — post generation in brand voice, rewrite/shorten/expand/translate, hashtags, campaign planner, "Fetch brand" from a website. Every AI action spends 1 credit from the owner's monthly pool.
- **Planner** — list, month/week calendar with drag-to-reschedule, board by status; public read-only calendar link for clients.
- **Approvals** — request sign-off, approve resumes the schedule, reject returns to draft.
- **Publishing worker** — exact-time scheduling (BullMQ), per-channel publishing with retries, partial-success handling ("Needs attention"), token refresh, credit refills, lost-job sweeper.

## AI provider

AI runs on any OpenAI-compatible API (configured for **Agnes AI**) or Anthropic:

```
LLM_BASE_URL=https://apihub.agnes-ai.com/v1
LLM_API_KEY=...                  # takes precedence over ANTHROPIC_API_KEY
AI_TEXT_MODEL=agnes-3.0-flash
AI_FAST_MODEL=agnes-3.0-flash
IMAGE_MODEL=agnes-image-2.5-flash  # image generation on the same host; falls back to local artwork
```

## Demo data (optional)

The app starts empty — sign up at `/signup`. For a pre-filled demo workspace, `npm run seed:demo` creates **Northwind Coffee Co.** for `test@example.com` / `password123`: 6 demo channels (Instagram, Facebook, YouTube, X, LinkedIn, Pinterest)
(publishing is simulated), ~76 posts with analytics, campaigns, workflows with run history, inbox conversations,
a bio page at `/b/northwind`, and a team. Safe to re-run.

## Public site

`/` landing page, `/features`, `/integrations`, `/pricing`, `/about`, `/contact` (emails `SUPPORT_EMAIL`), `/privacy`, `/terms`,
plus `/login` and `/signup`. Pages live in `apps/web/src/app/(site)`, copy in `apps/web/src/components/site/content.ts`.
The privacy policy and terms are starter drafts — have them reviewed before launch.

## Run locally

Requirements: Node 20+, Docker.

```bash
cp .env.example .env
# fill AUTH_SECRET and TOKEN_ENCRYPTION_KEY:  openssl rand -base64 32
# optional: ANTHROPIC_API_KEY for AI features
docker compose up -d            # Postgres on :5433, Redis on :6380
npm install                     # npm 11: install scripts for prisma/esbuild are allow-listed in package.json
npm run db:generate
npm run db:push
npm run dev                     # web on http://localhost:3000 + worker
```

Magic-link and invite emails are printed to the web server console unless `RESEND_API_KEY` or `SMTP_URL` is set.

### Try publishing without any social account

Connect a **Custom webhook** channel pointing at any endpoint that replies `{"id": "...", "url": "..."}`
(set `ALLOW_PRIVATE_WEBHOOKS=1` in `.env` to allow `localhost` endpoints in development), then create a post and hit **Publish now**.

## Tests

```bash
npm run typecheck
npm test            # integrations, ai, worker (ai's DB tests run when Postgres is up)
```

## Known gaps / next steps

- Stripe billing: routes exist but are untested; without `STRIPE_SECRET_KEY` the billing page switches plans instantly (dev demo mode).
- Media storage is local disk (`apps/web/public/uploads`) — served by `next dev` only; add the S3 driver in `apps/web/src/lib/storage.ts` before deploying.
- Meta (Facebook/Instagram), TikTok, YouTube, Pinterest, Threads, Google Business adapters.
- Public REST API & MCP server, i18n, and Facebook/Instagram/TikTok/YouTube/Pinterest publishing (need platform approvals).
- SSRF checks resolve DNS before fetching; pin the resolved IP in the HTTP agent to fully close DNS rebinding.
