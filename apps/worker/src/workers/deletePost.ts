import { UnrecoverableError, Worker, type Job } from "bullmq";
import { prisma, Prisma } from "@postline/db";
import { QUEUES, type DeletePostJob, type Network } from "@postline/core";
import { decryptCredentials } from "@postline/core/crypto";
import { getAdapter } from "@postline/integrations";
import { log } from "../log";
import { newRedis } from "../queues";
import { isAdapterError } from "../lib/failure";
import { json, markNeedsReconnect } from "../lib/db";

/**
 * Deletes a published post on its network. The job is a self-contained snapshot — web deletes
 * the DB rows right after enqueueing — so the Post row is optional: when it still exists the
 * outcome is recorded on Post.error.deleteResult, otherwise it is only logged.
 */
export async function processDeletePost(job: Job<DeletePostJob>): Promise<unknown> {
  const { postId, channelId, externalId } = job.data;
  const partIds = job.data.partIds ?? [];
  const dlog = log.child({ postId, channelId, externalId });

  const record = async (deleteResult: Record<string, unknown>, onSuccess = false) => {
    dlog.info({ deleteResult }, "delete-post result");
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { error: true } });
    if (!post) return;
    const base = post.error && typeof post.error === "object" && !Array.isArray(post.error) ? post.error : {};
    const data: Prisma.PostUpdateInput = {
      error: json({ ...base, deleteResult: { ...deleteResult, at: new Date().toISOString() } }),
      ...(onSuccess ? { externalId: null, url: null, partIds: [] } : {}),
    };
    await prisma.post.updateMany({ where: { id: postId }, data }); // updateMany: row may vanish concurrently
  };

  if (!externalId) {
    dlog.info("delete-post: nothing published, skipping");
    return { skipped: "not_published" };
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, brandId: true, name: true, network: true, credentialsEnc: true, extras: true },
  });
  if (!channel) {
    dlog.warn("delete-post: channel no longer exists, cannot delete on network");
    return { skipped: "channel_missing" };
  }

  if ((channel.extras as Record<string, unknown> | null)?.demo === true) {
    dlog.info("delete-post: demo channel, nothing to delete on a network");
    return { ok: true, demo: true };
  }

  const adapter = getAdapter(channel.network as Network, channel);
  if (!adapter?.delete) {
    await record({ ok: false, kind: "unsupported", message: "This network does not support deleting posts" });
    return { ok: false, reason: "unsupported" };
  }

  try {
    const creds = decryptCredentials(channel.credentialsEnc);
    const extras = (channel.extras ?? {}) as Record<string, unknown>;
    await adapter.delete(externalId, creds, extras, partIds.length > 0 ? partIds : undefined);
    await record({ ok: true }, true);
    return { ok: true };
  } catch (err) {
    const kind = isAdapterError(err) ? err.kind : "transient";
    const message = err instanceof Error ? err.message : String(err);
    if (kind === "rejected" || kind === "unknown") {
      await record({ ok: false, kind, message });
      return { ok: false, kind };
    }
    if (kind === "auth") {
      await record({ ok: false, kind, message });
      await markNeedsReconnect(channel, message);
      throw new UnrecoverableError(message);
    }
    // transient / rate_limit → BullMQ retries; record on the final attempt.
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await record({ ok: false, kind, message });
    throw err;
  }
}

export function startDeletePostWorker() {
  const worker = new Worker<DeletePostJob>(QUEUES.deletePost, processDeletePost, { connection: newRedis(), concurrency: 5 });
  worker.on("failed", (job, err) => log.error({ jobId: job?.id, err }, "delete-post failed"));
  return worker;
}
