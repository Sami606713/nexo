// OWNED BY: campaigns/images agent. Server helpers for the campaigns API.
import "server-only";
import { prisma, type Campaign } from "@postline/db";
import type { CampaignGoal, Length, Tone } from "@postline/core";
import type { BrandAccess } from "@/lib/session";
import { notFound } from "@/lib/http";
import { channelSelect, groupInclude, toChannelDTO, toGroupDTO } from "@/lib/posts/dto";
import type { CampaignDTO, CampaignDetailDTO, CampaignProgress, CampaignStatus } from "@/components/campaigns/types";

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const ymd = (d: Date) => d.toISOString().slice(0, 10);

type CampaignWithCounts = Campaign & {
  _count?: { posts: number };
  scheduledCount?: number;
  thumbs?: string[];
};

export function toCampaignDTO(c: CampaignWithCounts): CampaignDTO {
  const plan = rec(c.plan);
  const progressRaw = rec(plan.progress);
  const progress: CampaignProgress | null =
    c.status === "GENERATING" && (progressRaw.stage === "writing" || progressRaw.stage === "images")
      ? { stage: progressRaw.stage, done: Number(progressRaw.done) || 0, total: Number(progressRaw.total) || c.count }
      : null;
  const req = rec(plan.request);
  const end = new Date(c.startDate.getTime() + (Math.max(1, c.duration) - 1) * 86_400_000);
  return {
    id: c.id,
    prompt: c.prompt,
    goal: c.goal as CampaignGoal,
    audience: c.audience,
    startDate: ymd(c.startDate),
    endDate: ymd(end),
    durationDays: c.duration,
    postsPerDay: c.postsPerDay,
    count: c.count,
    status: (["GENERATING", "READY", "ERROR"].includes(c.status) ? c.status : "ERROR") as CampaignStatus,
    channelIds: c.channelIds,
    createdAt: c.createdAt.toISOString(),
    progress,
    error: c.status === "ERROR" ? String(plan.error ?? "Generation failed") : null,
    imagesError: typeof plan.imagesError === "string" ? plan.imagesError : null,
    offline: plan.offline === true,
    settings: {
      tone: (typeof req.tone === "string" ? req.tone : null) as Tone | null,
      length: (typeof req.length === "string" ? req.length : null) as Length | null,
      includeHashtags: req.includeHashtags !== false,
      imagesPerPost: Number(plan.imagesPerPost) || 0,
    },
    postsCount: c._count?.posts ?? 0,
    scheduledCount: c.scheduledCount ?? 0,
    thumbs: c.thumbs ?? [],
  };
}

export async function loadCampaign(access: BrandAccess, campaignId: string): Promise<Campaign> {
  const c = await prisma.campaign.findFirst({ where: { id: campaignId, brandId: access.brand.id } });
  if (!c) throw notFound("Campaign not found");
  return c;
}

export async function campaignDetail(access: BrandAccess, c: Campaign): Promise<CampaignDetailDTO> {
  const [groups, channels] = await Promise.all([
    prisma.postGroup.findMany({
      where: { campaignId: c.id, brandId: access.brand.id },
      include: groupInclude,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.channel.findMany({ where: { brandId: access.brand.id, id: { in: c.channelIds } }, select: channelSelect }),
  ]);
  const posts = groups.map(toGroupDTO);
  return {
    ...toCampaignDTO({
      ...c,
      _count: { posts: posts.length },
      scheduledCount: posts.filter((p) => p.status !== "DRAFT" && p.status !== "GENERATING").length,
      thumbs: posts.flatMap((p) => p.media.map((m) => m.url)).slice(0, 4),
    }),
    posts,
    channels: channels.map(toChannelDTO),
  };
}

/** Pull the planned angle back out of a campaign post's notes ("Angle: …"). */
export function angleFromNotes(notes: string | null): string | null {
  const m = /^Angle:\s*(.+)$/m.exec(notes ?? "");
  return m?.[1]?.trim() || null;
}
