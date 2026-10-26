import "server-only";
import { prisma, Prisma } from "@postline/db";
import {
  MIN_SCHEDULE_LEAD_MS,
  type MediaItem,
  type Network,
  type PostStatus,
  type UpsertPostGroupInput,
} from "@postline/core";
import { validateForNetwork } from "@postline/integrations/client";
import { scorePostHeuristic } from "@postline/ai/score";
import type { BrandAccess } from "@/lib/session";
import { badRequest, HttpError } from "@/lib/http";
import { cancelGroupPublish, enqueueGroupPublish } from "@/lib/queue";
import { groupInclude, type GroupWithRelations } from "./dto";
import { assertNotLocked } from "./access";
import type { ChannelIssuesDTO } from "./types";

export const SCHEDULE_LEAD_MESSAGE = "Choose a schedule time at least 2 minutes from now";

type ChannelRow = { id: string; network: Network; name: string };
type MediaRow = Prisma.MediaAssetGetPayload<object>;

/** Rebuild a full upsert input from a stored group (used to merge PATCH bodies). */
export function inputFromGroup(g: GroupWithRelations): UpsertPostGroupInput {
  return {
    caption: g.caption,
    channels: g.posts.map((p) => ({ channelId: p.channelId, captionOverride: p.captionOverride })),
    mediaIds: g.media.map((m) => m.mediaId),
    labelIds: g.labels.map((l) => l.labelId),
    options: (g.options && typeof g.options === "object" && !Array.isArray(g.options)
      ? g.options
      : {}) as UpsertPostGroupInput["options"],
    notes: g.notes,
    scheduledAt: g.scheduledAt ? g.scheduledAt.toISOString() : null,
    timezone: g.timezone,
  };
}

export function toMediaItem(m: MediaRow): MediaItem {
  return {
    url: m.url,
    mime: m.mime,
    width: m.width ?? undefined,
    height: m.height ?? undefined,
    sizeBytes: m.sizeBytes,
    durationSec: m.duration ?? undefined,
    alt: m.alt ?? undefined,
  };
}

/** Run network validation for every selected channel against its effective caption. */
export function validateGroup(
  channels: ChannelRow[],
  input: Pick<UpsertPostGroupInput, "caption" | "channels" | "options">,
  media: MediaRow[],
): ChannelIssuesDTO[] {
  const items = media.map(toMediaItem);
  return channels.map((c) => {
    const pc = input.channels.find((x) => x.channelId === c.id);
    const caption = pc?.captionOverride ?? input.caption;
    const issues = validateForNetwork(c.network, {
      caption,
      media: items,
      options: (input.options[c.network] ?? {}) as Record<string, unknown>,
    });
    return { channelId: c.id, network: c.network, name: c.name, issues };
  });
}

async function loadRefs(brandId: string, input: UpsertPostGroupInput) {
  const channelIds = [...new Set(input.channels.map((c) => c.channelId))];
  if (channelIds.length !== input.channels.length) throw badRequest("Each channel can only be selected once");
  const mediaIds = [...new Set(input.mediaIds)];
  const labelIds = [...new Set(input.labelIds)];

  const [channels, media, labels] = await Promise.all([
    channelIds.length
      ? prisma.channel.findMany({ where: { brandId, id: { in: channelIds } }, select: { id: true, network: true, name: true } })
      : Promise.resolve([]),
    mediaIds.length ? prisma.mediaAsset.findMany({ where: { brandId, id: { in: mediaIds } } }) : Promise.resolve([]),
    labelIds.length ? prisma.label.findMany({ where: { brandId, id: { in: labelIds } }, select: { id: true } }) : Promise.resolve([]),
  ]);
  if (channels.length !== channelIds.length) throw badRequest("One or more channels don't belong to this brand");
  if (media.length !== mediaIds.length) throw badRequest("One or more media files don't belong to this brand");
  if (labels.length !== labelIds.length) throw badRequest("One or more labels don't belong to this brand");

  // keep media in requested order
  const byId = new Map(media.map((m) => [m.id, m]));
  const orderedMedia = mediaIds.map((id) => byId.get(id)!).filter(Boolean);
  return { channels: channels as ChannelRow[], media: orderedMedia, labelIds, mediaIds };
}

function hasContent(input: Pick<UpsertPostGroupInput, "caption" | "channels" | "mediaIds">) {
  return (
    input.caption.trim().length > 0 ||
    input.mediaIds.length > 0 ||
    input.channels.some((c) => (c.captionOverride ?? "").trim().length > 0)
  );
}

export { hasContent };

/** Enqueue (after cancelling any previous job). Reverts to DRAFT if the queue is unreachable. */
export async function syncPublishQueue(groupId: string, status: PostStatus, scheduledAt: Date | null) {
  try {
    await cancelGroupPublish(groupId);
  } catch (err) {
    console.error("[posts] cancelGroupPublish failed", err);
  }
  if (status !== "SCHEDULED" || !scheduledAt) return;
  try {
    await enqueueGroupPublish(groupId, scheduledAt);
  } catch (err) {
    console.error("[posts] enqueueGroupPublish failed", err);
    await prisma.$transaction([
      prisma.postGroup.update({ where: { id: groupId }, data: { status: "DRAFT" } }),
      prisma.post.updateMany({ where: { groupId }, data: { status: "DRAFT" } }),
    ]);
    throw new HttpError(503, "Scheduling is temporarily unavailable. Your post was saved as a draft — please try again.");
  }
}

export interface SaveResult {
  group: GroupWithRelations;
  issues: ChannelIssuesDTO[];
}

/**
 * Create or update a PostGroup from a full upsert input. Enforces brand ownership of
 * channels/media/labels, the lock, scheduling lead time, and blocking validation errors
 * (only when the post is going to be scheduled — drafts may be saved incomplete).
 */
export async function savePostGroup(
  access: BrandAccess,
  input: UpsertPostGroupInput,
  existing?: GroupWithRelations,
): Promise<SaveResult> {
  const brandId = access.brand.id;
  if (existing) assertNotLocked(existing.status);

  const refs = await loadRefs(brandId, input);

  // ── scheduling
  const now = Date.now();
  const keepDraft = !!input.keepDraft && !input.publishNow;
  let scheduledAt: Date | null = null;
  if (input.publishNow) {
    scheduledAt = new Date(now);
  } else if (input.scheduledAt) {
    scheduledAt = new Date(input.scheduledAt);
    const unchanged = existing?.scheduledAt && existing.scheduledAt.getTime() === scheduledAt.getTime();
    // Allow keeping an existing (still future) time when editing other fields.
    const minOk = unchanged ? scheduledAt.getTime() > now : scheduledAt.getTime() >= now + MIN_SCHEDULE_LEAD_MS;
    if (!minOk && !keepDraft) throw badRequest(SCHEDULE_LEAD_MESSAGE);
  }

  // ── status
  // An undecided approval keeps the group in PENDING_APPROVAL (the decision re-schedules it).
  const pendingApproval = !!existing?.approval && !existing.approval.decision && existing.status === "PENDING_APPROVAL";
  if (pendingApproval && input.publishNow) throw badRequest("This post is waiting for approval");
  const status: PostStatus = pendingApproval ? "PENDING_APPROVAL" : scheduledAt && !keepDraft ? "SCHEDULED" : "DRAFT";

  // ── validation (blocking only when it will be scheduled)
  const issues = validateGroup(refs.channels, input, refs.media);
  if (status === "SCHEDULED") {
    if (refs.channels.length === 0) throw badRequest("Select at least one channel");
    const blocking = issues.filter((c) => c.issues.some((i) => i.level === "error"));
    if (blocking.length) {
      const first = blocking[0]!;
      const firstMsg = first.issues.find((i) => i.level === "error")!.message;
      throw badRequest(`${first.name}: ${firstMsg}`, { channelIssues: issues });
    }
  }

  const score = scorePostHeuristic({
    caption: input.caption,
    networks: [...new Set(refs.channels.map((c) => c.network))],
    mediaCount: refs.media.length,
  }).total;

  const postStatus: PostStatus = status;
  const groupData = {
    caption: input.caption,
    status,
    scheduledAt,
    timezone: input.timezone ?? null,
    options: input.options as Prisma.InputJsonValue,
    notes: input.notes ?? null,
    score: Number.isFinite(score) ? Math.round(score) : null,
    lockedAt: null,
  };

  const groupId = await prisma.$transaction(async (tx) => {
    const g = existing
      ? await tx.postGroup.update({ where: { id: existing.id }, data: groupData })
      : await tx.postGroup.create({ data: { ...groupData, brandId, authorId: access.user.id } });

    const keep = input.channels.map((c) => c.channelId);
    await tx.post.deleteMany({ where: { groupId: g.id, channelId: { notIn: keep } } });
    for (const c of input.channels) {
      await tx.post.upsert({
        where: { groupId_channelId: { groupId: g.id, channelId: c.channelId } },
        create: { groupId: g.id, channelId: c.channelId, captionOverride: c.captionOverride ?? null, status: postStatus },
        update: {
          captionOverride: c.captionOverride ?? null,
          status: postStatus,
        },
      });
    }
    // Clear old per-post errors when re-saving a failed post.
    if (existing?.status === "ERROR") {
      await tx.post.updateMany({ where: { groupId: g.id }, data: { error: Prisma.DbNull, attempts: 0 } });
    }

    await tx.postMedia.deleteMany({ where: { groupId: g.id } });
    if (refs.mediaIds.length) {
      await tx.postMedia.createMany({ data: refs.mediaIds.map((mediaId, position) => ({ groupId: g.id, mediaId, position })) });
    }
    await tx.postLabel.deleteMany({ where: { groupId: g.id } });
    if (refs.labelIds.length) {
      await tx.postLabel.createMany({ data: refs.labelIds.map((labelId) => ({ groupId: g.id, labelId })) });
    }
    return g.id;
  });

  await syncPublishQueue(groupId, status, scheduledAt);

  const group = await prisma.postGroup.findUniqueOrThrow({ where: { id: groupId }, include: groupInclude });
  return { group, issues };
}
