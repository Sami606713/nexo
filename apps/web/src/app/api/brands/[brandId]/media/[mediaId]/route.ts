import { z } from "zod";
import { prisma } from "@postline/db";
import { conflict, notFound, route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { storage } from "@/lib/storage";
import { toMediaDTO } from "@/lib/posts/dto";

type Ctx = { params: Promise<{ brandId: string; mediaId: string }> };

const patchInput = z.object({ alt: z.string().max(1000).nullable() });

async function load(brandId: string, mediaId: string) {
  const m = await prisma.mediaAsset.findFirst({ where: { id: mediaId, brandId } });
  if (!m) throw notFound("Media not found");
  return m;
}

/** Update alt text. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, mediaId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  await load(access.brand.id, mediaId);
  const { alt } = await readBody(req, patchInput);
  const m = await prisma.mediaAsset.update({ where: { id: mediaId }, data: { alt: alt?.trim() || null } });
  return toMediaDTO(m);
});

/** Delete a media asset that isn't attached to any post. */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, mediaId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const m = await load(access.brand.id, mediaId);
  const used = await prisma.postMedia.count({ where: { mediaId } });
  if (used) throw conflict("This file is used by a post");
  await prisma.mediaAsset.delete({ where: { id: mediaId } });
  if (m.key) await storage().delete(m.key).catch(() => undefined);
  return { ok: true };
});
