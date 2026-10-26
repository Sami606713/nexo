import "server-only";
import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import {
  QUEUES,
  jobIds,
  type AiGenerateJob,
  type DeletePostJob,
  type PublishGroupJob,
  type SyncJob,
  type WorkflowRunJob,
} from "@postline/core";

const g = globalThis as unknown as { __redis?: IORedis; __queues?: Map<string, Queue> };

function connection(): IORedis {
  g.__redis ??= new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6380", { maxRetriesPerRequest: null });
  return g.__redis;
}

function queue(name: string): Queue {
  g.__queues ??= new Map();
  let q = g.__queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: connection() });
    g.__queues.set(name, q);
  }
  return q;
}

const defaults: JobsOptions = { removeOnComplete: 1000, removeOnFail: 5000 };

/** Schedule (or publish now if `at` <= now) a PostGroup. Re-scheduling: call cancelGroupPublish first. */
export async function enqueueGroupPublish(groupId: string, at: Date) {
  const delay = Math.max(0, at.getTime() - Date.now());
  const data: PublishGroupJob = { groupId };
  await queue(QUEUES.publishGroup).add("publish-group", data, {
    ...defaults,
    delay,
    jobId: jobIds.publishGroup(groupId, at.getTime()),
  });
}

/** Remove any pending publish-group job for this group (any scheduled time). */
export async function cancelGroupPublish(groupId: string) {
  const q = queue(QUEUES.publishGroup);
  const jobs = await q.getJobs(["delayed", "waiting", "prioritized"]);
  await Promise.all(jobs.filter((j) => j.data?.groupId === groupId).map((j) => j.remove()));
}

/** Delete a published post on its network. Safe to delete the DB rows right after this resolves. */
export async function enqueueDeletePost(post: { id: string; channelId: string; externalId: string; partIds: string[] }) {
  const data: DeletePostJob = { postId: post.id, channelId: post.channelId, externalId: post.externalId, partIds: post.partIds };
  await queue(QUEUES.deletePost).add("delete-post", data, {
    ...defaults,
    jobId: jobIds.deletePost(post.id),
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
  });
}

export async function enqueueAiGenerate(job: AiGenerateJob) {
  await queue(QUEUES.aiGenerate).add(job.kind, job, { ...defaults, attempts: 2, backoff: { type: "exponential", delay: 5_000 } });
}

/** Queue one workflow run (webhook trigger, manual "Run now", inbox events). */
export async function enqueueWorkflowRun(job: WorkflowRunJob) {
  await queue(QUEUES.workflowRun).add("workflow-run", job, { ...defaults, attempts: 2, backoff: { type: "exponential", delay: 10_000 } });
}

export async function enqueueSync(job: SyncJob) {
  await queue(QUEUES.sync).add(job.kind, job, { ...defaults, attempts: 3, backoff: { type: "exponential", delay: 30_000 } });
}
