import { Worker } from "bullmq";
import type IORedis from "ioredis";
import { prisma } from "@postline/db";
import { QUEUES, type WorkflowRunJob } from "@postline/core";
import { decryptCredentials } from "@postline/core/crypto";
import type { Logger } from "../log";
import { jobDefaults, queue } from "../queues";
import { json } from "../lib/db";
import { dedupeItems, feedItemPayload, fetchFeed, SEEN_CAP } from "../lib/rss";
import { fetchWooProducts, type WooCredentials } from "../lib/woo";
import { scheduleDecision, schedulePayload, type ScheduleConfig, type WorkflowState, type WorkflowTrigger } from "./workflowLogic";
import { startWorkflowRunWorker } from "./workflowRun";

export const TRIGGER_TICK = { name: "workflow-trigger-tick", everyMs: 60_000 } as const;
export const RSS_MIN_INTERVAL_MIN = 60;
export const RSS_MAX_INTERVAL_MIN = 120;
export const WOO_INTERVAL_MS = 5 * 60_000;
/** Max runs one poll may fire for a single workflow (protects credits when a feed suddenly floods). */
const MAX_FIRE_PER_POLL = 10;

export function rssIntervalMs(cfg: Record<string, unknown>): number {
  const n = Math.floor(Number(cfg.intervalMinutes) || RSS_MIN_INTERVAL_MIN);
  return Math.min(RSS_MAX_INTERVAL_MIN, Math.max(RSS_MIN_INTERVAL_MIN, n)) * 60_000;
}

async function fire(workflowId: string, input: Record<string, unknown>) {
  const data: WorkflowRunJob = { workflowId, input };
  await queue(QUEUES.workflowRun).add("workflow-run", data, { ...jobDefaults });
}

const due = (last: string | undefined, everyMs: number, now: Date) => !last || now.getTime() - new Date(last).getTime() >= everyMs - 30_000;
const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Row = { id: string; brandId: string; trigger: unknown; state: unknown; brand: { timezone: string } };

async function saveState(id: string, state: WorkflowState) {
  await prisma.workflow.update({ where: { id }, data: { state: json(state) } });
}

export async function evaluateSchedule(wf: Row, now: Date): Promise<boolean> {
  const t = wf.trigger as WorkflowTrigger;
  const state = (wf.state ?? {}) as WorkflowState;
  const last = state.schedule?.lastFiredAt ? new Date(state.schedule.lastFiredAt) : null;
  const decision = scheduleDecision(t.config as ScheduleConfig, last, now, wf.brand.timezone);
  if (decision === "wait") return false;
  await saveState(wf.id, { ...state, schedule: { lastFiredAt: now.toISOString() } });
  if (decision === "fire") await fire(wf.id, schedulePayload(now, wf.brand.timezone));
  return decision === "fire";
}

export async function pollRss(wf: Row, now: Date, log: Logger): Promise<number> {
  const t = wf.trigger as WorkflowTrigger;
  const url = String(t.config.url ?? "").trim();
  if (!url) return 0;
  const state = (wf.state ?? {}) as WorkflowState;
  let rss = state.rss ?? {};
  if (rss.url !== url) rss = { url, initialized: false, seen: [] };
  if (rss.initialized && !due(rss.lastPolledAt, rssIntervalMs(t.config), now)) return 0;
  try {
    const feed = await fetchFeed(url);
    const { fresh, seen } = dedupeItems(feed.items, rss.seen ?? [], SEEN_CAP);
    const firstRun = !rss.initialized;
    await saveState(wf.id, { ...state, rss: { url, initialized: true, seen, lastPolledAt: now.toISOString(), lastError: null } });
    if (firstRun) {
      log.info({ workflowId: wf.id, items: feed.items.length }, "rss trigger armed (existing items recorded)");
      return 0;
    }
    const toFire = fresh.slice(-MAX_FIRE_PER_POLL);
    for (const item of toFire) await fire(wf.id, feedItemPayload(item, feed));
    if (toFire.length) log.info({ workflowId: wf.id, fired: toFire.length }, "rss trigger fired");
    return toFire.length;
  } catch (err) {
    await saveState(wf.id, { ...state, rss: { ...rss, url, lastPolledAt: now.toISOString(), lastError: errMessage(err) } });
    log.warn({ err, workflowId: wf.id }, "rss poll failed");
    return 0;
  }
}

export async function pollWoo(wf: Row, now: Date, log: Logger): Promise<number> {
  const t = wf.trigger as WorkflowTrigger;
  const storeId = String(t.config.storeId ?? "");
  if (!storeId) return 0;
  const state = (wf.state ?? {}) as WorkflowState;
  let woo = state.woo ?? {};
  if (woo.storeId !== storeId) woo = { storeId, initialized: false, seen: [] };
  if (woo.initialized && !due(woo.lastPolledAt, WOO_INTERVAL_MS, now)) return 0;
  try {
    const store = await prisma.wooStore.findFirst({ where: { id: storeId, brandId: wf.brandId } });
    if (!store) throw new Error("WooCommerce store was disconnected");
    const products = await fetchWooProducts(store.url, decryptCredentials(store.credentialsEnc) as unknown as WooCredentials, 20);
    const { fresh, seen } = dedupeItems(products, woo.seen ?? [], SEEN_CAP);
    const firstRun = !woo.initialized;
    await saveState(wf.id, { ...state, woo: { storeId, initialized: true, seen, lastPolledAt: now.toISOString(), lastError: null } });
    if (firstRun) return 0;
    const toFire = fresh.slice(-MAX_FIRE_PER_POLL);
    for (const p of toFire) await fire(wf.id, { ...p });
    if (toFire.length) log.info({ workflowId: wf.id, fired: toFire.length }, "woo trigger fired");
    return toFire.length;
  } catch (err) {
    await saveState(wf.id, { ...state, woo: { ...woo, storeId, lastPolledAt: now.toISOString(), lastError: errMessage(err) } });
    log.warn({ err, workflowId: wf.id }, "woo poll failed");
    return 0;
  }
}

export async function tick(log: Logger, now = new Date()) {
  const rows = await prisma.workflow.findMany({
    where: { active: true },
    select: { id: true, brandId: true, trigger: true, state: true, brand: { select: { timezone: true } } },
  });
  let fired = 0;
  for (const wf of rows) {
    const type = (wf.trigger as WorkflowTrigger | null)?.type;
    try {
      if (type === "schedule") fired += (await evaluateSchedule(wf, now)) ? 1 : 0;
      else if (type === "rss") fired += await pollRss(wf, now, log);
      else if (type === "woo_product") fired += await pollWoo(wf, now, log);
    } catch (err) {
      log.warn({ err, workflowId: wf.id }, "trigger evaluation failed");
    }
  }
  return { evaluated: rows.length, fired };
}

export async function scheduleWorkflowTriggers() {
  await queue(QUEUES.workflowTriggers).upsertJobScheduler(
    TRIGGER_TICK.name,
    { every: TRIGGER_TICK.everyMs },
    { name: TRIGGER_TICK.name, data: {}, opts: { removeOnComplete: 100, removeOnFail: 500 } },
  );
}

/**
 * Start the workflow-run and workflow-triggers workers and register the 1-minute trigger tick.
 * Each worker gets its own duplicate of `connection` (BullMQ workers use blocking commands).
 */
export function startWorkflowWorkers(connection: IORedis, log: Logger): Worker[] {
  const runWorker = startWorkflowRunWorker(connection.duplicate(), log);
  const triggerWorker = new Worker(QUEUES.workflowTriggers, () => tick(log), { connection: connection.duplicate(), concurrency: 1 });
  triggerWorker.on("failed", (job, err) => log.error({ jobId: job?.id, err }, "workflow trigger tick failed"));
  triggerWorker.on("completed", (_job, result) => {
    if ((result as { fired?: number })?.fired) log.debug({ result }, "workflow trigger tick");
  });
  scheduleWorkflowTriggers().catch((err) => log.error({ err }, "failed to register workflow trigger tick"));
  return [runWorker, triggerWorker];
}
