# Ocoya — Teardown & Build Plan for an AI Social Media Management Platform

_Analysis date: 2026-10-25/26. Target: https://www.ocoya.com (marketing) and https://www.app.ocoya.com (product), public, unauthenticated surface only._

> **Goal:** build an original product with comparable capabilities, not a clone of Ocoya's brand, copy, templates or assets. Use your own name, design, and template library.

---

## Part 0 — How this was analyzed (evidence ledger)

| # | Method | What it gave | Evidence / location |
|---|---|---|---|
| E1 | REA `capture_browser_scenario` on `www.ocoya.com` (headless Chrome, 6s settle, headers captured) | Marketing stack, hosting, CDN headers, 134 requests | `ev_99f0b851…` |
| E2 | REA `capture_browser_scenario` on `app.ocoya.com` | Redirect chain, auth gate, 94 app JS chunks, analytics/ads tags | `ev_15a7c74f…` |
| E3 | REA `analyze_javascript_application` on the 58 downloaded app chunks | **Partial**: 8/58 sources finished before `0fs75igqtqujg.js` hit the 300s per-source deadline. No route graph recovered. | `ev_c1eedba6…` |
| E4 | String/signature scan of the same 58 chunks (8.8 MB) | Internal API paths, app routes, libraries, third-party SDKs | scratchpad `ocoya-app-js/` |
| E5 | Public docs (`docs.ocoya.com/llms.txt` → 147 Markdown pages + `openapi.yaml`) | Feature semantics, limits, statuses, roles, credits, REST + MCP contracts | scratchpad `ocoya-docs/` |
| E6 | Marketing homepage text | Feature list, 28 integrations, pricing | WebFetch |

**Not observed:** anything behind login (no account was used), server code, database, or queue internals. Backend statements below are marked **[inferred]** where they're deductions, not observations.

---

## Part 1 — What Ocoya is (product analysis)

### 1.1 Core domain model (from docs, E5)

```
User ──owns──> Subscription (plan, credits pool, limits pooled across brands)
  └── Brand (= workspace / client)   identity, timezone, week start, members+roles
        ├── Channel (SocialProfile)  one connected account; token, health, per-network extras (boards, locations)
        │     └── PostingSlots        weekly suggested times
        ├── PostGroup ("post")        shared caption + per-channel overrides, media, labels, notes, status
        │     └── Post (per channel)  per-network publish attempt, result, external id/url, error
        ├── Campaign                  AI-generated batch of PostGroups (goal, audience, schedule, profiles)
        ├── HashtagLibrary            reusable published hashtag sets
        ├── Label                     internal tags (never published)
        ├── Design (Studio)           canvas documents + templates
        ├── Workflow                  1 trigger + N actions, runs log
        │     └── AIAgent             name, prompt, LLM, image-gen on/off, web-search on/off
        ├── InboxConversation         FB/IG DMs, mentions, comments; status, assignee, labels
        ├── ReplySnippet
        ├── BioPage                   link-in-bio
        └── ApiToken / OAuth grants (MCP)
```

IDs look like **cuid** (`cmayvq3hk00017apshay5qezu`), which suggests **Prisma** [inferred].

### 1.2 Feature modules

| Module | Behavior (observed in docs/UI routes) |
|---|---|
| **Planner** (`/smm/planner`) | List / Board (kanban by status, incl. *Pending approval* column) / Calendar views. Shareable read-only client calendar (`/api/calendar/share`). Email calendar digest (`/api/email/calendar`). |
| **Post editor** | Multi-channel select; one shared caption + "Customize per channel" overrides; live char count vs every selected network; post score; AI select-to-rewrite (rewrite/shorten/expand/translate, 37 languages); labels; hashtag library picker; internal notes (Cmd/Ctrl+J); preview per network; schedule (≥2 min ahead, brand timezone, per-post TZ override) or Publish now; Reels/Stories toggles; TikTok privacy/duet/stitch/disclosure options. |
| **Statuses** | `Generating · Draft · Pending approval · Scheduled · Posted · Needs attention (partial success) · Error`. |
| **Approvals** | Request approval → choose approvers → hold; approve = resume original schedule; reject = back to draft (loses time). Locked while publishing. Endpoint `/api/post-group/{id}/approval`. |
| **AI post** (`/smm/planner/ai-post`) | Prompt + toggles: hashtags, #images, tone, length. Cost badge. Uses brand profile. |
| **AI campaigns** (`/smm/campaigns`) | Prompt + goal (awareness/leads/launch/offer/education/event) + audience + date range + frequency (0.5–4/day) + profiles → async plan of ≤30 (UI) / 90 (API) posts → review → approve → schedule. Also "Article campaign" for blogs. |
| **Post score** | 11 weighted heuristic checks = 100 points, each with a scoped AI "Fix" action. Fully specified in docs (hook 12, takeaway 12, substance 10, length-fit 10, CTA 10, media 10, scannable 8, hashtag count 8, readability 8, links 6, spam 6). |
| **Studio** (`/api/pixy/*`) | **Embedded third-party editor "Pixy"** (`pixy-embed-sdk`, `cdn.pixy.art`, `NEXT_PUBLIC_PIXY_EMBED_KEY`), communicating through `window` events (`ocoya:pixy-export`, `pixy:organization:changed`). 1,500+ templates, sizes per format, stock photos, AI image gen, AI erase/extend/replace/remove-bg. |
| **Media** | Uploads through **Uploadcare** (`upload.uploadcare.com`, `ucarecdn.com`); `/api/media`, `/api/assets/preset`, `/api/assets/label`. |
| **Inbox** (`/smm/inbox`) | **FB + IG only.** Tabs DMs / Mentions / Comments; filters Open / Resolved / Assigned to me; assign, label, archive; reply snippets; AI reply suggestion from the last 4 messages. |
| **Workflows** (`/smm/automation/workflows`) | Visual builder. Triggers: Schedule, RSS (polled every 1–2h), WooCommerce product published, Webhook, New comment (on one post), New mention, New DM. Actions: Use AI agent, Create social post, Reply in comments, Send DM, Filter (contains / does not contain), Delay. Steps pass variables. 1 credit per run. Run log. |
| **Bio pages** (`/smm/bio`) | Link-in-bio per profile. |
| **Analytics** (`/smm/analytics`, `/api/analytics/post`) | Per-post metrics (impressions etc.). |
| **Brand** (`/brand`) | Name, website + **"Fetch brand"** (scrape site → description, colors, logos), description, logos. Feeds every AI prompt. |
| **Team / roles** | Owner / Admin / Manager / Client (permission matrix in docs). Membership per brand. |
| **Billing** | Stripe (`/api/billing/{plans,portal,sync,resume,accept,withdrawal,features}`); 7-day trial with card; monthly credits reset on subscription day; limits pooled across brands. Affiliates through **Rewardful**. |
| **Public API** | REST `/api/_public/v1/*`, `X-API-Key` or Bearer, **60 req/min per key**. Endpoints: me, brands, social-profiles, connection-url, hashtag-libraries, studio-templates, post (list/create), post/ai, campaigns, post/{id} (patch/delete), workflow (list/get/toggle). |
| **MCP server** | `https://mcp.ocoya.com`, remote HTTP, **OAuth only** with per-brand consent + scopes (e.g. `posts:publish`), 21 tools (`ocoya_create_post`, `ocoya_create_ai_campaign`, `ocoya_run_workflow` …). |
| **Custom destination** | Webhook channel: POST `{event:"post.published", post:{…}}`, 30s timeout, must return `{id,url}`; `post.deleted` to delete URL; 404/410 = already deleted; ≤3 redirects. |
| **Threads auto-split** | X 280 / Threads 500 / Bluesky 300 / Mastodon 500 per part; hard refuse above 5,000. |
| **Support** | In-app livechat (`/api/livechat/*`, articles, unread). |
| **PWA** | Manifest present; "install on phone/computer". |

### 1.3 Integrations (28 + custom)

Social: Facebook Pages, Instagram Business, X, LinkedIn (profile + page, PDF carousels), Pinterest (boards), Bluesky (app password), Threads, YouTube Shorts, Google Business (updates/offers/events), TikTok, Telegram, Slack, Discord, Mastodon (any server), Dribbble, Tumblr, Twitch (chat), Kick (chat), Snapchat (Spotlight, seen in code).
CMS/Productivity: WordPress, DEV.to, Whop, Notion, Airtable, Webflow, Framer (beta), Wix. Ecommerce: WooCommerce (trigger). Custom webhook.

Full per-network limits table: `ocoya-docs/help__channel-limits.md`, which is useful as the seed for your validation rules.

### 1.4 Pricing & monetization

| Plan | $/mo | Users | Channels | AI credits/mo |
|---|---|---|---|---|
| Starter | 29 | 1 | 5 | 300 |
| Team | 79 | 5 | 20 | 1,500 |
| Agency | 199 | 20 | 100 | 5,000 |
| Enterprise | custom | | | |

1 credit = 1 AI action (caption, image, edit, hashtags, reply suggestion, agent message, workflow run). Publishing is free. Yearly = 2 months free.

---

## Part 2 — Technical teardown (observed vs inferred)

### 2.1 Observed (E1, E2, E4)

| Layer | Finding |
|---|---|
| Marketing site | **Next.js (App Router, RSC)** built with **Turbopack**, prerendered (`x-nextjs-prerender: 1`, `x-nextjs-stale-time: 300`), i18n paths (`/en`, 8 locales), on **Vercel** (`server: Vercel`, `x-vercel-cache: HIT`). Self-hosted analytics script `/7d69124cb44798dc/script.js` (proxied analytics). |
| App | **Next.js on Vercel** (separate project, `www.app.ocoya.com`), `x-frame-options: SAMEORIGIN`, deploy id `dpl_…`. Redirects `app.ocoya.com → www.app.ocoya.com → /smm/planner → /auth?callbackUrl=…`. |
| Auth | **NextAuth / Auth.js** (`/api/auth/session`, `/api/auth/signin/email` magic link, `/api/auth/callback/credentials` password, Google OAuth per docs). |
| UI kit | **Mantine** (≈20 chunks). Data fetching with **SWR**. **ProseMirror**-based caption editor (likely Tiptap). emoji-mart. moment/dayjs/luxon. Recharts for analytics [likely]. |
| Validation | zod + yup present. |
| Media | **Uploadcare** upload API + CDN. |
| Design editor | **Pixy embed SDK** (third-party/sister product), so Ocoya did **not** build its canvas editor in-house. |
| Billing | Stripe (links to stripe.com/docs; `/api/billing/portal`). Affiliate: Rewardful (`ocoya.getrewardful.com`). |
| Tracking | GTM, Google Ads remarketing, Bing UET, `r.wdfl.co` (Rewardful). |
| Internal API style | REST routes under `/api/*` (Next.js route handlers), resources: `socials`, `post-group`, `workspace`, `billing`, `media`, `assets`, `pixy`, `calendar`, `analytics`, `livechat`, `brand`, `announcement`, `settings`. Per-network connect routes: `/api/socials/{network}/connect`. |
| Docs | Mintlify-style docs with `llms.txt` and OpenAPI. |

### 2.2 Inferred backend (not observed)

- **Postgres + Prisma** (cuid IDs, Next.js stack).
- A **job queue/scheduler** outside Vercel functions for publishing at time T, RSS polling (1–2h), WooCommerce polling (≤5 min delay), token refresh, and analytics sync. Async campaign generation returns `GENERATING` immediately, which confirms background workers exist.
- **Webhook ingestion** from Meta (Inbox is FB/IG only, which matches the Meta Graph webhooks scope).
- **LLM provider(s)** selectable per AI agent ("LLM" field), plus an image model, plus a web-search tool.

---

## Part 3 — Build plan

### 3.1 Recommended stack

| Concern | Choice | Why |
|---|---|---|
| Monorepo | **Turborepo + pnpm** | `apps/web`, `apps/worker`, `apps/marketing`, `apps/mcp`, `packages/{db,core,integrations,ai,ui}` |
| Web app | **Next.js 15 App Router + TypeScript** | Same proven shape as the target |
| UI | **Mantine** or **shadcn/ui + Tailwind** | Mantine gives calendar, dates, rich-text and notifications out of the box |
| Editor | **Tiptap** (ProseMirror) | Caption editor with mentions, hashtags, AI selection menu |
| Calendar | **FullCalendar** or custom with `@dnd-kit` | Drag-to-reschedule |
| Workflow canvas | **React Flow (@xyflow/react)** | Visual automation builder |
| Design studio | **Polotno SDK** (commercial, fastest) or **Fabric.js / Konva** (build it yourself) | Pixy equivalent; Polotno ships templates, text, export |
| DB | **PostgreSQL + Prisma** (or Drizzle) | Relational multi-tenant data |
| Queue/scheduler | **BullMQ + Redis** (self-host) or **Inngest / Trigger.dev** (serverless) | Delayed jobs at exact times, retries, cron |
| Auth | **Auth.js** (email magic link, password, Google) | Matches target |
| Media | **S3/R2 + presigned uploads** or **Uploadcare** | Plus `sharp` and **FFmpeg** worker for resize/transcode |
| AI text | **Claude (claude-sonnet-5-5 / claude-haiku-5-5)** through a provider abstraction | Per-agent model choice |
| AI image | An image-generation API (e.g. a Flux/Imagen-class provider) behind the same abstraction | Generation, inpaint/outpaint, background removal |
| Billing | **Stripe** Billing + Customer Portal + metered credits ledger | |
| Email | Resend / Postmark | Magic links, approvals, digests |
| Realtime | SSE or Pusher/Ably | Generating → Draft status, inbox |
| Observability | Sentry + OpenTelemetry + structured logs | Publishing failures are the #1 support issue |
| Hosting | Vercel (web) + Fly/Railway/ECS (worker + Redis) + Neon/RDS (PG) | Workers need long-lived processes |

### 3.2 System architecture

```
                ┌──────────── Next.js web (Vercel) ─────────────┐
 Browser ──────►│ App Router UI · /api route handlers · Auth.js  │
                │ Public REST /api/v1 (API keys, 60 rpm)         │
                └───────┬───────────────┬──────────────┬─────────┘
                        │ Prisma        │ enqueue      │ presign
                   ┌────▼────┐   ┌──────▼──────┐  ┌────▼─────┐
                   │Postgres │   │ Redis/BullMQ│  │ S3 / R2  │
                   └────▲────┘   └──────┬──────┘  └────▲─────┘
                        │               │              │
          ┌─────────────┴───────────────▼──────────────┴──────────┐
          │ Worker service                                         │
          │  publish-queue  · token-refresh · analytics-sync       │
          │  ai-generation  · campaign-planner · media-transcode   │
          │  workflow-runner · rss/woo pollers · webhook-ingest    │
          └──────┬───────────────────────┬─────────────────────────┘
                 │ Integration adapters  │ AI gateway
         ┌───────▼────────┐       ┌──────▼──────────┐
         │ Meta, X, LI,   │       │ LLM + image APIs │
         │ TikTok, YT ... │       │ + credit ledger  │
         └────────────────┘       └─────────────────┘
 MCP server (remote HTTP, OAuth 2.1) ──calls──► same core services
```

### 3.3 Database schema (Prisma sketch)

```prisma
model User            { id String @id @default(cuid()) email String @unique name String? image String?
                        memberships Membership[] ownedBrands Brand[] @relation("owner") subscription Subscription? }
model Subscription    { id String @id @default(cuid()) userId String @unique plan Plan stripeCustomerId String
                        stripeSubId String? status String periodStart DateTime resetDay Int
                        creditsMonthly Int creditsUsed Int @default(0) }
model CreditLedger    { id String @id @default(cuid()) userId String delta Int reason String // caption,image,workflow_run...
                        brandId String? refType String? refId String? createdAt DateTime @default(now()) }
model Brand           { id String @id @default(cuid()) ownerId String name String website String? description String?
                        timezone String weekStart Int @default(1) logos Json colors Json fonts Json voice Json audience Json }
model Membership      { id String @id @default(cuid()) userId String brandId String role Role @@unique([userId, brandId]) }
enum Role             { OWNER ADMIN MANAGER CLIENT }
model Channel         { id String @id @default(cuid()) brandId String network Network externalId String name String avatar String?
                        accessTokenEnc String refreshTokenEnc String? expiresAt DateTime? scopes String[]
                        health ChannelHealth @default(OK) lastError Json? extras Json // boards, locations, webhook cfg
                        inboxEnabled Boolean @default(false) slots PostingSlot[] }
model PostingSlot     { id String @id @default(cuid()) channelId String weekday Int minute Int }
model PostGroup       { id String @id @default(cuid()) brandId String authorId String caption String @db.Text
                        status PostStatus scheduledAt DateTime? timezone String? options Json // per-network opts
                        score Int? notes String? campaignId String? labels Label[] media MediaAsset[]
                        posts Post[] approval Approval? lockedAt DateTime? createdAt DateTime @default(now()) }
enum PostStatus       { GENERATING DRAFT PENDING_APPROVAL SCHEDULED PUBLISHING POSTED NEEDS_ATTENTION ERROR }
model Post            { id String @id @default(cuid()) groupId String channelId String captionOverride String? @db.Text
                        status PostStatus externalId String? url String? error Json? attempts Int @default(0) publishedAt DateTime?
                        metrics PostMetric[] }
model Approval        { id String @id @default(cuid()) groupId String @unique requestedBy String approvers String[]
                        decision String? decidedBy String? decidedAt DateTime? }
model Campaign        { id String @id @default(cuid()) brandId String prompt String goal String audience String?
                        startDate DateTime duration Int postsPerDay Float count Int status String plan Json }
model MediaAsset      { id String @id @default(cuid()) brandId String url String mime String width Int? height Int?
                        duration Float? sizeBytes Int source String } // upload, ai, studio, stock
model Design          { id String @id @default(cuid()) brandId String name String doc Json format String previewUrl String? }
model Template        { id String @id @default(cuid()) name String format String doc Json tags String[] }
model HashtagLibrary  { id String @id @default(cuid()) brandId String name String tags String[] }
model Label           { id String @id @default(cuid()) brandId String name String color String }
model Workflow        { id String @id @default(cuid()) brandId String name String active Boolean @default(false)
                        trigger Json steps Json /* ordered DAG */ runs WorkflowRun[] }
model WorkflowRun     { id String @id @default(cuid()) workflowId String status String input Json log Json startedAt DateTime finishedAt DateTime? }
model AIAgent         { id String @id @default(cuid()) brandId String name String prompt String @db.Text model String
                        imageGen Boolean webSearch Boolean }
model Conversation    { id String @id @default(cuid()) channelId String kind String /* dm|mention|comment */ externalId String
                        status String assigneeId String? labels String[] lastMessageAt DateTime messages Message[] }
model Message         { id String @id @default(cuid()) conversationId String direction String text String? attachments Json externalId String createdAt DateTime }
model ReplySnippet    { id String @id @default(cuid()) brandId String title String body String }
model BioPage         { id String @id @default(cuid()) brandId String slug String @unique theme Json blocks Json }
model PostMetric      { id String @id @default(cuid()) postId String capturedAt DateTime impressions Int? reach Int? likes Int?
                        comments Int? shares Int? clicks Int? saves Int? videoViews Int? }
model ApiKey          { id String @id @default(cuid()) userId String hash String prefix String lastUsedAt DateTime? revokedAt DateTime? }
model OAuthGrant      { id String @id @default(cuid()) userId String clientId String scopes String[] brandIds String[] }
```

### 3.4 Integration adapter contract (the heart of the system)

```ts
interface NetworkAdapter {
  network: Network;
  limits: { caption: number; captionHard?: number; threadable: boolean; images: number; imageMaxMB: number;
            videos: number; videoMaxMB: number; hashtags?: number };
  connect: { kind: 'oauth2' | 'oauth1' | 'apiKey' | 'appPassword' | 'webhook'; authorizeUrl(state): string;
             exchange(code): Promise<Credentials>; refresh?(c): Promise<Credentials> };
  listTargets?(c): Promise<Target[]>;           // FB pages, IG accounts, Pinterest boards, GBP locations
  validate(post: ComposedPost): Issue[];         // run in the editor and again before publish
  publish(post: ComposedPost, c): Promise<{ externalId: string; url: string }>;
  delete?(externalId, c): Promise<void>;
  fetchMetrics?(externalId, c): Promise<Metrics>;
  inbox?: { subscribe(c): Promise<void>; handleWebhook(req): InboxEvent[]; reply(...): Promise<void> };
}
```

Publish job flow: `PostGroup SCHEDULED` → at T, enqueue one **job per channel** (idempotency key `postId:attempt`) → adapter.validate → media prep (transcode/resize per network) → publish → write `externalId/url` → roll the group status up (all ok = POSTED, some = NEEDS_ATTENTION, none = ERROR). Never republish channels that succeeded.

### 3.5 AI layer

- **Brand context builder:** name, description, voice, audience, do/don't list, examples. Injected into every prompt. Build "Fetch brand" as: crawl homepage → extract text, `og:image`, favicon, CSS colors → LLM summarizes into a description and voice.
- **Prompts:** caption (tone, length, hashtags, per-network variants), rewrite/shorten/expand/translate, hashtags, campaign *planner* (step 1: outline N post angles across dates, step 2: generate each post in parallel), reply suggestion (last 4 messages), post-score **Fix** (scoped edit that keeps the rest verbatim).
- **Post score:** deterministic heuristics (length, hashtags, links, emoji, `!`, caps, line breaks, readability, media) plus cheap LLM judgments for "hook" and "takeaway". Reimplement the 11-check model from the public docs with your own weights.
- **Credits:** reserve → run → commit/refund in `CreditLedger` inside a transaction; show the cost badge before running.
- **Use structured outputs** (JSON schema / tool use) for campaigns and posts.

### 3.6 Workflow engine

- Store as `trigger + ordered steps` (start linear like Ocoya, extend to a DAG later).
- Trigger sources: cron (BullMQ repeatable), RSS poller (ETag/Last-Modified, seen-GUID set), WooCommerce (REST poll or webhook), inbound webhook URL (`/hooks/wf/:id/:secret`), Meta inbox events.
- Step runtime: `{ context: Record<string, any> }`; template variables `{{trigger.title}}`, `{{steps.agent.text}}`.
- Actions: AI agent (LLM + optional image + optional web search), create post (draft/schedule/publish now), reply comment, send DM, filter (contains/not), delay (re-enqueue with a delay).
- Charge 1 credit per run, and persist a run log per step.

### 3.7 Public API, webhooks & MCP

- REST `/api/v1` mirroring the documented surface. Keys hashed (prefix shown once), 60 rpm via a Redis token bucket, OpenAPI generated from zod (`zod-openapi`).
- **MCP server** (`apps/mcp`): TypeScript MCP SDK, Streamable HTTP transport, **OAuth 2.1 + PKCE + dynamic client registration**, consent screen with a brand picker and scopes (`posts:read`, `posts:write`, `posts:publish`, `workflows:run` …). Tools wrap the same core services as the REST API.
- Custom destination channel: implement the `{id,url}` contract, 30s timeout, ≤3 redirects, and SSRF protection (block private IPs, re-check after each redirect).

---

## Part 4 — Phased roadmap

| Phase | Scope | Exit criteria | Est. (2–3 engineers) |
|---|---|---|---|
| **0. Foundations** | Monorepo, Auth.js, Brand/Membership/Roles, Postgres+Prisma, Mantine shell, Stripe test mode, Sentry | Sign up, create brand, invite member | 2 wks |
| **1. Publishing MVP** | Channels: **Facebook Pages, Instagram, LinkedIn, X, Bluesky, Mastodon, Telegram, Discord, Slack, Custom webhook**. Editor (shared + per-channel caption, media upload, validation, preview), Planner list + calendar, scheduler + publish workers, statuses incl. NEEDS_ATTENTION, threads auto-split | Scheduled posts publish reliably to all 10 networks; partial-failure handling | 5–6 wks |
| **2. AI core** | Brand profile + Fetch brand, AI post, rewrite menu, hashtags, hashtag libraries, credits ledger + plans, post score + Fix | Credits enforced; AI drafts in brand voice | 3 wks |
| **3. Team & agency** | Approvals, Client role, labels, notes, Board view, shared read-only calendar link, posting slots, timezone overrides, email notifications | Agency → client sign-off flow end-to-end | 2–3 wks |
| **4. Campaigns + media AI** | Campaign planner (async, GENERATING), review/approve screen, AI image generation, carousel generation | 30-post campaign generated, reviewed and scheduled | 3 wks |
| **5. Studio** | Polotno (or Fabric) editor, formats, brand kit injection, own template library, stock (Unsplash/Pexels APIs), AI image edit (remove bg, erase, extend) | Design → attach to post | 3–4 wks (Polotno) / 8+ wks (custom) |
| **6. Inbox** | Meta webhooks (FB/IG DMs, comments, mentions), conversations, assign/resolve/labels, snippets, AI reply suggest | Reply to IG DM from the app | 3 wks |
| **7. Workflows** | React Flow builder, triggers (schedule, RSS, webhook, Woo, comment/DM/mention), actions, AI agents + test, run logs | "RSS → AI agent → post" and "comment keyword → DM" templates work | 4 wks |
| **8. Remaining networks** | TikTok, YouTube Shorts, Pinterest, Threads, Google Business, Tumblr, Dribbble, WordPress, DEV.to, Notion, Airtable, Webflow, Framer, Wix, Whop, Twitch, Kick | Each passes the adapter test-suite | 4–6 wks (often blocked on platform app reviews) |
| **9. Analytics + Bio** | Metrics sync jobs, per-post + per-channel dashboards (Recharts), best-time recommendations from history; link-in-bio pages with click tracking | | 3 wks |
| **10. Platform** | Public REST API + docs (`llms.txt`, OpenAPI), MCP server w/ OAuth, i18n (8 locales), PWA, affiliate program, marketing site | Claude can create & schedule a post through MCP | 3 wks |

**Total:** about 9–11 months to full parity for a small team. A sellable MVP (Phases 0–3) takes **about 3 months**.

---

## Part 5 — Risks & hard parts (read before starting)

1. **Platform app reviews are the critical path, not code.** Start these in week 1:
   - Meta: Business verification and App Review for `pages_manage_posts`, `instagram_content_publish`, `instagram_manage_messages`, `pages_messaging`, `instagram_manage_comments`. This takes weeks to months.
   - TikTok: Content Posting API audit. Unaudited apps can only post privately.
   - X: the paid API tier is required for posting at volume.
   - LinkedIn: Community Management API approval for company pages.
   - YouTube: the quota extension.
   - Google Business Profile: API access request.
2. **Token health:** refresh jobs, revocation detection, and a "Reconnect" UX. This drives most support tickets.
3. **Media pipelines:** each network has its own aspect ratios, codecs and size rules (IG Reels 9:16 H.264, Bluesky 2 MB images, …). Build an FFmpeg/sharp worker with per-network presets.
4. **Exactly-once publishing:** use idempotency keys, never auto-retry a non-idempotent publish after a timeout without checking the network first, and handle partial success.
5. **Rate limits per network and per token:** queue with per-channel concurrency 1.
6. **AI cost control:** a credits ledger with reservations, plus prompt caching for the brand context.
7. **Security:** encrypt tokens at rest (KMS / envelope encryption), SSRF-guard every user-supplied URL (custom webhook, RSS, Fetch brand), scope API keys and OAuth grants per brand.
8. **Legal/IP:** don't reuse Ocoya's name, copy, templates, help-center text, or the Pixy embed key found in their bundle (`NEXT_PUBLIC_PIXY_EMBED_KEY` is their credential). Use your own design system and templates.

---

## Part 6 — Open questions / unresolved by this analysis

| Question | Status | How to resolve |
|---|---|---|
| Full in-app route map and component structure | **Partial.** REA graph timed out on 50/58 chunks | Re-run `analyze_javascript_application` with `analysis_timeout_ms` ≥ 900000 or exclude `0fs75igqtqujg.js` through `source_paths` |
| Authenticated API shapes (`/api/post-group`, `/api/socials`, …) | Unobserved | A logged-in **trial account** + REA `capture_browser_scenario` with response bodies → `inspect_analysis_view` `environment-manifest` |
| Backend DB / queue tech | Inferred only | Not observable from the client |
| Analytics depth (which metrics, which networks) | Unclear | Docs + trial account |
| Bio page feature set | Not documented in the fetched pages | Trial account |

---

## Appendix A — Observed internal endpoints (E4)

```
/api/auth/{session,signin,signin/email,callback/credentials}
/api/user  /api/settings/modal  /api/announcement
/api/workspace  /api/workspace/all  /api/workspace/brand  /api/workspace/{id}  /api/workspace/{id}/users
/api/brand/search
/api/socials  /api/socials/all  /api/socials/{id}/tiktok/creator-info
/api/socials/{facebook,airtable,discord,dribbble,kick,mastodon,notion,slack,snapchat,tumblr,twitch,webflow,whop,wix}/connect
/api/socials/webflow/{mapping,requirements}  /api/socials/framer/mapping  /api/socials/wix/defaults
/api/post-group/all  /api/post-group/{id}  /api/post-group/{id}/approval
/api/post-group/{duplicate,sources,ai/create}
/api/media  /api/assets/{preset,label}
/api/pixy/{designs,templates}
/api/calendar/share  /api/email/calendar
/api/analytics/post
/api/billing/{features,plans,portal,sync,resume,accept,withdrawal}
/api/livechat  /api/livechat/{help,unread,read,conversations,articles}
Public: https://www.app.ocoya.com/api/_public/v1/*   MCP: https://mcp.ocoya.com
```

## Appendix B — App routes observed

`/smm/planner`, `/smm/planner/ai-post`, `/smm/campaigns`, `/smm/campaigns/new`, `/smm/inbox`, `/smm/inbox/all`, `/smm/automation/workflows`, `/smm/analytics`, `/smm/integrations`, `/smm/bio`, `/smm/email`, `/smm/project`, `/brand`, `/bio`, `/auth`.

## Appendix C — Local artifacts

- Downloaded app bundle: `/tmp/claude-1000/-home-sami-ullah-Desktop-research-REA/6aa0f76e-0b73-416e-899c-54b9c84ceaf4/scratchpad/ocoya-app-js/`
- All 147 public doc pages + `openapi.yaml`: `/tmp/claude-1000/-home-sami-ullah-Desktop-research-REA/6aa0f76e-0b73-416e-899c-54b9c84ceaf4/scratchpad/ocoya-docs/`
  (scratchpad is session-scoped; copy anything you want to keep.)
