import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { brandChannels, channelDays, dayKey, eachDay, parseRange, publishedPosts } from "../_lib/query";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId, "analytics.view");
  const range = parseRange(req);
  const [days, posts, channels] = await Promise.all([
    channelDays(brandId, range),
    publishedPosts(brandId, range),
    brandChannels(brandId, range.channelIds),
  ]);
  const keys = eachDay(range.from, range.to);

  // Daily totals. Prefer account-level ChannelMetric; days without any fall back to post snapshots by publish day.
  const daily = new Map(keys.map((k) => [k, { impressions: 0, engagement: 0, hasChannel: false }]));
  for (const d of days) {
    const row = daily.get(dayKey(d.date));
    if (!row) continue;
    row.impressions += d.impressions;
    row.engagement += d.engagement;
    row.hasChannel = true;
  }
  const postDaily = new Map<string, { impressions: number; engagement: number }>();
  for (const p of posts) {
    const k = dayKey(p.publishedAt);
    const row = postDaily.get(k) ?? { impressions: 0, engagement: 0 };
    row.impressions += p.impressions;
    row.engagement += p.engagement;
    postDaily.set(k, row);
  }
  const series = keys.map((date) => {
    const r = daily.get(date)!;
    const fallback = postDaily.get(date);
    return r.hasChannel || !fallback
      ? { date, impressions: r.impressions, engagement: r.engagement }
      : { date, impressions: fallback.impressions, engagement: fallback.engagement };
  });

  // Followers per channel per day (carry last known value forward).
  const withFollowers = channels.filter((c) => days.some((d) => d.channelId === c.id));
  const byChDay = new Map<string, number>();
  for (const d of days) byChDay.set(`${d.channelId}|${dayKey(d.date)}`, d.followers);
  const last = new Map<string, number>();
  const followers = keys.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const c of withFollowers) {
      const v = byChDay.get(`${c.id}|${date}`) ?? last.get(c.id);
      if (v !== undefined) {
        last.set(c.id, v);
        row[c.id] = v;
      }
    }
    return row;
  });

  // Engagement by network from post snapshots.
  const net = new Map<string, { network: string; engagement: number; impressions: number; posts: number; clicks: number }>();
  for (const p of posts) {
    const r = net.get(p.network) ?? { network: p.network, engagement: 0, impressions: 0, posts: 0, clicks: 0 };
    r.engagement += p.engagement;
    r.impressions += p.impressions;
    r.clicks += p.clicks;
    r.posts += 1;
    net.set(p.network, r);
  }

  return {
    from: range.from,
    to: range.to,
    daily: series,
    followers: { channels: withFollowers.map((c) => ({ id: c.id, name: c.name, network: c.network })), rows: followers },
    byNetwork: [...net.values()].sort((a, b) => b.engagement - a.engagement),
  };
});
