import { z } from "zod";
import { NETWORKS } from "./networks";

/** Request bodies shared by the internal API (apps/web route handlers) and the future public API. */

export const postChannelInput = z.object({
  channelId: z.string().min(1),
  captionOverride: z.string().nullable().optional(),
});

export const upsertPostGroupInput = z.object({
  caption: z.string().max(200_000).default(""),
  channels: z.array(postChannelInput).default([]),
  mediaIds: z.array(z.string()).max(35).default([]),
  labelIds: z.array(z.string()).default([]),
  options: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  notes: z.string().max(10_000).nullable().optional(),
  /** ISO datetime. null/absent = draft. */
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().nullable().optional(),
  /** true = publish immediately (skips 2-minute minimum). */
  publishNow: z.boolean().optional(),
  /** true = save as DRAFT even if scheduledAt is set (a planned time, e.g. campaign drafts). */
  keepDraft: z.boolean().optional(),
});
export type UpsertPostGroupInput = z.infer<typeof upsertPostGroupInput>;

export const requestApprovalInput = z.object({
  approverIds: z.array(z.string()).min(1, "Select at least one approver"),
  comment: z.string().max(2000).optional(),
});

export const decideApprovalInput = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(2000).optional(),
});

export const brandInput = z.object({
  name: z.string().min(1).max(120),
  website: z.string().url().nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  voice: z.string().max(2000).nullable().optional(),
  audience: z.string().max(2000).nullable().optional(),
  avoid: z.string().max(2000).nullable().optional(),
  timezone: z.string().optional(),
  weekStart: z.number().int().min(0).max(6).optional(),
  colors: z.array(z.string()).optional(),
  logos: z.array(z.object({ url: z.string().url(), kind: z.string().optional() })).optional(),
});

export const networkEnum = z.enum(NETWORKS);
