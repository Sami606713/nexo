export const POST_STATUSES = [
  "GENERATING",
  "DRAFT",
  "PENDING_APPROVAL",
  "SCHEDULED",
  "PUBLISHING",
  "POSTED",
  "NEEDS_ATTENTION",
  "ERROR",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/**
 * Derive a PostGroup's status from its per-channel Post statuses after a publish attempt.
 * All posted → POSTED; some posted → NEEDS_ATTENTION (never republish the ones that worked);
 * none posted and all finished → ERROR; anything still in flight → PUBLISHING.
 */
export function rollupGroupStatus(childStatuses: PostStatus[]): PostStatus {
  if (childStatuses.length === 0) return "ERROR";
  if (childStatuses.some((s) => s === "PUBLISHING" || s === "SCHEDULED")) return "PUBLISHING";
  const posted = childStatuses.filter((s) => s === "POSTED").length;
  if (posted === childStatuses.length) return "POSTED";
  if (posted > 0) return "NEEDS_ATTENTION";
  return "ERROR";
}

/** Statuses in which the editor must refuse edits. */
export const LOCKED_STATUSES: readonly PostStatus[] = ["PUBLISHING", "POSTED", "NEEDS_ATTENTION"];

/** Minimum lead time for scheduling (Publish now bypasses it). */
export const MIN_SCHEDULE_LEAD_MS = 2 * 60 * 1000;

export const STATUS_LABELS: Record<PostStatus, string> = {
  GENERATING: "Generating",
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing",
  POSTED: "Posted",
  NEEDS_ATTENTION: "Needs attention",
  ERROR: "Error",
};
