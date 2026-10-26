import { z } from "zod";
import { prisma } from "@postline/db";
import { route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { cancelGroupPublish } from "@/lib/queue";
import { campaignDetail, loadCampaign } from "@/lib/campaigns";

type Ctx = { params: Promise<{ brandId: string; campaignId: string }> };

/** GET → CampaignDetailDTO (campaign + its posts, ordered by time). Poll while GENERATING. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId, campaignId } = await params;
  const access = await requireBrand(brandId, "posts.viewDrafts");
  return campaignDetail(access, await loadCampaign(access, campaignId));
});

const patchInput = z.object({ prompt: z.string().trim().min(3).max(4000).optional() });

/** PATCH {prompt?} — rename/re-describe the campaign. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, campaignId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const c = await loadCampaign(access, campaignId);
  const body = await readBody(req, patchInput);
  const updated = await prisma.campaign.update({ where: { id: c.id }, data: { ...(body.prompt ? { prompt: body.prompt } : {}) } });
  return campaignDetail(access, updated);
});

/**
 * DELETE — removes the campaign and its unscheduled drafts. Scheduled/published posts are kept
 * (they simply lose the campaign link).
 */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, campaignId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const c = await loadCampaign(access, campaignId);
  const drafts = await prisma.postGroup.findMany({ where: { campaignId: c.id, status: { in: ["DRAFT", "GENERATING", "ERROR"] } }, select: { id: true } });
  await Promise.all(drafts.map((d) => cancelGroupPublish(d.id).catch(() => undefined)));
  await prisma.$transaction([
    prisma.postGroup.deleteMany({ where: { id: { in: drafts.map((d) => d.id) } } }),
    prisma.campaign.delete({ where: { id: c.id } }),
  ]);
  return { ok: true, deletedPosts: drafts.length };
});
