import { prisma } from "@postline/db";
import { notFound, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";

type Ctx = { params: Promise<{ brandId: string; pageId: string }> };

/** Last 30 days: daily views & clicks, clicks per block, top referrers. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { brandId, pageId } = await params;
  await requireBrand(brandId, "analytics.view");
  const page = await prisma.bioPage.findFirst({ where: { id: pageId, brandId }, select: { id: true } });
  if (!page) throw notFound("Bio page not found");
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 30) || 30));
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1)));

  const [daily, blocks, refs] = await Promise.all([
    prisma.$queryRaw<Array<{ day: Date; views: bigint; clicks: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(*) FILTER (WHERE kind = 'view') AS views,
             COUNT(*) FILTER (WHERE kind = 'click') AS clicks
      FROM "BioPageEvent" WHERE "pageId" = ${pageId} AND "createdAt" >= ${start}
      GROUP BY 1 ORDER BY 1`,
    prisma.bioPageEvent.groupBy({
      by: ["blockId"],
      where: { pageId, kind: "click", createdAt: { gte: start } },
      _count: { _all: true },
    }),
    prisma.bioPageEvent.groupBy({
      by: ["referrer"],
      where: { pageId, kind: "view", createdAt: { gte: start } },
      _count: { _all: true },
    }),
  ]);
  const byDay = new Map(daily.map((d) => [d.day.toISOString().slice(0, 10), d]));
  const series = Array.from({ length: days }, (_, i) => {
    const key = new Date(start.getTime() + i * 24 * 3600_000).toISOString().slice(0, 10);
    const d = byDay.get(key);
    return { date: key, views: Number(d?.views ?? 0), clicks: Number(d?.clicks ?? 0) };
  });
  const views = series.reduce((s, d) => s + d.views, 0);
  const clicks = series.reduce((s, d) => s + d.clicks, 0);
  return {
    days,
    views,
    clicks,
    ctr: views ? clicks / views : 0,
    series,
    blocks: blocks.filter((b) => b.blockId).map((b) => ({ blockId: b.blockId!, clicks: b._count._all })).sort((a, b) => b.clicks - a.clicks),
    referrers: refs
      .map((r) => ({ referrer: r.referrer ?? "Direct", views: r._count._all }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8),
  };
});
