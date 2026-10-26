import { z } from "zod";
import { prisma, type Prisma } from "@postline/db";
import { badRequest, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { sceneSchema } from "@/components/studio/scene-schema";
import { loadDesign, storeThumbnail, toDesignDTO } from "@/components/studio/server";
import { storage } from "@/lib/storage";

type Ctx = { params: Promise<{ brandId: string; designId: string }> };

export const runtime = "nodejs";

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId, designId } = await params;
  const access = await requireBrand(brandId);
  return toDesignDTO(await loadDesign(access.brand.id, designId), true);
});

const patchInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  format: z.string().trim().min(1).max(40).optional(),
  doc: sceneSchema.optional(),
  /** Small JPEG/PNG data URL used as the gallery thumbnail. */
  thumbnail: z.string().max(2_100_000).optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, designId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const existing = await loadDesign(access.brand.id, designId);
  const input = await parseBody(req, patchInput);
  if (JSON.stringify(input.doc ?? null).length > 6_000_000) throw badRequest("This design is too large to save");
  const data: Prisma.DesignUpdateInput = {};
  if (input.name) data.name = input.name;
  if (input.format) data.format = input.format;
  if (input.doc) {
    data.doc = input.doc as unknown as Prisma.InputJsonValue;
    data.width = input.doc.width;
    data.height = input.doc.height;
  }
  if (input.thumbnail) data.previewUrl = await storeThumbnail(access.brand.id, existing.id, input.thumbnail);
  const d = await prisma.design.update({ where: { id: existing.id }, data });
  return toDesignDTO(d);
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, designId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const d = await loadDesign(access.brand.id, designId);
  await prisma.design.delete({ where: { id: d.id } });
  for (const ext of ["jpg", "png", "webp"]) await storage().delete(`${access.brand.id}/studio/thumb-${d.id}.${ext}`);
  return { ok: true };
});
