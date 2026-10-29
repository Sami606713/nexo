import { randomUUID } from "node:crypto";
import { Worker, type Job } from "bullmq";
import { storage } from "@postline/core/storage";
import type IORedis from "ioredis";
import { prisma, type Brand } from "@postline/db";
import { InsufficientCreditsError, QUEUES, type Network, type WorkflowRunJob } from "@postline/core";
import { decryptCredentials } from "@postline/core/crypto";
import { getInboxProvider, validateForNetwork } from "@postline/integrations";
import { images, withCredits } from "@postline/ai";
import type { Logger } from "../log";
import { enqueuePublishGroup, jobDefaults, queue } from "../queues";
import { json } from "../lib/db";
import { evaluateFilter, renderTemplate, type FilterOp, type TemplateContext } from "../lib/template";
import { runAgent } from "../lib/agentLlm";
import { fetchFeed, feedItemPayload } from "../lib/rss";
import { fetchWooProducts, type WooCredentials } from "../lib/woo";
import {
  delayMs,
  nextFreeSlot,
  sampleInput,
  type RunLogEntry,
  type WorkflowStep,
  type WorkflowTrigger,
} from "./workflowLogic";

/** Job payload: the core contract plus continuation fields used for delays (and samples for manual runs). */
export type WorkflowRunJobData = WorkflowRunJob & {
  /** Continue an existing run (after a delay step). */
  runId?: string;
  /** Step id to resume at. */
  resumeStepId?: string;
};

class StepError extends Error {}

interface StepResult {
  status: RunLogEntry["status"];
  output?: Record<string, unknown>;
  note?: string;
  offline?: boolean;
  /** Stop the chain here (filter) */
  stop?: "FILTERED";
  /** Pause the chain (delay): resume at the next step after `ms`. */
  pauseMs?: number;
}

type WorkflowRow = NonNullable<Awaited<ReturnType<typeof loadWorkflow>>>;

function loadWorkflow(id: string) {
  return prisma.workflow.findUnique({ where: { id }, include: { brand: true } });
}

/** Short, single-line error text (Prisma errors are multi-line with code frames). */
const errMessage = (err: unknown) => {
  const raw = err instanceof Error ? err.message : String(err);
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  return (lines.length > 1 ? lines[lines.length - 1]! : raw).slice(0, 500);
};
const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));

// ───────────────────────── sample inputs for manual runs ─────────────────────────

async function resolveManualInput(wf: WorkflowRow, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!input.__sample) return input;
  const trigger = wf.trigger as unknown as WorkflowTrigger;
  try {
    if (trigger.type === "rss" && str(trigger.config.url)) {
      const feed = await fetchFeed(str(trigger.config.url));
      const item = feed.items[0];
      if (item) return feedItemPayload(item, feed);
    }
    if (trigger.type === "woo_product" && str(trigger.config.storeId)) {
      const store = await prisma.wooStore.findFirst({ where: { id: str(trigger.config.storeId), brandId: wf.brandId } });
      if (store) {
        const products = await fetchWooProducts(store.url, decryptCredentials(store.credentialsEnc) as unknown as WooCredentials, 1);
        if (products[0]) return { ...products[0] };
      }
    }
  } catch {
    // fall through to the static sample
  }
  return sampleInput(trigger.type);
}

// ───────────────────────── steps ─────────────────────────

async function stepAiAgent(wf: WorkflowRow, cfg: Record<string, unknown>, ctx: TemplateContext): Promise<StepResult> {
  const agent = await prisma.aIAgent.findFirst({ where: { id: str(cfg.agentId), brandId: wf.brandId } });
  if (!agent) throw new StepError("The selected AI agent no longer exists");
  const input = renderTemplate(str(cfg.input) || "{{trigger.title}}\n\n{{trigger.summary}}", ctx);
  const res = await runAgent(agent, wf.brand, input);
  const output: Record<string, unknown> = { text: res.text, model: res.model };
  let note: string | undefined;
  if (agent.imageGen || cfg.generateImage) {
    try {
      const prompt = renderTemplate(str(cfg.imagePrompt), ctx) || res.text.slice(0, 400);
      const [img] = await images.generate({ prompt, width: 1080, height: 1080, count: 1, colors: (wf.brand.colors as string[]) ?? [] });
      if (img) {
        const ext = img.mime.includes("svg") ? "svg" : img.mime.includes("jpeg") ? "jpg" : "png";
        const key = `${wf.brandId}/wf-${randomUUID()}.${ext}`;
        const { url } = await storage().put(key, img.bytes, img.mime);
        const asset = await prisma.mediaAsset.create({
          data: { brandId: wf.brandId, url, key, mime: img.mime, width: img.width, height: img.height, sizeBytes: img.bytes.byteLength, source: "ai" },
        });
        output.imageUrl = url;
        output.mediaId = asset.id;
        output.imageProvider = img.provider;
      }
    } catch (err) {
      note = `Image skipped: ${errMessage(err)}`;
    }
  }
  return { status: "success", output, offline: res.offline, note: res.offline ? ["Offline mode (no AI key) — deterministic caption", note].filter(Boolean).join(". ") : note };
}

async function mediaForUrls(brandId: string, urls: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const url of urls.slice(0, 10)) {
    const existing = await prisma.mediaAsset.findFirst({ where: { brandId, url }, select: { id: true } });
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const ext = (/\.([a-z0-9]{3,4})(?:\?|$)/i.exec(url)?.[1] ?? "jpg").toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : "image/jpeg";
    const a = await prisma.mediaAsset.create({ data: { brandId, url, mime, sizeBytes: 0, source: "upload" } });
    ids.push(a.id);
  }
  return ids;
}

async function stepCreatePost(wf: WorkflowRow, cfg: Record<string, unknown>, ctx: TemplateContext): Promise<StepResult> {
  const caption = renderTemplate(str(cfg.caption), ctx).trim();
  const wantedChannels = Array.isArray(cfg.channelIds) ? (cfg.channelIds as unknown[]).map(str).filter(Boolean) : [];
  const channels = wantedChannels.length
    ? await prisma.channel.findMany({ where: { brandId: wf.brandId, id: { in: wantedChannels } }, select: { id: true, network: true, name: true } })
    : [];
  const behavior = str(cfg.behavior) || "add_to_drafts";

  // Media: explicit URL template lines, plus the image produced by an earlier AI step.
  const urls = renderTemplate(str(cfg.mediaUrls), ctx)
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//.test(u));
  const mediaIds: string[] = [];
  if (cfg.useStepImage !== false) {
    for (const out of Object.values(ctx.steps)) if (out?.mediaId && typeof out.mediaId === "string") mediaIds.push(out.mediaId);
  }
  mediaIds.push(...(await mediaForUrls(wf.brandId, urls)));
  const uniqueMedia = [...new Set(mediaIds)];
  const media = uniqueMedia.length ? await prisma.mediaAsset.findMany({ where: { id: { in: uniqueMedia }, brandId: wf.brandId } }) : [];

  if (!caption && media.length === 0) throw new StepError("The caption rendered empty — nothing to post");

  let status: "DRAFT" | "SCHEDULED" = "DRAFT";
  let scheduledAt: Date | null = null;
  let note: string | undefined;
  if (behavior !== "add_to_drafts") {
    if (channels.length === 0) note = "No channels selected — saved as a draft";
    else {
      const items = media.map((m) => ({ url: m.url, mime: m.mime, width: m.width ?? undefined, height: m.height ?? undefined, sizeBytes: m.sizeBytes }));
      const blocking = channels
        .map((c) => ({ c, issue: validateForNetwork(c.network as Network, { caption, media: items, options: {} }).find((i) => i.level === "error") }))
        .find((x) => x.issue);
      if (blocking) note = `${blocking.c.name}: ${blocking.issue!.message} — saved as a draft instead`;
      else {
        status = "SCHEDULED";
        if (behavior === "publish_now") scheduledAt = new Date();
        else {
          const [slots, taken] = await Promise.all([
            prisma.postingSlot.findMany({ where: { channelId: { in: channels.map((c) => c.id) } }, select: { weekday: true, minute: true } }),
            prisma.postGroup.findMany({
              where: { brandId: wf.brandId, status: { in: ["SCHEDULED", "PENDING_APPROVAL"] }, scheduledAt: { gte: new Date() } },
              select: { scheduledAt: true },
            }),
          ]);
          scheduledAt = nextFreeSlot(new Date(), wf.brand.timezone, slots, new Set(taken.map((t) => t.scheduledAt!.getTime())));
        }
      }
    }
  }

  const mediaOrder = uniqueMedia.filter((id) => media.some((m) => m.id === id));
  const group = await prisma.postGroup.create({
    data: {
      brandId: wf.brandId,
      authorId: wf.brand.ownerId,
      caption,
      status,
      scheduledAt,
      notes: `Created by workflow “${wf.name}”${note ? `. ${note}` : ""}`,
      posts: { create: channels.map((c) => ({ channelId: c.id, status })) },
      media: { create: mediaOrder.map((mediaId, position) => ({ mediaId, position })) },
    },
    select: { id: true },
  });
  if (status === "SCHEDULED" && scheduledAt) await enqueuePublishGroup(group.id, scheduledAt);
  return {
    status: "success",
    output: { postGroupId: group.id, status, scheduledAt: scheduledAt?.toISOString() ?? null, caption, channels: channels.length, text: caption },
    note,
  };
}

/** Reply to the inbox conversation that triggered the run (comment reply or DM). */
async function stepInboxReply(wf: WorkflowRow, kind: "reply_comment" | "send_dm", cfg: Record<string, unknown>, ctx: TemplateContext): Promise<StepResult> {
  const text = renderTemplate(str(cfg.text), ctx).trim();
  if (!text) throw new StepError("The message rendered empty");
  const conversationId = str(ctx.trigger.conversationId);
  if (!conversationId) return { status: "skipped", output: { text }, note: "skipped: no inbox conversation in this run (test input)" };
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, brandId: wf.brandId },
    include: { channel: true, messages: { where: { direction: "IN" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!conv) return { status: "skipped", output: { text }, note: "skipped: conversation not found" };
  if (kind === "send_dm" && conv.kind !== "DM") {
    return { status: "skipped", output: { text }, note: "skipped: private replies to comments aren't supported — use “Reply to comment”" };
  }
  const provider = getInboxProvider(conv.channel.network as Network, conv.channel);
  if (!provider || !conv.channel.inboxEnabled) return { status: "skipped", output: { text }, note: "skipped: inbox not connected for this channel" };
  const target = {
    kind: conv.kind as "DM" | "COMMENT" | "MENTION",
    externalId: conv.messages[0]?.externalId ?? conv.externalId,
    conversationExternalId: conv.externalId,
    postExternalId: conv.postExternalId,
    authorHandle: conv.participantHandle,
  };
  const res = await provider.reply(
    decryptCredentials(conv.channel.credentialsEnc),
    { ...((conv.channel.extras as Record<string, unknown>) ?? {}), externalId: conv.channel.externalId },
    target,
    text,
  );
  await prisma.$transaction([
    prisma.message.create({ data: { conversationId: conv.id, direction: "OUT", authorName: wf.brand.name, text, externalId: res.externalId } }),
    prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 140) } }),
  ]);
  return { status: "success", output: { text, externalId: res.externalId } };
}

async function runStep(wf: WorkflowRow, step: WorkflowStep, ctx: TemplateContext): Promise<StepResult> {
  const cfg = step.config ?? {};
  switch (step.type) {
    case "ai_agent":
      return stepAiAgent(wf, cfg, ctx);
    case "create_post":
      return stepCreatePost(wf, cfg, ctx);
    case "reply_comment":
    case "send_dm":
      return stepInboxReply(wf, step.type, cfg, ctx);
    case "filter": {
      const subject = renderTemplate(str(cfg.subject) || "{{trigger.text}}", ctx);
      const op = (str(cfg.op) || "contains") as FilterOp;
      const pass = evaluateFilter(subject, op, str(cfg.value));
      return pass
        ? { status: "success", output: { passed: true, text: subject } }
        : { status: "filtered", output: { passed: false, text: subject }, stop: "FILTERED", note: `Stopped: text ${op === "contains" ? "doesn't contain" : "contains"} “${str(cfg.value)}”` };
    }
    case "delay": {
      const ms = delayMs(cfg);
      return { status: "waiting", output: { resumeAt: new Date(Date.now() + ms).toISOString() }, pauseMs: ms };
    }
    default:
      throw new StepError(`Unknown step type ${(step as { type: string }).type}`);
  }
}

// ───────────────────────── run orchestration ─────────────────────────

function contextFrom(input: Record<string, unknown>, log: RunLogEntry[], brand: Brand): TemplateContext {
  const steps: TemplateContext["steps"] = {};
  for (const e of log) if (e.stepId !== "trigger" && e.output) steps[e.stepId] = e.output;
  return { trigger: input, steps, brand: { name: brand.name, website: brand.website ?? "" } };
}

/** Execute steps starting at `startIndex`. Mutates `log`. Returns final status (or "WAITING"). */
async function executeChain(
  wf: WorkflowRow,
  runId: string,
  input: Record<string, unknown>,
  log: RunLogEntry[],
  startIndex: number,
  logger: Logger,
): Promise<{ status: "SUCCESS" | "FILTERED" | "ERROR" | "WAITING"; error?: string; resume?: { stepId: string; ms: number } }> {
  const steps = (wf.steps as unknown as WorkflowStep[]) ?? [];
  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i]!;
    const entry: RunLogEntry = { stepId: step.id, type: step.type, status: "success", startedAt: new Date().toISOString() };
    log.push(entry);
    try {
      const res = await runStep(wf, step, contextFrom(input, log, wf.brand));
      Object.assign(entry, { status: res.status, output: res.output ?? null, note: res.note ?? null, offline: res.offline || undefined });
      entry.finishedAt = res.pauseMs ? null : new Date().toISOString();
      await prisma.workflowRun.update({ where: { id: runId }, data: { log: json(log) } });
      if (res.stop) return { status: res.stop };
      if (res.pauseMs) {
        const next = steps[i + 1];
        if (!next) {
          entry.status = "success";
          entry.finishedAt = new Date().toISOString();
          continue;
        }
        return { status: "WAITING", resume: { stepId: next.id, ms: res.pauseMs } };
      }
    } catch (err) {
      const message = err instanceof InsufficientCreditsError ? "Out of credits" : errMessage(err);
      Object.assign(entry, { status: "error", error: message, finishedAt: new Date().toISOString() });
      logger.warn({ err, workflowId: wf.id, runId, stepId: step.id }, "workflow step failed");
      return { status: "ERROR", error: `Step ${i + 1} (${step.type}): ${message}` };
    }
  }
  return { status: "SUCCESS" };
}

async function finish(runId: string, log: RunLogEntry[], status: "SUCCESS" | "FILTERED" | "ERROR", error?: string) {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status, log: json(log), error: error ?? null, finishedAt: new Date() },
  });
}

async function scheduleResume(data: WorkflowRunJobData, runId: string, stepId: string, ms: number) {
  const payload: WorkflowRunJobData = { workflowId: data.workflowId, input: data.input, manual: data.manual, runId, resumeStepId: stepId };
  await queue(QUEUES.workflowRun).add("workflow-run-resume", payload, { ...jobDefaults, delay: ms, jobId: `wfresume-${runId}-${stepId}` });
}

export async function processWorkflowRun(job: Job<WorkflowRunJobData>, logger: Logger) {
  const data = job.data;
  const wf = await loadWorkflow(data.workflowId);
  if (!wf) return { skipped: "missing" };

  // ── continuation after a delay
  if (data.runId && data.resumeStepId) {
    const run = await prisma.workflowRun.findUnique({ where: { id: data.runId } });
    if (!run || run.status !== "RUNNING") return { skipped: "run_not_running" };
    const log = ((run.log as unknown as RunLogEntry[]) ?? []).map((e) =>
      e.status === "waiting" ? { ...e, status: "success" as const, finishedAt: new Date().toISOString() } : e,
    );
    const steps = (wf.steps as unknown as WorkflowStep[]) ?? [];
    const idx = steps.findIndex((s) => s.id === data.resumeStepId);
    if (idx < 0) {
      await finish(run.id, log, "ERROR", "The workflow changed while this run was waiting");
      return { ok: false };
    }
    if (!wf.active && !data.manual) {
      await finish(run.id, log, "ERROR", "Workflow was turned off while this run was waiting");
      return { ok: false };
    }
    const input = (run.input as Record<string, unknown>) ?? {};
    const res = await executeChain(wf, run.id, input, log, idx, logger);
    if (res.status === "WAITING") {
      await scheduleResume(data, run.id, res.resume!.stepId, res.resume!.ms);
      return { waiting: true };
    }
    await finish(run.id, log, res.status, res.error);
    return { status: res.status };
  }

  if (!wf.active && !data.manual) return { skipped: "inactive" };

  const input = data.manual ? await resolveManualInput(wf, data.input ?? {}) : data.input ?? {};
  const triggerType = (wf.trigger as unknown as WorkflowTrigger)?.type ?? "unknown";
  const now = new Date().toISOString();
  const log: RunLogEntry[] = [
    { stepId: "trigger", type: triggerType, status: "success", output: input, note: data.manual ? "Manual run" : null, startedAt: now, finishedAt: now },
  ];
  const run = await prisma.workflowRun.create({ data: { workflowId: wf.id, status: "RUNNING", input: json(input), log: json(log) } });
  await prisma.workflow.update({ where: { id: wf.id }, data: { lastRunAt: new Date() } });

  let outcome: Awaited<ReturnType<typeof executeChain>>;
  try {
    // 1 credit covers the whole chain; refunded if the run errors in this segment.
    outcome = await withCredits(
      { brandId: wf.brandId, actorId: wf.brand.ownerId, reason: "workflow_run", amount: 1, refType: "WorkflowRun", refId: run.id },
      async () => {
        const res = await executeChain(wf, run.id, input, log, 0, logger);
        if (res.status === "ERROR") throw Object.assign(new StepError(res.error ?? "Run failed"), { outcome: res });
        return res;
      },
    );
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      log.push({ stepId: "credits", type: "credits", status: "error", error: "Out of credits — the run was not started", startedAt: now, finishedAt: now });
      outcome = { status: "ERROR", error: "Out of credits" };
    } else if (err instanceof StepError && (err as StepError & { outcome?: typeof outcome }).outcome) {
      outcome = (err as StepError & { outcome: typeof outcome }).outcome;
    } else {
      logger.error({ err, workflowId: wf.id, runId: run.id }, "workflow run crashed");
      outcome = { status: "ERROR", error: errMessage(err) };
    }
  }

  if (outcome.status === "WAITING") {
    await scheduleResume(data, run.id, outcome.resume!.stepId, outcome.resume!.ms);
    logger.info({ workflowId: wf.id, runId: run.id }, "workflow run waiting (delay)");
    return { waiting: true, runId: run.id };
  }
  await finish(run.id, log, outcome.status, outcome.error);
  logger.info({ workflowId: wf.id, runId: run.id, status: outcome.status }, "workflow run finished");
  return { status: outcome.status, runId: run.id };
}

export function startWorkflowRunWorker(connection: IORedis, logger: Logger) {
  // Never throw from the processor: BullMQ retries would repeat side effects (posts, replies).
  const worker = new Worker<WorkflowRunJobData>(
    QUEUES.workflowRun,
    async (job) => {
      try {
        return await processWorkflowRun(job, logger);
      } catch (err) {
        logger.error({ err, jobId: job.id }, "workflow-run failed");
        return { ok: false, error: errMessage(err) };
      }
    },
    { connection, concurrency: 4 },
  );
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "workflow-run job failed"));
  return worker;
}
