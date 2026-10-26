import { prisma } from "@postline/db";
import { upsertPostGroupInput } from "@postline/core";
import { conflict, route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { cancelGroupPublish, enqueueDeletePost } from "@/lib/queue";
import { toGroupDTO } from "@/lib/posts/dto";
import { loadGroup, viewerFor } from "@/lib/posts/access";
import { inputFromGroup, savePostGroup } from "@/lib/posts/save";
import type { PostGroupDetailDTO } from "@/lib/posts/types";

type Ctx = { params: Promise<{ brandId: string; groupId: string }> };

const patchInput = upsertPostGroupInput.partial();

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId, groupId } = await params;
  const access = await requireBrand(brandId);
  const group = await loadGroup(access, groupId);
  const dto: PostGroupDetailDTO = { ...toGroupDTO(group), viewer: viewerFor(access, group) };
  return dto;
});

/** PATCH — any subset of upsertPostGroupInput; omitted fields keep their stored value. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, groupId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const existing = await loadGroup(access, groupId);
  const body = await readBody(req, patchInput);
  const base = inputFromGroup(existing);
  const merged = {
    ...base,
    ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)),
  } as typeof base;
  const { group, issues } = await savePostGroup(access, merged, existing);
  const dto: PostGroupDetailDTO = { ...toGroupDTO(group), viewer: viewerFor(access, group) };
  return { ...dto, channelIssues: issues };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, groupId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const group = await loadGroup(access, groupId);
  if (group.status === "PUBLISHING") {
    throw conflict("This post is publishing right now — try again in a moment");
  }

  try {
    await cancelGroupPublish(group.id);
  } catch (err) {
    console.error("[posts] cancelGroupPublish failed", err);
  }

  // Snapshot each published post so the worker can delete it on the network after the rows are gone.
  const published = group.posts.filter((p) => p.externalId);
  for (const p of published) {
    await enqueueDeletePost({ id: p.id, channelId: p.channelId, externalId: p.externalId!, partIds: p.partIds });
  }

  await prisma.postGroup.delete({ where: { id: group.id } });
  return { ok: true, deletedOnNetworks: published.length };
});
