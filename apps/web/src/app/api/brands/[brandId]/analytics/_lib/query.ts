import "server-only";
import { Prisma, prisma } from "@postline/db";
import { badRequest } from "@/lib/http";

const DAY = 24 * 3600_000;

export interface Range {
  from: Date;
  to: Date;
  channelIds: string[] | null;
}

/** ?from&to (ISO date or datetime) &channelIds=a,b — defaults to the last 30 days. */
export function parseRange(req: Request, defaultDays = 30): Range {
  const sp = new URL(req.url).searchParams;
  const toRaw = sp.get("to");
  const fromRaw = sp.get("from");
  const to = toRaw ? new Date(toRaw) : new Date();
  const from = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - defaultDays * DAY);
  if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime())) throw badRequest("Invalid date range");
  // A bare date "to" means "through the end of that day".
  if (toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw)) to.setUTCHours(23, 59, 59, 999);
  if (from > to) throw badRequest("`from` must be before `to`");
  if (to.getTime() - from.getTime() > 400 * DAY) throw badRequest("Range is limited to 400 days");
  const ids = (sp.get("channelIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { from, to, channelIds: ids.length ? ids : null };
}

export function previousRange(r: Range): Range {
  const len = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - len - 1), to: new Date(r.from.getTime() - 1), channelIds: r.channelIds };
}

const channelFilter = (alias: string, ids: string[] | null) =>
  ids ? Prisma.sql`AND ${Prisma.raw(`${alias}."id"`)} IN (${Prisma.join(ids)})` : Prisma.empty;

export interface PostRow {
  postId: string;
  groupId: string;
  publishedAt: Date;
  url: string | null;
  caption: string;
  channelId: string;
  channelName: string;
  network: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  engagement: number;
}

/** Published posts in range with their latest metric snapshot. */
export async function publishedPosts(brandId: string, r: Range): Promise<PostRow[]> {
  const rows = await prisma.$queryRaw<
    Array<Omit<PostRow, "engagement"> & { [k: string]: unknown }>
  >`
    SELECT p."id" AS "postId", p."groupId", p."publishedAt", p."url",
           COALESCE(p."captionOverride", g."caption") AS "caption",
           c."id" AS "channelId", c."name" AS "channelName", c."network"::text AS "network",
           COALESCE(m."impressions", 0) AS "impressions", COALESCE(m."reach", 0) AS "reach",
           COALESCE(m."likes", 0) AS "likes", COALESCE(m."comments", 0) AS "comments",
           COALESCE(m."shares", 0) AS "shares", COALESCE(m."saves", 0) AS "saves",
           COALESCE(m."clicks", 0) AS "clicks"
    FROM "Post" p
    JOIN "Channel" c ON c."id" = p."channelId"
    JOIN "PostGroup" g ON g."id" = p."groupId"
    LEFT JOIN LATERAL (
      SELECT * FROM "PostMetric" pm WHERE pm."postId" = p."id" ORDER BY pm."capturedAt" DESC LIMIT 1
    ) m ON TRUE
    WHERE c."brandId" = ${brandId} AND p."status" = 'POSTED'
      AND p."publishedAt" >= ${r.from} AND p."publishedAt" <= ${r.to}
      ${channelFilter("c", r.channelIds)}
    ORDER BY p."publishedAt" ASC`;
  return rows.map((x) => {
    const n = (k: string) => Number(x[k] ?? 0);
    const likes = n("likes"),
      comments = n("comments"),
      shares = n("shares"),
      saves = n("saves");
    return {
      postId: x.postId,
      groupId: x.groupId,
      publishedAt: x.publishedAt,
      url: x.url,
      caption: x.caption,
      channelId: x.channelId,
      channelName: x.channelName,
      network: x.network,
      impressions: n("impressions"),
      reach: n("reach"),
      likes,
      comments,
      shares,
      saves,
      clicks: n("clicks"),
      engagement: likes + comments + shares + saves,
    };
  });
}

export interface ChannelDayRow {
  channelId: string;
  date: Date;
  followers: number;
  impressions: number;
  engagement: number;
}

export async function channelDays(brandId: string, r: Range): Promise<ChannelDayRow[]> {
  const rows = await prisma.channelMetric.findMany({
    where: {
      channel: { brandId, ...(r.channelIds ? { id: { in: r.channelIds } } : {}) },
      date: { gte: startOfUtcDay(r.from), lte: r.to },
    },
    select: { channelId: true, date: true, followers: true, impressions: true, engagement: true },
    orderBy: { date: "asc" },
  });
  return rows;
}

export const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export function eachDay(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let t = startOfUtcDay(from).getTime(); t <= to.getTime(); t += DAY) out.push(dayKey(new Date(t)));
  return out;
}

export async function brandChannels(brandId: string, ids: string[] | null) {
  return prisma.channel.findMany({
    where: { brandId, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, name: true, network: true, username: true, avatarUrl: true },
    orderBy: { createdAt: "asc" },
  });
}

export interface Totals {
  impressions: number;
  engagement: number;
  engagementRate: number;
  followersGrowth: number;
  followers: number;
  postsPublished: number;
  linkClicks: number;
}

/** Followers growth = Σ per channel (last value in range − first value in range). */
function followersOf(days: ChannelDayRow[]): { growth: number; total: number } {
  const byCh = new Map<string, ChannelDayRow[]>();
  for (const d of days) {
    const a = byCh.get(d.channelId) ?? [];
    a.push(d);
    byCh.set(d.channelId, a);
  }
  let growth = 0;
  let total = 0;
  for (const rows of byCh.values()) {
    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    growth += last.followers - first.followers;
    total += last.followers;
  }
  return { growth, total };
}

export async function totals(brandId: string, r: Range): Promise<Totals> {
  const [posts, days] = await Promise.all([publishedPosts(brandId, r), channelDays(brandId, r)]);
  // Account-level daily metrics when available; otherwise fall back to the sum of post snapshots.
  const chImpr = days.reduce((s, d) => s + d.impressions, 0);
  const chEng = days.reduce((s, d) => s + d.engagement, 0);
  const postImpr = posts.reduce((s, p) => s + p.impressions, 0);
  const postEng = posts.reduce((s, p) => s + p.engagement, 0);
  const impressions = Math.max(chImpr, postImpr);
  const engagement = Math.max(chEng, postEng);
  const f = followersOf(days);
  return {
    impressions,
    engagement,
    engagementRate: impressions > 0 ? engagement / impressions : 0,
    followersGrowth: f.growth,
    followers: f.total,
    postsPublished: posts.length,
    linkClicks: posts.reduce((s, p) => s + p.clicks, 0),
  };
}

/** Weekday (0=Sun) and hour of `d` in time zone `tz`. */
export function zonedWeekdayHour(d: Date, tz: string): { weekday: number; hour: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
  }
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), hour };
}
