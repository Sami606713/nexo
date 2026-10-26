import { prisma } from "@postline/db";
import { notFound, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { hashtagLibrarySchema } from "@/lib/platform-schemas";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "settings.other");
  const data = await parseBody(req, hashtagLibrarySchema.partial());
  const found = await prisma.hashtagLibrary.findFirst({ where: { id, brandId }, select: { id: true } });
  if (!found) throw notFound("Library not found");
  return prisma.hashtagLibrary.update({ where: { id }, data });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "settings.other");
  await prisma.hashtagLibrary.deleteMany({ where: { id, brandId } });
  return { ok: true };
});
