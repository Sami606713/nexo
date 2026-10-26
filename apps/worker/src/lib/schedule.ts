import type { CampaignPlanItem } from "@postline/core";
import { addDays, parseDate, parseTime, zonedTimeToUtc } from "./tz";

export const DEFAULT_CAMPAIGN_TIME = "09:00";

/**
 * UTC instant for a campaign item: brand-local `startDate` + `dayOffset` days at `time` (HH:mm).
 * dayOffset is clamped to [0, durationDays-1] when durationDays is given; bad times fall back to 09:00.
 */
export function campaignItemScheduledAt(
  startDate: string,
  item: Pick<CampaignPlanItem, "dayOffset" | "time">,
  timeZone: string,
  durationDays?: number,
): Date {
  const start = parseDate(startDate);
  if (!start) throw new Error(`Invalid campaign startDate: ${startDate}`);
  let offset = Number.isFinite(item.dayOffset) ? Math.max(0, Math.floor(item.dayOffset)) : 0;
  if (durationDays && durationDays > 0) offset = Math.min(offset, durationDays - 1);
  const day = addDays(start, offset);
  const time = parseTime(item.time ?? "") ?? parseTime(DEFAULT_CAMPAIGN_TIME)!;
  return zonedTimeToUtc({ ...day, ...time }, timeZone);
}

/** Parse `group:<groupId>:<scheduledAtMs>` (see jobIds.publishGroup). */
export function parsePublishGroupJobId(jobId: string | undefined): { groupId: string; scheduledAtMs: number } | null {
  if (!jobId) return null;
  const m = /^group:(.+):(\d+)$/.exec(jobId);
  if (!m) return null;
  return { groupId: m[1]!, scheduledAtMs: Number(m[2]) };
}

export type GroupJobDecision =
  | { run: true }
  | { run: false; reason: "missing" | "not_scheduled" | "no_schedule" | "rescheduled" | "too_early" };

/**
 * Decide whether a publish-group job should act. A job is stale when the group was
 * rescheduled (its scheduledAt no longer matches the time encoded in the job id), unscheduled,
 * or moved out of SCHEDULED (draft, approval, already publishing...).
 */
export function decideGroupJob(
  jobId: string | undefined,
  group: { status: string; scheduledAt: Date | null } | null,
  now: number,
): GroupJobDecision {
  if (!group) return { run: false, reason: "missing" };
  if (group.status !== "SCHEDULED") return { run: false, reason: "not_scheduled" };
  if (!group.scheduledAt) return { run: false, reason: "no_schedule" };
  const parsed = parsePublishGroupJobId(jobId);
  if (parsed) {
    if (parsed.scheduledAtMs !== group.scheduledAt.getTime()) return { run: false, reason: "rescheduled" };
    return { run: true };
  }
  // Job without an encoded time (manual enqueue): only run once the group is due (60s slack).
  if (group.scheduledAt.getTime() > now + 60_000) return { run: false, reason: "too_early" };
  return { run: true };
}

/** Sweeper: a SCHEDULED group is overdue (job presumably lost) after this grace period. */
export const SWEEP_GRACE_MS = 2 * 60_000;
/** Sweeper: a PUBLISHING group is stuck after this long with no live child jobs. */
export const STUCK_PUBLISHING_MS = 30 * 60_000;
