import { z } from "zod";
import { prisma } from "@postline/db";
import { scorePostHeuristic } from "@postline/ai/score";
import type { Network } from "@postline/core";
import { conflict, notFound, route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { loadGroup } from "@/lib/posts/access";
import { groupInclude, toGroupDTO } from "@/lib/posts/dto";
import { cancelGroupPublish } from "@/lib/queue";
import { loadCampaign } from "@/lib/campaigns";

type Ctx = { params: Promise<{ brandId: string; campaignId: string; groupId: string }> };

async function loadDraft(brandId: string, campaignId: string, groupId: string) {
  const access = await requireBrand(brandId, "posts.write");
  const campaign = await loadCampaign(access, campaignId);
  const group = await loadGroup(access, groupId);
  if (group.campaignId !== campaign.id) throw notFound("Post isn't part of this campaign");
  return { access, campaign, group };
}

const patchInput = z.object({
  caption: z.string().max(200_000).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
});

/**
 * PATCH {caption?, scheduledAt?} — review-screen edits that keep the post a DRAFT
 * (the generic posts PATCH would schedule a post that has a time). Editing the caption
 * drops per-network caption variants so every channel gets the edited text.
 */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, campaignId, groupId } = await params;
  const { group } = await loadDraft(brandId, campaignId, groupId);
  if (group.status !== "DRAFT") throw conflict("Only unapproved drafts can be edited here — open it in the editor instead");
  const body = await readBody(req, patchInput);
  const networks = [...new Set(group.posts.map((p) => p.channel.network as Network))];
  await prisma.$transaction(async (tx) => {
    if (body.caption !== undefined) {
      await tx.post.updateMany({ where: { groupId: group.id }, data: { captionOverride: null } });
    }
    await tx.postGroup.update({
      where: { id: group.id },
      data: {
        ...(body.caption !== undefined
          ? { caption: body.caption, score: scorePostHeuristic({ caption: body.caption, networks, mediaCount: group.media.length }).total }
          : {}),
        ...(body.scheduledAt !== undefined ? { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null } : {}),
      },
    });
  });
  return toGroupDTO(await prisma.postGroup.findUniqueOrThrow({ where: { id: group.id }, include: groupInclude }));
});

/** DELETE — remove a campaign post (not while publishing / after publishing). */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, campaignId, groupId } = await params;
  const { group } = await loadDraft(brandId, campaignId, groupId);
  if (["PUBLISHING", "POSTED", "NEEDS_ATTENTION"].includes(group.status)) throw conflict("Published posts can't be removed from here");
  await cancelGroupPublish(group.id).catch(() => undefined);
  await prisma.postGroup.delete({ where: { id: group.id } });
  return { ok: true };
});
