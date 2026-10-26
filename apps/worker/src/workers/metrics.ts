/**
 * Metrics ingestion (own queue "metrics", not "sync").
 * Every 6h: for POSTED posts younger than 30 days, and for every healthy channel, pull public
 * counters from the network and append PostMetric rows / upsert today's ChannelMetric row.
 * Implemented inline for Bluesky (public AppView) and Mastodon (REST); other networks are skipped.
 * Demo channels (extras.demo === true) are skipped — their metrics come from the demo seed.
 */
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { prisma } from "@postline/db";
import { decryptCredentials } from "@postline/core/crypto";

export const METRICS_QUEUE = "metrics";
const EVERY_MS = 6 * 3600_000;
const POST_WINDOW_MS = 30 * 24 * 3600_000;
const BSKY_APPVIEW = "https://public.api.bsky.app";
const TIMEOUT_MS = 15_000;

interface MinimalLog {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

interface Counts {
  likes: number;
  shares: number;
  comments: number;
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).pathname}`);
  return (await res.json()) as T;
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");
const isDemo = (extras: unknown) => !!extras && typeof extras === "object" && (extras as { demo?: unknown }).demo === true;

function credString(enc: string, key: string): string | undefined {
  try {
    const v = decryptCredentials(enc)[key];
    return typeof v === "string" && v ? v : undefined;
  } catch {
    return undefined;
  }
}

// ── Bluesky ──
async function blueskyPost(uri: string): Promise<Counts> {
  const r = await getJson<{ thread?: { post?: { likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number } } }>(
    `${BSKY_APPVIEW}/xrpc/app.bsky.feed.getPostThread?depth=0&parentHeight=0&uri=${encodeURIComponent(uri)}`,
  );
  const p = r.thread?.post ?? {};
  return { likes: p.likeCount ?? 0, shares: (p.repostCount ?? 0) + (p.quoteCount ?? 0), comments: p.replyCount ?? 0 };
}
async function blueskyFollowers(did: string): Promise<number> {
  const r = await getJson<{ followersCount?: number }>(`${BSKY_APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return r.followersCount ?? 0;
}

// ── Mastodon ──
function mastodonApi(credentialsEnc: string, extras: unknown) {
  const instance =
    credString(credentialsEnc, "instanceUrl") ??
    (extras && typeof extras === "object" && typeof (extras as { instanceUrl?: unknown }).instanceUrl === "string"
      ? ((extras as { instanceUrl: string }).instanceUrl as string)
      : undefined);
  if (!instance) return null;
  const token = credString(credentialsEnc, "accessToken");
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  return <T>(path: string) => getJson<T>(`${trimSlash(instance)}${path}`, headers);
}
async function mastodonPost(call: NonNullable<ReturnType<typeof mastodonApi>>, id: string): Promise<Counts> {
  const s = await call<{ favourites_count?: number; reblogs_count?: number; replies_count?: number }>(`/api/v1/statuses/${encodeURIComponent(id)}`);
  return { likes: s.favourites_count ?? 0, shares: s.reblogs_count ?? 0, comments: s.replies_count ?? 0 };
}
async function mastodonFollowers(call: NonNullable<ReturnType<typeof mastodonApi>>, accountId: string): Promise<number> {
  const a = await call<{ followers_count?: number }>(`/api/v1/accounts/${encodeURIComponent(accountId)}`);
  return a.followers_count ?? 0;
}

const SUPPORTED = ["BLUESKY", "MASTODON"] as const;

export async function collectPostMetrics(log: MinimalLog, now = new Date()): Promise<{ captured: number; failed: number }> {
  const posts = await prisma.post.findMany({
    where: {
      status: "POSTED",
      externalId: { not: null },
      publishedAt: { gte: new Date(now.getTime() - POST_WINDOW_MS) },
      channel: { network: { in: [...SUPPORTED] }, health: "OK" },
    },
    select: { id: true, externalId: true, channel: { select: { id: true, network: true, credentialsEnc: true, extras: true } } },
    take: 1000,
  });
  let captured = 0;
  let failed = 0;
  for (const p of posts) {
    if (!p.externalId || isDemo(p.channel.extras)) continue;
    try {
      let c: Counts | null = null;
      if (p.channel.network === "BLUESKY") c = await blueskyPost(p.externalId);
      else if (p.channel.network === "MASTODON") {
        const call = mastodonApi(p.channel.credentialsEnc, p.channel.extras);
        if (call) c = await mastodonPost(call, p.externalId);
      }
      if (!c) continue;
      await prisma.postMetric.create({
        data: { postId: p.id, capturedAt: now, likes: c.likes, shares: c.shares, comments: c.comments },
      });
      captured++;
    } catch (err) {
      failed++;
      log.warn({ err: err instanceof Error ? err.message : String(err), postId: p.id }, "post metrics fetch failed");
    }
  }
  return { captured, failed };
}

export async function collectChannelMetrics(log: MinimalLog, now = new Date()): Promise<{ captured: number; failed: number }> {
  const channels = await prisma.channel.findMany({
    where: { network: { in: [...SUPPORTED] }, health: "OK" },
    select: { id: true, network: true, externalId: true, credentialsEnc: true, extras: true },
  });
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let captured = 0;
  let failed = 0;
  for (const ch of channels) {
    if (isDemo(ch.extras)) continue;
    try {
      let followers: number | null = null;
      if (ch.network === "BLUESKY") followers = await blueskyFollowers(ch.externalId);
      else if (ch.network === "MASTODON") {
        const call = mastodonApi(ch.credentialsEnc, ch.extras);
        if (call) followers = await mastodonFollowers(call, ch.externalId);
      }
      if (followers === null) continue;
      // Today's engagement = sum of the latest snapshot of each post published today.
      const latest = await prisma.$queryRaw<Array<{ engagement: bigint | null }>>`
        SELECT SUM(m.likes + m.comments + m.shares) AS engagement FROM (
          SELECT DISTINCT ON (pm."postId") pm.likes, pm.comments, pm.shares
          FROM "PostMetric" pm JOIN "Post" p ON p.id = pm."postId"
          WHERE p."channelId" = ${ch.id} AND p."publishedAt" >= ${date}
          ORDER BY pm."postId", pm."capturedAt" DESC
        ) m`;
      const engagement = Number(latest[0]?.engagement ?? 0);
      await prisma.channelMetric.upsert({
        where: { channelId_date: { channelId: ch.id, date } },
        update: { followers, engagement },
        create: { channelId: ch.id, date, followers, engagement },
      });
      captured++;
    } catch (err) {
      failed++;
      log.warn({ err: err instanceof Error ? err.message : String(err), channelId: ch.id }, "channel metrics fetch failed");
    }
  }
  return { captured, failed };
}

/**
 * Start the metrics worker and register the 6-hourly repeatable job.
 * Returns the Worker (for graceful shutdown) and the Queue (close it on shutdown too).
 */
export function startMetricsWorkers(connection: ConnectionOptions, log: MinimalLog): { worker: Worker; queue: Queue } {
  const queue = new Queue(METRICS_QUEUE, { connection });
  const worker = new Worker(
    METRICS_QUEUE,
    async (job: Job) => {
      const posts = await collectPostMetrics(log);
      const channels = await collectChannelMetrics(log);
      log.info({ job: job.name, posts, channels }, "metrics collected");
      return { posts, channels };
    },
    { connection, concurrency: 1 },
  );
  worker.on("error", (err) => log.error({ err }, "metrics worker error"));
  void queue
    .upsertJobScheduler("collect-metrics", { every: EVERY_MS }, { name: "collect-metrics", opts: { removeOnComplete: 50, removeOnFail: 50 } })
    .catch((err) => log.error({ err }, "failed to schedule metrics job"));
  return { worker, queue };
}
