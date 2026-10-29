import { randomUUID } from "node:crypto";
import { Worker, type Job } from "bullmq";
import { storage } from "@postline/core/storage";
import { prisma } from "@postline/db";
import { CREDIT_COST, InsufficientCreditsError, QUEUES, type AiGenerateJob, type CampaignPlanItem, type ImageGenRequest, type Network } from "@postline/core";
import { ai, brandContext, hasApiKey, images, offlineCampaign, withCredits } from "@postline/ai";
import { log } from "../log";
import { newRedis } from "../queues";
import { appendHashtags } from "../lib/compose";
import { campaignItemScheduledAt } from "../lib/schedule";
import { json } from "../lib/db";

type PostJob = Extract<AiGenerateJob, { kind: "post" }>;
type CampaignJob = Extract<AiGenerateJob, { kind: "campaign" }>;

function errMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** Retry (rethrow) only for errors that might go away and while attempts remain. */
function shouldRetry(job: Job, err: unknown) {
  if (err instanceof InsufficientCreditsError) return false;
  return job.attemptsMade + 1 < (job.opts.attempts ?? 1);
}

async function loadBrand(brandId: string) {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) throw new Error(`Brand ${brandId} not found`);
  return brand;
}

export async function generatePost(job: Job<AiGenerateJob>, data: PostJob) {
  const { groupId, brandId, actorId, request } = data;
  const group = await prisma.postGroup.findUnique({
    where: { id: groupId },
    select: { id: true, status: true, brandId: true, posts: { select: { id: true, channel: { select: { network: true } } } } },
  });
  if (!group || group.brandId !== brandId) return { skipped: "missing" };
  if (group.status !== "GENERATING") return { skipped: `status_${group.status}` };

  try {
    const brand = await loadBrand(brandId);
    const generated = await withCredits(
      { brandId, actorId, reason: "caption", amount: 1, refType: "PostGroup", refId: groupId },
      () => ai.generatePost(brandContext(brand), request),
    );
    const caption = appendHashtags(generated.caption, generated.hashtags);
    const perNetwork = generated.perNetwork ?? {};

    await prisma.$transaction(async (tx) => {
      const res = await tx.postGroup.updateMany({
        where: { id: groupId, status: "GENERATING" },
        data: { caption, status: "DRAFT" },
      });
      if (res.count === 0) return; // user changed it meanwhile; don't clobber
      for (const p of group.posts) {
        const variant = perNetwork[p.channel.network as Network];
        if (variant) await tx.post.update({ where: { id: p.id }, data: { captionOverride: variant } });
      }
    });
    log.info({ groupId }, "ai post generated");
    return { ok: true };
  } catch (err) {
    if (shouldRetry(job, err)) throw err;
    log.warn({ err, groupId }, "ai post generation failed");
    await prisma.postGroup.updateMany({
      where: { id: groupId, status: "GENERATING" },
      data: { status: "DRAFT", notes: `AI generation failed: ${errMessage(err)}` },
    });
    return { ok: false, error: errMessage(err) };
  }
}

// ───────────────────────────── campaign images (extra job fields, read defensively)

const IMAGE_STYLES = ["photo", "illustration", "3d", "minimal", "brand"] as const;
type ImageStyle = (typeof IMAGE_STYLES)[number];

/** `imagesPerPost` / `imageStyle` ride along in the job (top level or inside request) — not part of CampaignRequest. */
export function campaignImageOptions(data: unknown): { imagesPerPost: number; imageStyle?: ImageStyle } {
  const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const top = rec(data);
  const req = rec(top.request);
  const n = Number(top.imagesPerPost ?? req.imagesPerPost ?? 0);
  const style = top.imageStyle ?? req.imageStyle;
  return {
    imagesPerPost: Number.isFinite(n) ? Math.max(0, Math.min(3, Math.floor(n))) : 0,
    imageStyle: IMAGE_STYLES.includes(style as ImageStyle) ? (style as ImageStyle) : undefined,
  };
}

function imageSizeFor(networks: Network[]): { width: number; height: number } {
  if (networks.includes("PINTEREST")) return { width: 1000, height: 1500 };
  if (networks.some((n) => n === "INSTAGRAM" || n === "TIKTOK" || n === "THREADS")) return { width: 1080, height: 1350 };
  return { width: 1080, height: 1080 };
}

function hexColors(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((c): c is string => typeof c === "string" && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c)).slice(0, 5) : [];
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };
async function storeImage(brandId: string, bytes: Uint8Array, mime: string) {
  const key = `${brandId}/ai-${randomUUID().replace(/-/g, "")}.${EXT[mime] ?? "png"}`;
  return storage().put(key, bytes, mime);
}

async function setProgress(campaignId: string, progress: { stage: "writing" | "images"; done: number; total: number }) {
  await prisma.campaign.updateMany({ where: { id: campaignId, status: "GENERATING" }, data: { plan: json({ progress }) } }).catch(() => undefined);
}

/** Generate + attach images for each campaign post. Never throws: image failures must not fail the campaign. */
async function generateCampaignImages(
  data: CampaignJob,
  groups: { id: string; angle: string | null }[],
  opts: { imagesPerPost: number; imageStyle?: ImageStyle },
  brand: { colors: unknown },
): Promise<{ attached: number; error?: string }> {
  const { brandId, actorId, campaignId, request } = data;
  const size = imageSizeFor(request.networks);
  const colors = hexColors(brand.colors);
  const style: ImageStyle | undefined = opts.imageStyle ?? (colors.length ? "brand" : undefined);
  let attached = 0;
  let done = 0;
  for (const g of groups) {
    const req: ImageGenRequest = {
      prompt: g.angle ? `${request.prompt}. ${g.angle}` : request.prompt,
      ...size,
      count: opts.imagesPerPost,
      style,
      colors: style === "brand" && colors.length ? colors : undefined,
    };
    try {
      const rows = await withCredits(
        { brandId, actorId, reason: "image", amount: opts.imagesPerPost * CREDIT_COST.image, refType: "PostGroup", refId: g.id },
        async () => {
          const out = await images.generate(req);
          const created = [];
          for (const img of out.slice(0, opts.imagesPerPost)) {
            const stored = await storeImage(brandId, img.bytes, img.mime);
            created.push(
              await prisma.mediaAsset.create({
                data: { brandId, url: stored.url, key: stored.key, mime: img.mime, width: img.width, height: img.height, sizeBytes: img.bytes.byteLength, source: "ai", alt: req.prompt.slice(0, 1000) },
                select: { id: true },
              }),
            );
          }
          return created;
        },
      );
      await prisma.postMedia.createMany({ data: rows.map((r, position) => ({ groupId: g.id, mediaId: r.id, position })), skipDuplicates: true });
      attached += rows.length;
    } catch (err) {
      log.warn({ err, campaignId, groupId: g.id }, "campaign image generation failed");
      if (err instanceof InsufficientCreditsError) return { attached, error: "Not enough credits for all images" };
    }
    done++;
    await setProgress(campaignId, { stage: "images", done, total: groups.length });
  }
  return { attached };
}

export async function generateCampaign(job: Job<AiGenerateJob>, data: CampaignJob) {
  const { campaignId, brandId, actorId, request } = data;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.brandId !== brandId) return { skipped: "missing" };
  if (campaign.status === "READY") return { skipped: "already_ready" };
  const imageOpts = campaignImageOptions(data);

  try {
    const brand = await loadBrand(brandId);
    const channels = await prisma.channel.findMany({
      where: { brandId, id: { in: campaign.channelIds } },
      select: { id: true },
    });
    const channelIds = channels.map((c) => c.id);

    // A retry after the posts were written must not duplicate them.
    let groups = await prisma.postGroup.findMany({ where: { campaignId }, select: { id: true, notes: true }, orderBy: { scheduledAt: "asc" } });
    let items: CampaignPlanItem[] = [];
    if (groups.length === 0) {
      await setProgress(campaignId, { stage: "writing", done: 0, total: request.count });
      // No ANTHROPIC_API_KEY → deterministic template copy so the product stays demo-able (no credits charged).
      const plan: CampaignPlanItem[] = hasApiKey()
        ? await withCredits(
            { brandId, actorId, reason: "campaign", amount: request.count, refType: "Campaign", refId: campaignId },
            () => ai.planCampaign(brandContext(brand), request),
          )
        : offlineCampaign(brandContext(brand), request);
      items = plan.slice(0, request.count);

      groups = await prisma.$transaction(async (tx) => {
        const created: { id: string; notes: string | null }[] = [];
        for (const item of items) {
          created.push(
            await tx.postGroup.create({
              data: {
                brandId,
                authorId: actorId,
                campaignId,
                status: "DRAFT", // campaigns need review; nothing is scheduled automatically
                caption: appendHashtags(item.caption, item.hashtags),
                scheduledAt: campaignItemScheduledAt(request.startDate, item, brand.timezone, request.durationDays),
                notes: item.angle ? `Angle: ${item.angle}` : null,
                posts: { create: channelIds.map((channelId) => ({ channelId, status: "DRAFT" as const })) },
              },
              select: { id: true, notes: true },
            }),
          );
        }
        await tx.campaign.update({
          where: { id: campaignId },
          data: { plan: json({ progress: { stage: imageOpts.imagesPerPost > 0 ? "images" : "writing", done: 0, total: items.length } }) },
        });
        return created;
      });
    }

    let imagesResult: { attached: number; error?: string } = { attached: 0 };
    if (imageOpts.imagesPerPost > 0) {
      const withoutMedia = await prisma.postGroup.findMany({
        where: { id: { in: groups.map((g) => g.id) }, media: { none: {} } },
        select: { id: true, notes: true },
        orderBy: { scheduledAt: "asc" },
      });
      imagesResult = await generateCampaignImages(
        data,
        withoutMedia.map((g) => ({ id: g.id, angle: g.notes?.replace(/^Angle:\s*/, "") ?? null })),
        imageOpts,
        brand,
      );
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "READY",
        plan: json({
          items,
          request: { tone: request.tone ?? null, length: request.length ?? null, includeHashtags: request.includeHashtags ?? true, networks: request.networks },
          offline: !hasApiKey(),
          imagesPerPost: imageOpts.imagesPerPost,
          imageStyle: imageOpts.imageStyle ?? null,
          images: imagesResult.attached,
          ...(imagesResult.error ? { imagesError: imagesResult.error } : {}),
        }),
      },
    });
    log.info({ campaignId, posts: groups.length, images: imagesResult.attached }, "campaign generated");
    return { ok: true, posts: groups.length, images: imagesResult.attached };
  } catch (err) {
    if (shouldRetry(job, err)) throw err;
    log.warn({ err, campaignId }, "campaign generation failed");
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "ERROR", plan: json({ error: errMessage(err) }) },
    });
    return { ok: false, error: errMessage(err) };
  }
}

export async function processAiGenerate(job: Job<AiGenerateJob>) {
  const data = job.data;
  switch (data.kind) {
    case "post":
      return generatePost(job, data);
    case "campaign":
      return generateCampaign(job, data);
    default:
      log.warn({ jobId: job.id, data }, "ai-generate: unknown kind");
      return { skipped: "unknown_kind" };
  }
}

export function startAiGenerateWorker() {
  const worker = new Worker<AiGenerateJob>(QUEUES.aiGenerate, processAiGenerate, { connection: newRedis(), concurrency: 4 });
  worker.on("failed", (job, err) => log.error({ jobId: job?.id, err }, "ai-generate failed"));
  return worker;
}
