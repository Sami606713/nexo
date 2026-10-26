import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { QUEUES, jobIds, type PublishGroupJob, type PublishPostJob } from "@postline/core";
import { PUBLISH_BACKOFF_TYPE, PUBLISH_POST_ATTEMPTS, PUBLISH_POST_BACKOFF_MS } from "./lib/failure";

export const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6380";

let shared: IORedis | undefined;

/** Shared connection for Queues and ad-hoc commands (locks). BullMQ requires maxRetriesPerRequest: null. */
export function redis(): IORedis {
  shared ??= new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  return shared;
}

/** Fresh connection (workers get their own so blocking commands don't stall queue ops). */
const owned: IORedis[] = [];
export function newRedis(): IORedis {
  const c = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  owned.push(c);
  return c;
}

const queues = new Map<string, Queue>();

export function queue(name: string): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: redis() });
    queues.set(name, q);
  }
  return q;
}

/** Same defaults as apps/web/src/lib/queue.ts. */
export const jobDefaults: JobsOptions = { removeOnComplete: 1000, removeOnFail: 5000 };

const LIVE_STATES = new Set(["active", "waiting", "delayed", "prioritized", "waiting-children"]);

/** True when a job with this id exists and has not finished. */
export async function hasLiveJob(queueName: string, jobId: string): Promise<boolean> {
  const job = await queue(queueName).getJob(jobId);
  if (!job) return false;
  return LIVE_STATES.has(await job.getState());
}

/**
 * Remove a finished (completed/failed) job so its id can be reused. BullMQ ignores `add` for an
 * existing id, which would otherwise make a deliberate re-publish a silent no-op.
 */
async function clearFinished(queueName: string, jobId: string): Promise<"live" | "cleared" | "none"> {
  const job = await queue(queueName).getJob(jobId);
  if (!job) return "none";
  const state = await job.getState();
  if (LIVE_STATES.has(state)) return "live";
  try {
    await job.remove();
  } catch {
    // Locked/being removed concurrently — treat as live to stay idempotent.
    return "live";
  }
  return "cleared";
}

/** Enqueue publish-post (idempotent on jobId `post:<id>`). Returns false if a live job already exists. */
export async function enqueuePublishPost(postId: string): Promise<boolean> {
  const id = jobIds.publishPost(postId);
  if ((await clearFinished(QUEUES.publishPost, id)) === "live") return false;
  const data: PublishPostJob = { postId };
  await queue(QUEUES.publishPost).add("publish-post", data, {
    ...jobDefaults,
    jobId: id,
    attempts: PUBLISH_POST_ATTEMPTS,
    backoff: { type: PUBLISH_BACKOFF_TYPE, delay: PUBLISH_POST_BACKOFF_MS },
  });
  return true;
}

/** Enqueue publish-group for `scheduledAt` (same jobId convention as web). Runs immediately if due. */
export async function enqueuePublishGroup(groupId: string, scheduledAt: Date): Promise<boolean> {
  const id = jobIds.publishGroup(groupId, scheduledAt.getTime());
  if ((await clearFinished(QUEUES.publishGroup, id)) === "live") return false;
  const data: PublishGroupJob = { groupId };
  await queue(QUEUES.publishGroup).add("publish-group", data, {
    ...jobDefaults,
    jobId: id,
    delay: Math.max(0, scheduledAt.getTime() - Date.now()),
  });
  return true;
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
  await Promise.allSettled(owned.splice(0).map((c) => c.quit().catch(() => c.disconnect())));
  if (shared) {
    await shared.quit().catch(() => shared?.disconnect());
    shared = undefined;
  }
}
