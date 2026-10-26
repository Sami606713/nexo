import { DelayedError, UnrecoverableError, Worker, type Job } from "bullmq";
import { prisma, Prisma } from "@postline/db";
import { QUEUES, type Network, type PublishPostJob } from "@postline/core";
import { decryptCredentials, encryptCredentials } from "@postline/core/crypto";
import { getAdapter } from "@postline/integrations";
import { log } from "../log";
import { newRedis, redis } from "../queues";
import { blockingIssues, composePost } from "../lib/compose";
import {
  PUBLISH_BACKOFF_TYPE,
  PUBLISH_POST_ATTEMPTS,
  PUBLISH_POST_BACKOFF_MS,
  classifyFailure,
  computeBackoffMs,
  type PostErrorJson,
} from "../lib/failure";
import { channelLockKey, tryLock } from "../lib/lock";
import { json, markNeedsReconnect, rollupGroup } from "../lib/db";

const REFRESH_WINDOW_MS = 5 * 60_000;
const LOCK_RETRY_MS = 5_000;

async function loadPost(postId: string) {
  return prisma.post.findUnique({
    where: { id: postId },
    include: {
      channel: true,
      group: {
        select: {
          id: true,
          caption: true,
          options: true,
          status: true,
          media: { select: { position: true, media: true } },
        },
      },
    },
  });
}

async function markPostError(postId: string, error: PostErrorJson, incrementAttempts = true) {
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: "ERROR",
      error: json({ ...error, at: new Date().toISOString() }),
      ...(incrementAttempts ? { attempts: { increment: 1 } } : {}),
    },
  });
}

export async function processPublishPost(job: Job<PublishPostJob>, token?: string): Promise<unknown> {
  const { postId } = job.data;
  const post = await loadPost(postId);
  if (!post) {
    log.warn({ postId }, "publish-post: post not found");
    return { skipped: "missing" };
  }
  if (post.status === "POSTED") return { skipped: "already_posted" };
  if (post.status !== "PUBLISHING") {
    // Group was cancelled/edited after fan-out; don't publish something the user pulled back.
    log.info({ postId, status: post.status }, "publish-post: not in PUBLISHING, skipping");
    return { skipped: `status_${post.status}` };
  }

  // Serialise per channel (BullMQ OSS has no group concurrency).
  const release = await tryLock(redis(), channelLockKey(post.channelId));
  if (!release) {
    await job.moveToDelayed(Date.now() + LOCK_RETRY_MS, token);
    throw new DelayedError();
  }

  try {
    return await publishLocked(job, post);
  } finally {
    await release().catch((err) => log.warn({ err, postId }, "failed to release channel lock"));
  }
}

type LoadedPost = NonNullable<Awaited<ReturnType<typeof loadPost>>>;

async function publishLocked(job: Job<PublishPostJob>, post: LoadedPost): Promise<unknown> {
  const { channel, group } = post;
  const network = channel.network as Network;
  const plog = log.child({ postId: post.id, groupId: group.id, channelId: channel.id, network, attempt: job.attemptsMade + 1 });

  // Demo channels (seed data / video demos) never reach a real network: simulate a successful publish.
  if ((channel.extras as Record<string, unknown> | null)?.demo === true) {
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: "POSTED",
        externalId: `demo-${post.id}`,
        url: null,
        publishedAt: new Date(),
        error: Prisma.DbNull,
        attempts: { increment: 1 },
      },
    });
    plog.info("published (demo channel, simulated)");
    await rollupGroup(group.id);
    return { externalId: `demo-${post.id}`, url: null };
  }

  const adapter = getAdapter(network);
  if (!adapter) {
    await markPostError(post.id, { kind: "unsupported", message: "network not supported yet" });
    await rollupGroup(group.id);
    throw new UnrecoverableError("network not supported yet");
  }

  const composed = composePost({ post, group, channel, media: group.media });

  try {
    // Re-read credentials under the channel lock: maintenance (or a previous job) may have rotated
    // them since the post was loaded, and X refresh tokens are single-use.
    const fresh = await prisma.channel.findUnique({ where: { id: channel.id }, select: { credentialsEnc: true } });
    let credentials = decryptCredentials(fresh?.credentialsEnc ?? channel.credentialsEnc);

    if (
      adapter.refresh &&
      typeof credentials.expiresAt === "number" &&
      credentials.expiresAt - Date.now() < REFRESH_WINDOW_MS
    ) {
      const refreshed = await adapter.refresh(credentials);
      if (refreshed) {
        credentials = refreshed;
        await prisma.channel.update({
          where: { id: channel.id },
          data: {
            credentialsEnc: encryptCredentials(refreshed),
            expiresAt: typeof refreshed.expiresAt === "number" ? new Date(refreshed.expiresAt) : null,
          },
        });
        plog.info("credentials refreshed before publish");
      }
    }

    const errors = blockingIssues(adapter.validate(composed));
    if (errors.length > 0) {
      await markPostError(post.id, {
        kind: "validation",
        message: errors.map((e) => e.message).join("; "),
        details: { issues: errors },
      });
      await rollupGroup(group.id);
      plog.info({ issues: errors }, "publish-post: validation failed");
      throw new UnrecoverableError("validation failed");
    }

    const result = await adapter.publish(composed, credentials);
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: "POSTED",
        externalId: result.externalId,
        url: result.url,
        partIds: result.partIds ?? [],
        publishedAt: new Date(),
        error: Prisma.DbNull,
        attempts: { increment: 1 },
      },
    });
    if (channel.health !== "OK") {
      await prisma.channel.update({ where: { id: channel.id }, data: { health: "OK", lastError: Prisma.DbNull } });
    }
    plog.info({ externalId: result.externalId }, "published");
    await rollupGroup(group.id);
    return result;
  } catch (err) {
    if (err instanceof UnrecoverableError || err instanceof DelayedError) throw err;

    const maxAttempts = job.opts.attempts ?? 1;
    const outcome = classifyFailure(err, job.attemptsMade, maxAttempts);
    plog.warn({ err, action: outcome.action, kind: outcome.error.kind }, "publish-post failed");

    if (outcome.action === "retry") {
      await prisma.post.update({
        where: { id: post.id },
        data: { error: json({ ...outcome.error, at: new Date().toISOString() }), attempts: { increment: 1 } },
      });
      throw err instanceof Error ? err : new Error(String(err)); // BullMQ retries via custom backoff
    }

    await markPostError(post.id, outcome.error);
    if (outcome.action === "reconnect") await markNeedsReconnect(channel, outcome.error.message);
    await rollupGroup(group.id);
    throw new UnrecoverableError(outcome.error.message);
  }
}

export function startPublishPostWorker() {
  const worker = new Worker<PublishPostJob>(QUEUES.publishPost, processPublishPost, {
    connection: newRedis(),
    concurrency: 10,
    settings: {
      backoffStrategy: (attemptsMade, type, err) =>
        type === PUBLISH_BACKOFF_TYPE ? computeBackoffMs(attemptsMade, err, PUBLISH_POST_BACKOFF_MS) : -1,
    },
  });

  // Safety net: if a job dies outside our catch (e.g. stalled too often), make sure the Post
  // doesn't stay PUBLISHING forever. The sweeper also covers this.
  worker.on("failed", async (job, err) => {
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? PUBLISH_POST_ATTEMPTS);
    if (!(err instanceof UnrecoverableError) && !exhausted) return;
    try {
      const res = await prisma.post.updateMany({
        where: { id: job.data.postId, status: "PUBLISHING" },
        data: { status: "ERROR", error: json({ kind: "transient", message: err.message, at: new Date().toISOString() }) },
      });
      if (res.count > 0) {
        const p = await prisma.post.findUnique({ where: { id: job.data.postId }, select: { groupId: true } });
        if (p) await rollupGroup(p.groupId);
      }
    } catch (e) {
      log.error({ err: e, jobId: job.id }, "publish-post failed-handler error");
    }
  });
  return worker;
}
