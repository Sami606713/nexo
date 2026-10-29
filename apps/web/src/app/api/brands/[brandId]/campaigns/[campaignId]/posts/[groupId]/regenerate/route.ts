import { prisma } from "@postline/db";
import { ai, brandContext, hasApiKey, offlinePost, withCredits } from "@postline/ai";
import { scorePostHeuristic } from "@postline/ai/score";
import { CREDIT_COST, type CampaignGoal, type GeneratePostRequest, type Network } from "@postline/core";
import { conflict, notFound, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { loadGroup } from "@/lib/posts/access";
import { groupInclude, toGroupDTO } from "@/lib/posts/dto";
import { angleFromNotes, loadCampaign, toCampaignDTO } from "@/lib/campaigns";
import { enforceRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ brandId: string; campaignId: string; groupId: string }> };

export const maxDuration = 60;

function withTags(text: string, tags: string[]): string {
  const missing = tags.map((h) => (h.startsWith("#") ? h : `#${h}`)).filter((h) => !text.toLowerCase().includes(h.toLowerCase()));
  return missing.length ? `${text.trimEnd()}\n\n${missing.join(" ")}` : text;
}

/**
 * POST — rewrite one campaign post from its planned angle (1 credit with Claude; free in
 * offline template mode). Keeps media, channels and time; the post stays a DRAFT.
 */
export const POST = route<Ctx>(async (_req, { params }) => {
  const { brandId, campaignId, groupId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  await enforceRateLimit("ai", access.user.id);
  const campaign = await loadCampaign(access, campaignId);
  const group = await loadGroup(access, groupId);
  if (group.campaignId !== campaign.id) throw notFound("Post isn't part of this campaign");
  if (group.status !== "DRAFT") throw conflict("Only unapproved drafts can be regenerated");

  const settings = toCampaignDTO(campaign).settings;
  const networks = [...new Set(group.posts.map((p) => p.channel.network as Network))];
  const angle = angleFromNotes(group.notes);
  const request: GeneratePostRequest = {
    prompt: [
      `This post is part of a campaign. Campaign brief: ${campaign.prompt}`,
      `Campaign goal: ${campaign.goal}.`,
      campaign.audience ? `Audience: ${campaign.audience}.` : "",
      angle ? `Angle for this post: ${angle}. Write a fresh take that is different from: "${group.caption.slice(0, 600)}"` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    networks: networks.length ? networks : ["LINKEDIN"],
    tone: settings.tone ?? undefined,
    length: settings.length ?? undefined,
    includeHashtags: settings.includeHashtags,
  };

  const generated = hasApiKey()
    ? await withCredits(
        { brandId: access.brand.id, actorId: access.user.id, reason: "caption", amount: CREDIT_COST.caption, refType: "PostGroup", refId: group.id },
        () => ai.generatePost(brandContext(access.brand), request),
      )
    : offlinePost(brandContext(access.brand), {
        ...request,
        prompt: `${angle ? `Angle: ${angle}\n` : ""}${campaign.prompt}`,
        goal: campaign.goal as CampaignGoal,
        audience: campaign.audience ?? undefined,
        seed: Date.now(),
      });

  const caption = settings.includeHashtags ? withTags(generated.caption, generated.hashtags) : generated.caption;
  await prisma.$transaction([
    ...group.posts.map((p) => {
      const variant = generated.perNetwork?.[p.channel.network as Network];
      return prisma.post.update({ where: { id: p.id }, data: { captionOverride: variant ? withTags(variant, []) : null } });
    }),
    prisma.postGroup.update({
      where: { id: group.id },
      data: { caption, score: scorePostHeuristic({ caption, networks, mediaCount: group.media.length }).total },
    }),
  ]);
  return toGroupDTO(await prisma.postGroup.findUniqueOrThrow({ where: { id: group.id }, include: groupInclude }));
});
