// OWNED BY: inbox agent. PATCH {enabled} — turn the inbox on/off for one channel.
import { z } from "zod";
import { prisma } from "@postline/db";
import type { Network } from "@postline/core";
import { getInboxProvider, inboxSupported } from "@postline/integrations";
import { badRequest, notFound, parseBody, route } from "@/lib/http";
import { enqueueSync } from "@/lib/queue";
import { requireBrand } from "@/lib/session";
import { isDemoChannel } from "../../../inbox/_lib/server";

type Ctx = { params: Promise<{ brandId: string; channelId: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, channelId } = await params;
  await requireBrand(brandId, "posts.write");
  const { enabled } = await parseBody(req, z.object({ enabled: z.boolean() }));
  const ch = await prisma.channel.findFirst({ where: { id: channelId, brandId }, select: { id: true, network: true, extras: true } });
  if (!ch) throw notFound("Channel not found");
  if (enabled && !inboxSupported(ch.network as Network)) throw badRequest("Inbox not supported for this network");
  await prisma.channel.update({ where: { id: ch.id }, data: { inboxEnabled: enabled } });
  let syncing = false;
  if (enabled && !isDemoChannel(ch.extras) && getInboxProvider(ch.network as Network)) {
    await enqueueSync({ kind: "inbox", channelId: ch.id });
    syncing = true;
  }
  return { id: ch.id, inboxEnabled: enabled, syncing };
});
