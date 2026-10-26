import { prisma, Prisma } from "@postline/db";
import { rollupGroupStatus, type PostStatus } from "@postline/core";
import { log } from "../log";

export const json = (v: unknown) => v as Prisma.InputJsonValue;

const TERMINAL: PostStatus[] = ["POSTED", "NEEDS_ATTENTION", "ERROR"];
/** Group statuses the rollup is allowed to overwrite (never touch drafts / scheduled groups). */
const ROLLUP_FROM: PostStatus[] = ["PUBLISHING", ...TERMINAL];

/**
 * Recompute a PostGroup's status from its Posts. Serialised per group with a row lock so
 * concurrent child completions can't interleave. Notifies the author when the group newly
 * lands in ERROR / NEEDS_ATTENTION.
 */
export async function rollupGroup(groupId: string): Promise<PostStatus | null> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PostGroup" WHERE id = ${groupId} FOR UPDATE`;
    const group = await tx.postGroup.findUnique({
      where: { id: groupId },
      select: { id: true, brandId: true, authorId: true, status: true, caption: true, publishedAt: true, posts: { select: { status: true } } },
    });
    if (!group) return null;
    if (!ROLLUP_FROM.includes(group.status as PostStatus)) return { prev: group.status, next: group.status, group };

    const next = rollupGroupStatus(group.posts.map((p) => p.status as PostStatus));
    const terminal = TERMINAL.includes(next);
    await tx.postGroup.update({
      where: { id: groupId },
      data: {
        status: next,
        ...(terminal ? { lockedAt: null } : {}),
        ...((next === "POSTED" || next === "NEEDS_ATTENTION") && !group.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });
    if ((next === "ERROR" || next === "NEEDS_ATTENTION") && group.status !== next) {
      await tx.notification.create({
        data: {
          userId: group.authorId,
          brandId: group.brandId,
          kind: "publish_failed",
          payload: json({ groupId, status: next, preview: group.caption.slice(0, 140) }),
        },
      });
    }
    return { prev: group.status, next, group };
  });
  if (result && result.prev !== result.next) log.info({ groupId, from: result.prev, to: result.next }, "group status rolled up");
  return (result?.next as PostStatus | undefined) ?? null;
}

/** Notify brand OWNER/ADMIN members (and the brand owner) that a channel needs reconnecting. */
export async function notifyChannelDisconnected(
  channel: { id: string; brandId: string; name: string; network: string },
  message: string,
): Promise<void> {
  const [members, brand] = await Promise.all([
    prisma.membership.findMany({ where: { brandId: channel.brandId, role: { in: ["OWNER", "ADMIN"] } }, select: { userId: true } }),
    prisma.brand.findUnique({ where: { id: channel.brandId }, select: { ownerId: true } }),
  ]);
  const userIds = new Set(members.map((m) => m.userId));
  if (brand) userIds.add(brand.ownerId);
  if (userIds.size === 0) return;
  await prisma.notification.createMany({
    data: [...userIds].map((userId) => ({
      userId,
      brandId: channel.brandId,
      kind: "channel_disconnected",
      payload: json({ channelId: channel.id, network: channel.network, name: channel.name, message }),
    })),
  });
}

/** Mark a channel NEEDS_RECONNECT (+ notify) unless it already is. */
export async function markNeedsReconnect(
  channel: { id: string; brandId: string; name: string; network: string },
  message: string,
): Promise<void> {
  const res = await prisma.channel.updateMany({
    where: { id: channel.id, health: { not: "NEEDS_RECONNECT" } },
    data: { health: "NEEDS_RECONNECT", lastError: json({ kind: "auth", message, at: new Date().toISOString() }) },
  });
  if (res.count > 0) await notifyChannelDisconnected(channel, message);
}
