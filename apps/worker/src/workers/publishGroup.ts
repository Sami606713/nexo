import { Worker, type Job } from "bullmq";
import { prisma } from "@postline/db";
import { QUEUES, type PublishGroupJob } from "@postline/core";
import { log } from "../log";
import { enqueuePublishPost, newRedis } from "../queues";
import { decideGroupJob } from "../lib/schedule";
import { rollupGroup } from "../lib/db";

export async function processPublishGroup(job: Job<PublishGroupJob>): Promise<{ fannedOut: number } | { skipped: string }> {
  const { groupId } = job.data;
  const group = await prisma.postGroup.findUnique({
    where: { id: groupId },
    select: { id: true, status: true, scheduledAt: true, posts: { select: { id: true, status: true } } },
  });

  const decision = decideGroupJob(job.id, group, Date.now());
  if (!decision.run) {
    log.info({ groupId, jobId: job.id, reason: decision.reason }, "publish-group: stale/no-op");
    return { skipped: decision.reason };
  }

  // Atomic SCHEDULED → PUBLISHING; guards against two workers (or web + sweeper duplicates).
  const claimed = await prisma.postGroup.updateMany({
    where: { id: groupId, status: "SCHEDULED", scheduledAt: group!.scheduledAt },
    data: { status: "PUBLISHING", lockedAt: new Date() },
  });
  if (claimed.count === 0) {
    log.info({ groupId }, "publish-group: lost claim race");
    return { skipped: "claimed_elsewhere" };
  }

  const pending = group!.posts.filter((p) => p.status !== "POSTED");
  try {
    if (pending.length > 0) {
      await prisma.post.updateMany({
        where: { id: { in: pending.map((p) => p.id) }, status: { not: "POSTED" } },
        data: { status: "PUBLISHING" },
      });
    }
    for (const p of pending) await enqueuePublishPost(p.id);
  } catch (err) {
    // Fan-out failed (e.g. Redis hiccup): release the claim so the group is SCHEDULED again and
    // the sweeper re-enqueues it, instead of leaving it stuck in PUBLISHING. Child jobs that did
    // get enqueued see a non-PUBLISHING post and skip.
    log.error({ err, groupId }, "publish-group: fan-out failed, reverting claim");
    await prisma.$transaction([
      prisma.post.updateMany({ where: { groupId, status: "PUBLISHING" }, data: { status: "SCHEDULED" } }),
      prisma.postGroup.updateMany({ where: { id: groupId, status: "PUBLISHING" }, data: { status: "SCHEDULED", lockedAt: null } }),
    ]);
    throw err;
  }

  // No children to wait on (no posts, or all already posted) → settle now.
  if (pending.length === 0) await rollupGroup(groupId);

  log.info({ groupId, posts: pending.length }, "publish-group: fanned out");
  return { fannedOut: pending.length };
}

export function startPublishGroupWorker() {
  const worker = new Worker<PublishGroupJob>(QUEUES.publishGroup, processPublishGroup, {
    connection: newRedis(),
    concurrency: 5,
  });
  worker.on("failed", (job, err) => log.error({ jobId: job?.id, err }, "publish-group failed"));
  return worker;
}
