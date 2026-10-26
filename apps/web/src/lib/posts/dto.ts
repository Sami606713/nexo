import "server-only";
import type { Prisma } from "@postline/db";
import type { PostStatus } from "@postline/core";
import type { ApprovalDTO, ChannelDTO, MediaDTO, PostGroupDTO, UserLiteDTO } from "./types";

export const channelSelect = {
  id: true,
  network: true,
  name: true,
  username: true,
  avatarUrl: true,
  health: true,
} satisfies Prisma.ChannelSelect;

export const userLiteSelect = { id: true, name: true, email: true, image: true } satisfies Prisma.UserSelect;

export const groupInclude = {
  author: { select: userLiteSelect },
  posts: { include: { channel: { select: channelSelect } }, orderBy: { createdAt: "asc" } },
  media: { include: { media: true }, orderBy: { position: "asc" } },
  labels: { include: { label: true } },
  approval: true,
} satisfies Prisma.PostGroupInclude;

export type GroupWithRelations = Prisma.PostGroupGetPayload<{ include: typeof groupInclude }>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toChannelDTO(c: Prisma.ChannelGetPayload<{ select: typeof channelSelect }>): ChannelDTO {
  return { ...c, network: c.network, health: c.health };
}

export function toMediaDTO(m: {
  id: string;
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  sizeBytes: number;
  alt: string | null;
  createdAt: Date;
}): MediaDTO {
  return {
    id: m.id,
    url: m.url,
    mime: m.mime,
    width: m.width,
    height: m.height,
    duration: m.duration,
    sizeBytes: m.sizeBytes,
    alt: m.alt,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toApprovalDTO(a: GroupWithRelations["approval"]): ApprovalDTO | null {
  if (!a) return null;
  return {
    id: a.id,
    requestedBy: a.requestedBy,
    approverIds: a.approverIds,
    decision: a.decision === "approved" || a.decision === "rejected" ? a.decision : null,
    decidedBy: a.decidedBy,
    decidedAt: iso(a.decidedAt),
    comment: a.comment,
    createdAt: a.createdAt.toISOString(),
  };
}

function asOptions(v: Prisma.JsonValue): Record<string, Record<string, unknown>> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, Record<string, unknown>>;
}

function asError(v: Prisma.JsonValue | null): { message?: string; kind?: string } | null {
  if (v == null) return null;
  if (typeof v === "string") return { message: v };
  if (typeof v === "object" && !Array.isArray(v)) return v as { message?: string; kind?: string };
  return { message: String(v) };
}

export function toGroupDTO(g: GroupWithRelations): PostGroupDTO {
  const author: UserLiteDTO | null = g.author ?? null;
  return {
    id: g.id,
    brandId: g.brandId,
    authorId: g.authorId,
    author,
    caption: g.caption,
    status: g.status as PostStatus,
    scheduledAt: iso(g.scheduledAt),
    timezone: g.timezone,
    options: asOptions(g.options),
    notes: g.notes,
    score: g.score,
    lockedAt: iso(g.lockedAt),
    publishedAt: iso(g.publishedAt),
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    posts: g.posts.map((p) => ({
      id: p.id,
      channelId: p.channelId,
      channel: toChannelDTO(p.channel),
      captionOverride: p.captionOverride,
      status: p.status as PostStatus,
      url: p.url,
      error: asError(p.error),
      publishedAt: iso(p.publishedAt),
    })),
    media: g.media.map((pm) => toMediaDTO(pm.media)),
    labels: g.labels.map((pl) => ({ id: pl.label.id, name: pl.label.name, color: pl.label.color })),
    approval: toApprovalDTO(g.approval),
  };
}
