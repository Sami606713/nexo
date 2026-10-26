import { prisma } from "@postline/db";
import type { Network, PostStatus } from "@postline/core";
import { badRequest, notFound, route } from "@/lib/http";
import type { SharedCalendarDTO } from "@/lib/posts/types";

type Ctx = { params: Promise<{ token: string }> };

const PUBLIC_STATUSES: PostStatus[] = ["SCHEDULED", "POSTED", "NEEDS_ATTENTION"];
const MAX_RANGE_MS = 62 * 24 * 3600 * 1000;

/** Public, unauthenticated: GET ?from=ISO&to=ISO → published/scheduled posts only, minimal fields. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { token } = await params;
  const share = await prisma.calendarShare.findUnique({
    where: { token },
    include: { brand: { select: { id: true, name: true, timezone: true, weekStart: true } } },
  });
  if (!share || share.revokedAt) throw notFound("This calendar link is no longer available");

  const sp = new URL(req.url).searchParams;
  const now = new Date();
  const from = sp.get("from") ? new Date(sp.get("from")!) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = sp.get("to") ? new Date(sp.get("to")!) : new Date(now.getFullYear(), now.getMonth() + 2, 1);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw badRequest("Invalid date range");
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) throw badRequest("Date range too large");

  const groups = await prisma.postGroup.findMany({
    where: { brandId: share.brand.id, status: { in: PUBLIC_STATUSES }, scheduledAt: { gte: from, lt: to } },
    orderBy: { scheduledAt: "asc" },
    take: 500,
    select: {
      id: true,
      caption: true,
      status: true,
      scheduledAt: true,
      publishedAt: true,
      posts: {
        select: {
          captionOverride: true,
          url: true,
          status: true,
          channel: { select: { network: true, name: true, avatarUrl: true } },
        },
      },
      media: { orderBy: { position: "asc" }, take: 1, select: { media: { select: { url: true, mime: true } } } },
    },
  });

  const out: SharedCalendarDTO = {
    brand: { name: share.brand.name, timezone: share.brand.timezone, weekStart: share.brand.weekStart },
    posts: groups.map((g) => ({
      id: g.id,
      scheduledAt: (g.publishedAt ?? g.scheduledAt!).toISOString(),
      status: g.status as PostStatus,
      caption: g.caption,
      channels: g.posts.map((p) => ({
        network: p.channel.network as Network,
        name: p.channel.name,
        avatarUrl: p.channel.avatarUrl,
        url: p.status === "POSTED" ? p.url : null,
      })),
      thumbUrl: g.media[0]?.media.mime.startsWith("image/") ? g.media[0].media.url : null,
    })),
  };
  return out;
});
