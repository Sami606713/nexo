import { Worker, type Job } from "bullmq";
import { prisma } from "@postline/db";
import { QUEUES, jobIds, type Network } from "@postline/core";
import { decryptCredentials, encryptCredentials } from "@postline/core/crypto";
import { getAdapter } from "@postline/integrations";
import { refillCreditsIfDue } from "@postline/ai";
import { log } from "../log";
import { enqueuePublishGroup, hasLiveJob, newRedis, queue, redis } from "../queues";
import { channelLockKey, tryLock } from "../lib/lock";
import { isAdapterError } from "../lib/failure";
import { json, markNeedsReconnect, rollupGroup } from "../lib/db";
import { STUCK_PUBLISHING_MS, SWEEP_GRACE_MS } from "../lib/schedule";

export const MAINTENANCE_JOBS = {
  refreshCredentials: { name: "refresh-credentials", everyMs: 15 * 60_000 },
  refillCredits: { name: "refill-credits", everyMs: 60 * 60_000 },
  sweep: { name: "sweep", everyMs: 5 * 60_000 },
} as const;

const REFRESH_AHEAD_MS = 24 * 3600_000;
const BATCH = 200;

/** Refresh credentials expiring within 24h for channels whose adapter supports it. */
export async function refreshExpiringCredentials(now = new Date()): Promise<{ refreshed: number; failed: number }> {
  const channels = await prisma.channel.findMany({
    where: { health: "OK", expiresAt: { not: null, lt: new Date(now.getTime() + REFRESH_AHEAD_MS) } },
    select: { id: true, brandId: true, name: true, network: true, credentialsEnc: true, extras: true },
    take: BATCH,
    orderBy: { expiresAt: "asc" },
  });
  let refreshed = 0;
  let failed = 0;
  for (const ch of channels) {
    const adapter = getAdapter(ch.network as Network, ch);
    if (!adapter?.refresh) continue;
    // Same per-channel lock as publish-post so a rotating refresh token is never used twice.
    const release = await tryLock(redis(), channelLockKey(ch.id));
    if (!release) continue; // a publish is running; it refreshes itself if needed, retry next cycle
    try {
      const current = await prisma.channel.findUnique({ where: { id: ch.id }, select: { credentialsEnc: true, expiresAt: true } });
      if (!current || (current.expiresAt && current.expiresAt.getTime() >= now.getTime() + REFRESH_AHEAD_MS)) continue;
      const next = await adapter.refresh(decryptCredentials(current.credentialsEnc));
      if (!next) continue;
      await prisma.channel.update({
        where: { id: ch.id },
        data: {
          credentialsEnc: encryptCredentials(next),
          expiresAt: typeof next.expiresAt === "number" ? new Date(next.expiresAt) : null,
        },
      });
      refreshed++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      if (isAdapterError(err) && err.kind === "auth") {
        await markNeedsReconnect(ch, message);
      } else {
        await prisma.channel.update({
          where: { id: ch.id },
          data: { lastError: json({ kind: isAdapterError(err) ? err.kind : "transient", message, at: now.toISOString(), during: "refresh" }) },
        });
      }
      log.warn({ err, channelId: ch.id }, "credential refresh failed");
    } finally {
      await release().catch(() => undefined);
    }
  }
  return { refreshed, failed };
}

/**
 * Lost-job recovery:
 *  - SCHEDULED groups overdue by > 2 min whose publish-group job is gone → enqueue now.
 *  - PUBLISHING groups locked > 30 min with no live child jobs → orphaned Posts become ERROR
 *    (outcome unknown) and the group is rolled up.
 */
export async function sweep(now = new Date()): Promise<{ requeued: number; settled: number }> {
  let requeued = 0;
  let settled = 0;

  const overdue = await prisma.postGroup.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lt: new Date(now.getTime() - SWEEP_GRACE_MS) } },
    select: { id: true, scheduledAt: true },
    take: BATCH,
    orderBy: { scheduledAt: "asc" },
  });
  for (const g of overdue) {
    if (!g.scheduledAt) continue;
    if (await hasLiveJob(QUEUES.publishGroup, jobIds.publishGroup(g.id, g.scheduledAt.getTime()))) continue;
    if (await enqueuePublishGroup(g.id, g.scheduledAt)) {
      requeued++;
      log.warn({ groupId: g.id, scheduledAt: g.scheduledAt }, "sweeper: re-enqueued lost publish-group job");
    }
  }

  const stuck = await prisma.postGroup.findMany({
    where: {
      status: "PUBLISHING",
      OR: [
        { lockedAt: { lt: new Date(now.getTime() - STUCK_PUBLISHING_MS) } },
        { lockedAt: null, updatedAt: { lt: new Date(now.getTime() - STUCK_PUBLISHING_MS) } },
      ],
    },
    select: { id: true, posts: { select: { id: true, status: true } } },
    take: BATCH,
  });
  for (const g of stuck) {
    const inFlight = g.posts.filter((p) => p.status === "PUBLISHING" || p.status === "SCHEDULED");
    let live = false;
    for (const p of inFlight) {
      if (await hasLiveJob(QUEUES.publishPost, jobIds.publishPost(p.id))) {
        live = true;
        break;
      }
    }
    if (live) continue;
    if (inFlight.length > 0) {
      await prisma.post.updateMany({
        where: { id: { in: inFlight.map((p) => p.id) }, status: { in: ["PUBLISHING", "SCHEDULED"] } },
        data: {
          status: "ERROR",
          error: json({
            kind: "unknown",
            message: "Publishing was interrupted — may have published — check the network before retrying",
            at: now.toISOString(),
          }),
        },
      });
    }
    await rollupGroup(g.id);
    settled++;
    log.warn({ groupId: g.id, orphaned: inFlight.length }, "sweeper: settled stuck PUBLISHING group");
  }

  return { requeued, settled };
}

export async function processMaintenance(job: Job): Promise<unknown> {
  switch (job.name) {
    case MAINTENANCE_JOBS.refreshCredentials.name:
      return refreshExpiringCredentials();
    case MAINTENANCE_JOBS.refillCredits.name:
      return { refilled: await refillCreditsIfDue(new Date()) };
    case MAINTENANCE_JOBS.sweep.name:
      return sweep();
    default:
      log.warn({ name: job.name }, "maintenance: unknown job");
      return { skipped: true };
  }
}

/** Register (idempotently) the repeatable maintenance jobs. */
export async function scheduleMaintenance(): Promise<void> {
  const q = queue(QUEUES.maintenance);
  for (const { name, everyMs } of Object.values(MAINTENANCE_JOBS)) {
    await q.upsertJobScheduler(name, { every: everyMs }, { name, data: {}, opts: { removeOnComplete: 100, removeOnFail: 500 } });
  }
  // Schedulers keep their next-run time across restarts; sweep once now to recover anything
  // that came due while the worker was down.
  await q.add(MAINTENANCE_JOBS.sweep.name, {}, { removeOnComplete: 100, removeOnFail: 500 });
}

export function startMaintenanceWorker() {
  const worker = new Worker(QUEUES.maintenance, processMaintenance, { connection: newRedis(), concurrency: 1 });
  worker.on("completed", (job, result) => log.debug({ name: job.name, result }, "maintenance done"));
  worker.on("failed", (job, err) => log.error({ name: job?.name, err }, "maintenance failed"));
  return worker;
}
