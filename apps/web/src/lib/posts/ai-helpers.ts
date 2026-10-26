import "server-only";
import { prisma } from "@postline/db";
import type { Network } from "@postline/core";
import { badRequest } from "@/lib/http";

/** Resolve channel ids (must belong to the brand) → channels + distinct networks. */
export async function brandChannels(brandId: string, channelIds: string[]) {
  const ids = [...new Set(channelIds)];
  if (!ids.length) return { channels: [] as { id: string; network: Network }[], networks: [] as Network[] };
  const channels = (await prisma.channel.findMany({
    where: { brandId, id: { in: ids } },
    select: { id: true, network: true },
  })) as { id: string; network: Network }[];
  if (channels.length !== ids.length) throw badRequest("One or more channels don't belong to this brand");
  return { channels, networks: [...new Set(channels.map((c) => c.network))] };
}
