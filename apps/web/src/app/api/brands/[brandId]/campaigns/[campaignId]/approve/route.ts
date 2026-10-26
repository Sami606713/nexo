import { z } from "zod";
import { MIN_SCHEDULE_LEAD_MS } from "@postline/core";
import { HttpError, route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { loadGroup } from "@/lib/posts/access";
import { inputFromGroup, savePostGroup } from "@/lib/posts/save";
import { campaignDetail, loadCampaign } from "@/lib/campaigns";

type Ctx = { params: Promise<{ brandId: string; campaignId: string }> };

const input = z.object({
  groupIds: z.array(z.string()).min(1, "Select at least one post").max(100),
  schedule: z.array(z.object({ groupId: z.string(), scheduledAt: z.string().datetime({ offset: true }) })).max(100).optional(),
});

/**
 * POST {groupIds, schedule?} — approve the chosen campaign drafts: each becomes SCHEDULED at its
 * (optionally overridden) time and is queued for publishing. Unselected posts stay drafts.
 * Each post is validated independently; failures are returned per post.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId, campaignId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const campaign = await loadCampaign(access, campaignId);
  const body = await readBody(req, input);
  const overrides = new Map((body.schedule ?? []).map((s) => [s.groupId, s.scheduledAt]));

  const scheduled: string[] = [];
  const failed: { groupId: string; error: string }[] = [];
  for (const groupId of [...new Set(body.groupIds)]) {
    try {
      const group = await loadGroup(access, groupId);
      if (group.campaignId !== campaign.id) throw new HttpError(404, "Post isn't part of this campaign");
      if (group.status !== "DRAFT") throw new HttpError(409, "Already scheduled or published");
      const at = overrides.get(groupId) ?? group.scheduledAt?.toISOString() ?? null;
      if (!at) throw new HttpError(400, "Pick a time first");
      if (new Date(at).getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) throw new HttpError(400, "This time has passed — pick a time at least 2 minutes from now");
      await savePostGroup(access, { ...inputFromGroup(group), scheduledAt: new Date(at).toISOString() }, group);
      scheduled.push(groupId);
    } catch (err) {
      failed.push({ groupId, error: err instanceof Error && err.message ? err.message : "Couldn't schedule this post" });
    }
  }
  return { scheduled, failed, campaign: await campaignDetail(access, campaign) };
});
