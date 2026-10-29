/**
 * OWNED BY: inbox agent. Social inbox sync — consumer of QUEUES.sync for job kind "inbox" ONLY
 * (metrics use their own queue). Every 2 minutes a scheduler job fans out one sync per channel
 * with inboxEnabled; the web app also enqueues {kind:"inbox", channelId} on manual refresh / Meta webhooks.
 *
 * Per channel: decrypt credentials → provider.fetch(since Channel.extras.inboxSyncedAt) → upsert
 * Conversation (channelId+kind+externalId) + Message (dedupe by externalId) → bump unread/lastMessageAt/preview
 * → queue workflow runs for matching new_comment / new_mention / new_dm triggers.
 */
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { prisma, Prisma } from "@postline/db";
import { QUEUES, type Network, type SyncJob, type WorkflowRunJob } from "@postline/core";
import { decryptCredentials } from "@postline/core/crypto";
import { getInboxProvider, type InboxItem, type InboxKind, type InboxProvider } from "@postline/integrations";
import { isAdapterError } from "../lib/failure";
import { markNeedsReconnect } from "../lib/db";

export const INBOX_SCAN_JOB = "inbox-scan";
export const INBOX_SCAN_EVERY_MS = 2 * 60_000;
/** Re-read a little before the last sync so items indexed late aren't missed (dedupe makes this safe). */
const OVERLAP_MS = 5 * 60_000;
/** First sync looks back this far. */
const FIRST_SYNC_LOOKBACK_MS = 7 * 24 * 3600_000;
const PREVIEW_LEN = 140;

interface MinimalLog {
  debug?: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

const TRIGGER_BY_KIND: Record<InboxKind, "new_comment" | "new_mention" | "new_dm"> = {
  COMMENT: "new_comment",
  MENTION: "new_mention",
  DM: "new_dm",
};

export interface InboxEvent {
  kind: InboxKind;
  channelId: string;
  conversationId: string;
  text: string;
  authorName: string;
  authorHandle?: string;
  postExternalId?: string;
}

export interface SyncDeps {
  provider?: (network: Network, channel?: { extras?: unknown }) => InboxProvider | undefined;
  /** Queue a workflow run (defaults to QUEUES.workflowRun). */
  enqueueWorkflowRun?: (job: WorkflowRunJob) => Promise<unknown>;
  now?: () => Date;
}

export interface SyncResult {
  skipped?: string;
  fetched: number;
  newMessages: number;
  newConversations: number;
  workflowRuns: number;
}

const preview = (t: string) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > PREVIEW_LEN ? `${s.slice(0, PREVIEW_LEN - 1)}…` : s;
};

let workflowQueue: Queue | undefined;
let defaultConnection: ConnectionOptions | undefined;
async function defaultEnqueueWorkflowRun(job: WorkflowRunJob) {
  if (!defaultConnection) throw new Error("sync worker not started");
  workflowQueue ??= new Queue(QUEUES.workflowRun, { connection: defaultConnection });
  return workflowQueue.add("workflow-run", job, {
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 2,
    backoff: { type: "exponential", delay: 10_000 },
  });
}

/** Queue one run per active workflow of the brand whose inbox trigger matches. Never throws. */
export async function dispatchInboxWorkflows(
  brandId: string,
  event: InboxEvent,
  enqueue: (job: WorkflowRunJob) => Promise<unknown> = defaultEnqueueWorkflowRun,
  log?: MinimalLog,
): Promise<number> {
  const type = TRIGGER_BY_KIND[event.kind];
  try {
    const workflows = await prisma.workflow.findMany({ where: { brandId, active: true }, select: { id: true, trigger: true } });
    let queued = 0;
    for (const wf of workflows) {
      const trigger = (wf.trigger ?? {}) as { type?: string; config?: { channelId?: string | null; postExternalId?: string | null } };
      if (trigger.type !== type) continue;
      const cfg = trigger.config ?? {};
      if (cfg.channelId && cfg.channelId !== event.channelId) continue;
      if (type === "new_comment" && cfg.postExternalId && cfg.postExternalId !== event.postExternalId) continue;
      await enqueue({
        workflowId: wf.id,
        input: {
          text: event.text,
          authorName: event.authorName,
          authorHandle: event.authorHandle ?? "",
          conversationId: event.conversationId,
          channelId: event.channelId,
          postExternalId: event.postExternalId ?? "",
          eventType: type,
        },
      });
      queued++;
    }
    return queued;
  } catch (err) {
    log?.warn({ err, brandId }, "inbox: workflow dispatch failed");
    return 0;
  }
}

/** Persist fetched items. Returns the new inbound items (for workflow dispatch). Exported for tests. */
export async function ingestItems(
  channel: { id: string; brandId: string },
  items: InboxItem[],
): Promise<{ newMessages: number; newConversations: number; events: InboxEvent[] }> {
  const sorted = [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let newMessages = 0;
  let newConversations = 0;
  const events: InboxEvent[] = [];
  const postIdCache = new Map<string, string | null>();

  for (const item of sorted) {
    const inbound = (item.direction ?? "IN") === "IN";
    let conv = await prisma.conversation.findUnique({
      where: { channelId_kind_externalId: { channelId: channel.id, kind: item.kind, externalId: item.conversationExternalId } },
      select: { id: true, lastMessageAt: true, status: true },
    });
    if (!conv) {
      let postId: string | null = null;
      if (item.postExternalId) {
        if (!postIdCache.has(item.postExternalId)) {
          const p = await prisma.post.findFirst({ where: { channelId: channel.id, externalId: item.postExternalId }, select: { id: true } });
          postIdCache.set(item.postExternalId, p?.id ?? null);
        }
        postId = postIdCache.get(item.postExternalId) ?? null;
      }
      try {
        conv = await prisma.conversation.create({
          data: {
            brandId: channel.brandId,
            channelId: channel.id,
            kind: item.kind,
            externalId: item.conversationExternalId,
            postExternalId: item.postExternalId ?? null,
            postId,
            participantName: inbound ? item.authorName : "Unknown",
            participantHandle: inbound ? (item.authorHandle ?? null) : null,
            participantAvatar: inbound ? (item.authorAvatar ?? null) : null,
            unread: false,
            lastMessageAt: new Date(0),
          },
          select: { id: true, lastMessageAt: true, status: true },
        });
        newConversations++;
      } catch (err) {
        // Concurrent sync created it first.
        if ((err as { code?: string }).code !== "P2002") throw err;
        conv = await prisma.conversation.findUniqueOrThrow({
          where: { channelId_kind_externalId: { channelId: channel.id, kind: item.kind, externalId: item.conversationExternalId } },
          select: { id: true, lastMessageAt: true, status: true },
        });
      }
    }

    const exists = await prisma.message.findFirst({ where: { conversationId: conv.id, externalId: item.messageExternalId }, select: { id: true } });
    if (exists) continue;
    const isFirst = (await prisma.message.count({ where: { conversationId: conv.id } })) === 0;
    // The post context (excerpt) rides on the first message so the thread view can show it without a schema change.
    const attachments: Prisma.InputJsonValue[] = [];
    if (isFirst && (item.postExcerpt || item.url)) attachments.push({ type: "post_context", text: item.postExcerpt ?? null, url: item.url ?? null });
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: inbound ? "IN" : "OUT",
        authorName: item.authorName,
        text: item.text,
        externalId: item.messageExternalId,
        attachments,
        createdAt: item.createdAt,
      },
    });
    newMessages++;

    const newer = item.createdAt.getTime() >= conv.lastMessageAt.getTime();
    await prisma.conversation.update({
      where: { id: conv.id },
      data: {
        ...(newer ? { lastMessageAt: item.createdAt, lastMessagePreview: preview(item.text) } : {}),
        ...(inbound ? { unread: true, ...(conv.status === "RESOLVED" ? { status: "OPEN" } : {}) } : {}),
        ...(inbound ? { participantName: item.authorName, participantHandle: item.authorHandle ?? undefined, participantAvatar: item.authorAvatar ?? undefined } : {}),
      },
    });
    if (newer) conv = { ...conv, lastMessageAt: item.createdAt };

    if (inbound)
      events.push({
        kind: item.kind,
        channelId: channel.id,
        conversationId: conv.id,
        text: item.text,
        authorName: item.authorName,
        authorHandle: item.authorHandle,
        postExternalId: item.postExternalId,
      });
  }
  return { newMessages, newConversations, events };
}

/** Sync one channel's inbox. */
export async function syncChannelInbox(channelId: string, deps: SyncDeps = {}, log?: MinimalLog): Promise<SyncResult> {
  const now = (deps.now ?? (() => new Date()))();
  const empty = (skipped: string): SyncResult => ({ skipped, fetched: 0, newMessages: 0, newConversations: 0, workflowRuns: 0 });
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, brandId: true, name: true, network: true, externalId: true, credentialsEnc: true, extras: true, inboxEnabled: true, health: true },
  });
  if (!channel) return empty("channel not found");
  if (!channel.inboxEnabled) return empty("inbox disabled");
  if (channel.health === "NEEDS_RECONNECT") return empty("needs reconnect");
  const extras = (channel.extras ?? {}) as Record<string, unknown>;
  if (extras.demo === true) return empty("demo channel");
  const provider = (deps.provider ?? getInboxProvider)(channel.network as Network, channel);
  if (!provider) return empty("no inbox provider");

  const syncedAt = typeof extras.inboxSyncedAt === "string" ? new Date(extras.inboxSyncedAt) : null;
  const since = syncedAt && !Number.isNaN(syncedAt.getTime())
    ? new Date(syncedAt.getTime() - OVERLAP_MS)
    : new Date(now.getTime() - FIRST_SYNC_LOOKBACK_MS);

  let items: InboxItem[];
  try {
    items = await provider.fetch(decryptCredentials(channel.credentialsEnc), { ...extras, externalId: channel.externalId }, since);
  } catch (err) {
    if (isAdapterError(err) && err.kind === "auth") {
      await markNeedsReconnect(channel, err.message);
      return empty("auth error");
    }
    throw err;
  }

  const { newMessages, newConversations, events } = await ingestItems(channel, items);

  // Merge into the latest extras (don't clobber concurrent edits).
  const latest = await prisma.channel.findUnique({ where: { id: channel.id }, select: { extras: true } });
  await prisma.channel.update({
    where: { id: channel.id },
    data: { extras: { ...((latest?.extras ?? {}) as Record<string, unknown>), inboxSyncedAt: now.toISOString() } as Prisma.InputJsonValue },
  });

  let workflowRuns = 0;
  for (const ev of events) workflowRuns += await dispatchInboxWorkflows(channel.brandId, ev, deps.enqueueWorkflowRun, log);
  return { fetched: items.length, newMessages, newConversations, workflowRuns };
}

/** Fan out one inbox sync per inbox-enabled channel (skips demo channels and channels without a provider). */
export async function enqueueInboxScan(queue: Queue): Promise<number> {
  const channels = await prisma.channel.findMany({
    where: { inboxEnabled: true, health: { not: "NEEDS_RECONNECT" } },
    select: { id: true, network: true, extras: true },
  });
  let n = 0;
  const bucket = Math.floor(Date.now() / INBOX_SCAN_EVERY_MS);
  for (const ch of channels) {
    if ((ch.extras as Record<string, unknown> | null)?.demo === true) continue;
    if (!getInboxProvider(ch.network as Network, ch)) continue;
    const data: SyncJob = { kind: "inbox", channelId: ch.id };
    // jobId per channel per 2-min bucket: a slow sync never piles up duplicates.
    await queue.add("inbox", data, { jobId: `inbox-${ch.id}-${bucket}`, removeOnComplete: 200, removeOnFail: 500, attempts: 2, backoff: { type: "exponential", delay: 30_000 } });
    n++;
  }
  return n;
}

/**
 * Start the QUEUES.sync consumer (inbox only) and register the 2-minute scan scheduler.
 * Returns the Worker and Queue — close both on shutdown.
 */
export function startSyncWorkers(connection: ConnectionOptions, log: MinimalLog): { worker: Worker; queue: Queue } {
  defaultConnection = connection;
  const queue = new Queue(QUEUES.sync, { connection });
  const worker = new Worker(
    QUEUES.sync,
    async (job: Job) => {
      if (job.name === INBOX_SCAN_JOB) return { queued: await enqueueInboxScan(queue) };
      const data = job.data as Partial<SyncJob> | undefined;
      if (data?.kind !== "inbox" || !("channelId" in data) || !data.channelId) return { skipped: "not an inbox job" };
      const result = await syncChannelInbox(data.channelId, {}, log);
      if (result.newMessages) log.info({ channelId: data.channelId, ...result }, "inbox synced");
      return result;
    },
    { connection, concurrency: 4 },
  );
  worker.on("failed", (job, err) => log.warn({ err: err.message, jobId: job?.id, data: job?.data }, "inbox sync failed"));
  worker.on("error", (err) => log.error({ err }, "sync worker error"));
  worker.on("closed", () => {
    void workflowQueue?.close();
    workflowQueue = undefined;
  });
  void queue
    .upsertJobScheduler(INBOX_SCAN_JOB, { every: INBOX_SCAN_EVERY_MS }, { name: INBOX_SCAN_JOB, data: {}, opts: { removeOnComplete: 50, removeOnFail: 50 } })
    .catch((err) => log.error({ err }, "failed to schedule inbox scan"));
  return { worker, queue };
}
