// OWNED BY: inbox agent. GET — the brand's channels with inbox status (for the inbox profile list).
import { prisma } from "@postline/db";
import type { Network } from "@postline/core";
import { inboxSupported } from "@postline/integrations";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import type { InboxChannelDto } from "@/components/inbox/types";
import { isDemoChannel, isLiveChannel } from "../_lib/server";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  const [channels, open, unread] = await Promise.all([
    prisma.channel.findMany({
      where: { brandId },
      select: { id: true, network: true, name: true, username: true, avatarUrl: true, health: true, inboxEnabled: true, extras: true },
      orderBy: [{ network: "asc" }, { name: "asc" }],
    }),
    prisma.conversation.groupBy({ by: ["channelId"], where: { brandId, status: "OPEN" }, _count: { _all: true } }),
    prisma.conversation.groupBy({ by: ["channelId"], where: { brandId, status: "OPEN", unread: true }, _count: { _all: true } }),
  ]);
  const openBy = new Map(open.map((g) => [g.channelId, g._count._all]));
  const unreadBy = new Map(unread.map((g) => [g.channelId, g._count._all]));
  return channels
    .map((c): InboxChannelDto => {
      const extras = (c.extras ?? {}) as Record<string, unknown>;
      return {
        id: c.id,
        network: c.network as Network,
        name: c.name,
        username: c.username,
        avatarUrl: c.avatarUrl,
        health: c.health,
        inboxEnabled: c.inboxEnabled,
        supported: inboxSupported(c.network as Network),
        live: isLiveChannel(c),
        demo: isDemoChannel(extras),
        syncedAt: typeof extras.inboxSyncedAt === "string" ? extras.inboxSyncedAt : null,
        openCount: openBy.get(c.id) ?? 0,
        unreadCount: unreadBy.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => Number(b.supported) - Number(a.supported));
});
