import { z } from "zod";
import { prisma } from "@postline/db";
import { hasApiKey, remainingCredits } from "@postline/ai";
import { InsufficientCreditsError, type AiGenerateJob, type CampaignRequest } from "@postline/core";
import { badRequest, HttpError, route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { enqueueAiGenerate } from "@/lib/queue";
import { brandChannels } from "@/lib/posts/ai-helpers";
import { LENGTHS, TONES } from "@/lib/posts/ai-inputs";
import { IMAGE_STYLES } from "@/lib/ai-images";
import { toCampaignDTO } from "@/lib/campaigns";
import {
  FREQUENCIES,
  MAX_CAMPAIGN_DAYS,
  MAX_IMAGES_PER_POST,
  campaignPostCount,
  daysBetween,
  perDayOf,
  type Frequency,
} from "@/components/campaigns/campaignMath";

type Ctx = { params: Promise<{ brandId: string }> };

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD");

const createInput = z.object({
  prompt: z.string().trim().min(10, "Describe the campaign in a sentence or two").max(4000),
  channelIds: z.array(z.string()).min(1, "Pick at least one channel"),
  includeHashtags: z.boolean().default(true),
  imagesPerPost: z.number().int().min(0).max(MAX_IMAGES_PER_POST).default(0),
  imageStyle: z.enum(IMAGE_STYLES).optional(),
  tone: z.enum(TONES).optional(),
  length: z.enum(LENGTHS).optional(),
  goal: z.enum(["awareness", "leads", "launch", "offer", "education", "event"]),
  audience: z.string().trim().max(200).optional(),
  startDate: ymd,
  endDate: ymd,
  frequency: z.enum(FREQUENCIES.map((f) => f.value) as [Frequency, ...Frequency[]]),
});

function todayIn(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** GET → { items: CampaignDTO[] } newest first. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.viewDrafts");
  const campaigns = await prisma.campaign.findMany({
    where: { brandId: access.brand.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { posts: true } } },
  });
  const ids = campaigns.map((c) => c.id);
  const [scheduled, media] = ids.length
    ? await Promise.all([
        prisma.postGroup.groupBy({
          by: ["campaignId"],
          where: { campaignId: { in: ids }, status: { notIn: ["DRAFT", "GENERATING"] } },
          _count: { _all: true },
        }),
        prisma.postMedia.findMany({
          where: { group: { campaignId: { in: ids } }, position: 0 },
          select: { group: { select: { campaignId: true } }, media: { select: { url: true, mime: true } } },
          orderBy: { group: { scheduledAt: "asc" } },
          take: 400,
        }),
      ])
    : [[], []];
  const scheduledBy = new Map(scheduled.map((s) => [s.campaignId, s._count._all]));
  const thumbsBy = new Map<string, string[]>();
  for (const m of media) {
    const cid = m.group.campaignId;
    if (!cid || !m.media.mime.startsWith("image/")) continue;
    const list = thumbsBy.get(cid) ?? [];
    if (list.length < 4) list.push(m.media.url);
    thumbsBy.set(cid, list);
  }
  return {
    items: campaigns.map((c) => toCampaignDTO({ ...c, scheduledCount: scheduledBy.get(c.id) ?? 0, thumbs: thumbsBy.get(c.id) ?? [] })),
  };
});

/** POST → creates a GENERATING campaign and queues generation. Returns the CampaignDTO. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const input = await readBody(req, createInput);

  const days = daysBetween(input.startDate, input.endDate);
  if (days < 1) throw badRequest("The end date must be on or after the start date");
  if (days > MAX_CAMPAIGN_DAYS) throw badRequest(`Campaigns can run for up to ${MAX_CAMPAIGN_DAYS} days`);
  if (input.startDate < todayIn(access.brand.timezone)) throw badRequest("The campaign can't start in the past");
  const { count } = campaignPostCount(days, input.frequency);
  if (count < 1) throw badRequest("This schedule has no posts");

  const { channels, networks } = await brandChannels(access.brand.id, input.channelIds);

  // Fail fast when the pool can't cover it (captions are free in offline/template mode).
  const needed = (hasApiKey() ? count : 0) + count * input.imagesPerPost;
  if (needed > 0) {
    const { remaining } = await remainingCredits(access.brand.id);
    if (remaining < needed) throw new InsufficientCreditsError(needed, remaining);
  }

  const campaign = await prisma.campaign.create({
    data: {
      brandId: access.brand.id,
      prompt: input.prompt,
      goal: input.goal,
      audience: input.audience || null,
      startDate: new Date(`${input.startDate}T00:00:00Z`),
      duration: days,
      postsPerDay: perDayOf(input.frequency),
      count,
      status: "GENERATING",
      channelIds: channels.map((c) => c.id),
      plan: { progress: { stage: "writing", done: 0, total: count } },
    },
  });

  const request: CampaignRequest = {
    prompt: input.prompt,
    goal: input.goal,
    audience: input.audience || undefined,
    startDate: input.startDate,
    durationDays: days,
    count,
    networks,
    tone: input.tone,
    length: input.length,
    includeHashtags: input.includeHashtags,
  };
  // imagesPerPost / imageStyle travel as extra job fields (read defensively by the worker).
  const job = {
    kind: "campaign" as const,
    campaignId: campaign.id,
    brandId: access.brand.id,
    actorId: access.user.id,
    request,
    imagesPerPost: input.imagesPerPost,
    imageStyle: input.imageStyle,
  };
  try {
    await enqueueAiGenerate(job as AiGenerateJob);
  } catch (err) {
    console.error("[campaigns] enqueue failed", err);
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "ERROR", plan: { error: "Couldn't queue generation" } } });
    throw new HttpError(503, "Generation is temporarily unavailable. Please try again.");
  }
  return toCampaignDTO({ ...campaign, _count: { posts: 0 } });
});
