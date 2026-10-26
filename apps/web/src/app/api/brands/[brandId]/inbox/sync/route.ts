// OWNED BY: inbox agent. POST — manual refresh: queue an inbox sync for every enabled, live channel.
import { prisma } from "@postline/db";
import { route } from "@/lib/http";
import { enqueueSync } from "@/lib/queue";
import { requireBrand } from "@/lib/session";
import { isLiveChannel } from "../_lib/server";

type Ctx = { params: Promise<{ brandId: string }> };

export const POST = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  const channels = await prisma.channel.findMany({
    where: { brandId, inboxEnabled: true, health: { not: "NEEDS_RECONNECT" } },
    select: { id: true, network: true, extras: true },
  });
  const live = channels.filter(isLiveChannel);
  for (const c of live) await enqueueSync({ kind: "inbox", channelId: c.id });
  return { queued: live.length };
});
