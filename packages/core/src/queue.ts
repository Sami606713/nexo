/** Queue names and job payloads shared by apps/web (producer) and apps/worker (consumer). */
export const QUEUES = {
  /** One job per PostGroup at its scheduled time; fans out to publish-post. */
  publishGroup: "publish-group",
  /** One job per (PostGroup × Channel). jobId = `post:${postId}` for idempotency. */
  publishPost: "publish-post",
  /** Delete a published post on the network. */
  deletePost: "delete-post",
  /** AI generation (single post drafts, campaigns). */
  aiGenerate: "ai-generate",
  /** Periodic maintenance: token refresh, credit refills. */
  maintenance: "maintenance",
  /** Execute one workflow run (trigger payload → steps). */
  workflowRun: "workflow-run",
  /** Periodic trigger polling (schedule / RSS / WooCommerce). */
  workflowTriggers: "workflow-triggers",
  /** Pull inbox conversations and post/channel metrics from networks. */
  sync: "sync",
} as const;

export interface WorkflowRunJob {
  workflowId: string;
  /** Trigger payload, e.g. {title, link, summary} for RSS, request body for webhook, {text, authorName, ...} for comments. */
  input: Record<string, unknown>;
  /** true = manual "Run now"/test run. */
  manual?: boolean;
}

export type SyncJob =
  | { kind: "inbox"; channelId: string }
  | { kind: "post-metrics"; postId: string }
  | { kind: "channel-metrics"; channelId: string };

export interface PublishGroupJob {
  groupId: string;
}
export interface PublishPostJob {
  postId: string;
}
/**
 * Self-contained snapshot: the web layer deletes the PostGroup/Post rows right after enqueueing,
 * so the worker must not depend on them existing.
 */
export interface DeletePostJob {
  postId: string;
  channelId: string;
  externalId: string;
  partIds: string[];
}
export type AiGenerateJob =
  | { kind: "post"; groupId: string; brandId: string; actorId: string; request: import("./ai").GeneratePostRequest }
  | { kind: "campaign"; campaignId: string; brandId: string; actorId: string; request: import("./ai").CampaignRequest };

/** BullMQ rejects custom ids containing ":" unless they split into exactly 3 parts. */
export const jobIds = {
  publishGroup: (groupId: string, scheduledAtMs: number) => `group:${groupId}:${scheduledAtMs}`,
  publishPost: (postId: string) => `post-${postId}`,
  deletePost: (postId: string) => `delete-${postId}`,
};
